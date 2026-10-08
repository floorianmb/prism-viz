// ```viz monitor / prism.monitor(): RAM (MB) and CPU (% of the whole machine)
// of the page the block is on, updated every second. Data comes from
// prism.perf.watch() (see src/perf/monitor.ts for how it is measured).

import type { PerfSnapshot } from "../protocol";

/** No options yet; kept so prism.monitor(target, options) stays stable. */
export type MonitorOptions = Record<string, unknown>;

interface MonitorDeps {
	watch: (cb: (snapshot: PerfSnapshot) => void) => () => void;
	format: (value: unknown, kind?: string, digits?: number) => string;
}

export function renderMonitor(target: unknown, _options: MonitorOptions, deps: MonitorDeps): () => void {
	const root = typeof target === "string" ? document.querySelector<HTMLElement>(target) : (target as HTMLElement | null);
	if (!root || !(root instanceof HTMLElement)) throw new Error("prism.monitor: target element not found");
	const { format } = deps;
	const cores = Math.max(1, navigator.hardwareConcurrency || 1);

	root.innerHTML = "";
	const grid = el("div", "grid pm", root);
	const card = (label: string) => {
		const c = el("div", "card", grid);
		el("div", "label", c).textContent = label;
		const value = el("div", "kpi", c);
		value.textContent = "…";
		return value;
	};
	const ram = card("RAM");
	const cpu = card("CPU");

	return deps.watch((snap) => {
		ram.textContent = `${format(snap.page.memory / 1024 ** 2, "number", 1)} MB`;
		cpu.textContent = `${format(snap.page.cpu / cores, "number", 1)} %`;
	});
}

function el(tag: string, cls: string, parent: HTMLElement): HTMLElement {
	const node = document.createElement(tag);
	if (cls) node.className = cls;
	parent.appendChild(node);
	return node;
}
