// Page monitors (```viz monitor, prism.perf.watch): while at least one
// watching block is visible, every block reports what it measured about
// itself once per second (src/runtime/perf.ts) and each watcher receives a
// snapshot of its own page – the blocks in the same tab – plus the exact
// figures of web views and of Obsidian's processes (src/perf/process.ts).

import type PrismPlugin from "../../main";
import type { PrismFrame } from "../frame";
import type { BlockPerfStats, PerfEntry, PerfSnapshot } from "../protocol";
import { webBlocksIn } from "../online/web";
import { pidOfContents, sampleProcesses } from "./process";

const INTERVAL = 1000;
/** Stats older than this are treated as missing (block stopped reporting). */
const STALE = 3500;

export class PerfMonitor {
	private watchers = new Set<PrismFrame>();
	private stats = new WeakMap<PrismFrame, { stats: BlockPerfStats; at: number }>();
	private timer: number | null = null;
	/** Blocks are asked to report while this is true. */
	private collecting = false;

	constructor(private plugin: PrismPlugin) {}

	/** A block started or stopped watching (prism.perf.watch). */
	watch(frame: PrismFrame, on: boolean) {
		if (on) this.watchers.add(frame);
		else this.watchers.delete(frame);
		if (this.watchers.size && this.timer === null) {
			this.timer = window.setInterval(() => this.tick(), INTERVAL);
			this.tick();
		} else if (!this.watchers.size) this.stop();
	}

	/** A block was unloaded or re-rendered. */
	drop(frame: PrismFrame) {
		this.stats.delete(frame);
		if (this.watchers.has(frame)) this.watch(frame, false);
	}

	report(frame: PrismFrame, stats: BlockPerfStats) {
		this.stats.set(frame, { stats, at: Date.now() });
	}

	/** Whether a newly loaded block should start reporting. */
	get active(): boolean {
		return this.collecting;
	}

	dispose() {
		this.stop();
		this.watchers.clear();
	}

	private stop() {
		if (this.timer !== null) window.clearInterval(this.timer);
		this.timer = null;
		this.setCollecting(false);
	}

	private setCollecting(on: boolean) {
		if (on === this.collecting) return;
		this.collecting = on;
		this.plugin.frames.forEach((f) => f.setPerfReporting(on));
	}

	private tick() {
		const visible = Array.from(this.watchers).filter((w) => w.perfVisible);
		this.setCollecting(visible.length > 0);
		if (!visible.length) return;
		const processes = sampleProcesses();
		const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;
		for (const watcher of visible) watcher.sendPerfSnapshot(this.snapshot(watcher, processes, heap));
	}

	private snapshot(watcher: PrismFrame, processes: ReturnType<typeof sampleProcesses>, heap: number | null): PerfSnapshot {
		const scope = pageScope(watcher.containerEl);
		const now = Date.now();
		const blocks: PerfEntry[] = [];
		for (const frame of this.plugin.frames) {
			if (!inPage(frame.containerEl, scope)) continue;
			const entry = this.stats.get(frame);
			const fresh = entry && now - entry.at < STALE ? entry.stats : null;
			blocks.push({
				key: frame.spec.blockKey,
				label: blockLabel(frame),
				kind: this.watchers.has(frame) ? "monitor" : "block",
				line: frame.spec.lines?.start,
				state: fresh ? "running" : frame.isLoaded ? "loading" : "off",
				cpu: fresh ? (fresh.cpuMs / Math.max(1, fresh.periodMs)) * 100 : frame.isLoaded ? null : 0,
				memory: fresh ? fresh.graphicsBytes : null,
				nodes: fresh ? fresh.nodes : null,
				startupMs: fresh ? fresh.startupMs : null,
				exact: false,
			});
		}
		for (const web of webBlocksIn(scope)) {
			const pid = web.contentsId !== null ? pidOfContents(web.contentsId) : null;
			const proc = pid !== null ? processes?.byPid.get(pid) ?? null : null;
			blocks.push({
				key: web.key,
				label: web.label,
				kind: "web",
				line: web.line,
				state: proc ? "running" : web.loaded ? "loading" : "off",
				cpu: proc ? proc.cpu : null,
				memory: proc ? proc.memory : null,
				nodes: null,
				startupMs: null,
				exact: !!proc,
			});
		}
		const page = blocks.reduce((sum, b) => ({ cpu: sum.cpu + (b.cpu ?? 0), memory: sum.memory + (b.memory ?? 0), blocks: sum.blocks + 1 }), { cpu: 0, memory: 0, blocks: 0 });
		return { time: now, page, blocks, obsidian: { window: processes?.window ?? null, gpu: processes?.gpu ?? null, app: processes?.app ?? null, heapBytes: heap } };
	}
}

/** The page a block is on: its tab (or the headless render container). */
function pageScope(el: HTMLElement): HTMLElement {
	return el.closest<HTMLElement>(".workspace-leaf, .prism-headless, .hover-popover") ?? el.ownerDocument.body;
}

/** In the same page and actually displayed (not the hidden reading/editing view of the tab). */
export function inPage(el: HTMLElement, scope: HTMLElement): boolean {
	return el.isConnected && scope.contains(el) && el.getClientRects().length > 0;
}

function blockLabel(frame: PrismFrame): string {
	const s = frame.spec;
	if (s.options.title) return s.options.title;
	if (s.kind !== "codeblock") return s.sourcePath.split("/").pop() ?? s.sourcePath;
	const index = s.blockIndex !== undefined ? `Block ${s.blockIndex + 1}` : "Block";
	return s.lines ? `${index} (line ${s.lines.start})` : index;
}
