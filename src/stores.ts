import type { App } from "obsidian";

/** A viz block of a note in order: `print` is `id:<id>` or a hash of its source; `key` its state key. */
export interface BlockPrint {
	print: string;
	key: string;
}

/** State key of a block without `id=`: its position among the note's viz blocks. */
const POSITION_KEY = /^(.*)#(\d+)$/;

/**
 * Per-block persistent state for `prism.state`, stored in the plugin data.
 * Blocks without `id=` are keyed by position, so the store remembers the
 * blocks of each such note (`prints`) and moves their state along when blocks
 * are inserted, removed or edited (see realign).
 */
export class StateStore {
	static readonly MAX_BYTES = 512 * 1024;

	constructor(
		private data: Record<string, Record<string, unknown>>,
		private prints: Record<string, string[]>,
		private save: () => void,
		/** Called when a position-keyed block of a note without recorded prints gets state. */
		private track: (path: string) => void
	) {}

	get(block: string): Record<string, unknown> {
		return { ...(this.data[block] ?? {}) };
	}

	set(block: string, key: string, value: unknown) {
		const next = { ...(this.data[block] ?? {}), [key]: value };
		const size = JSON.stringify(next).length;
		if (size > StateStore.MAX_BYTES) {
			throw new Error(`prism.state for this block would exceed ${StateStore.MAX_BYTES / 1024} KB (${Math.round(size / 1024)} KB).`);
		}
		this.data[block] = next;
		this.save();
		const position = POSITION_KEY.exec(block);
		if (position && !this.prints[position[1]]) this.track(position[1]);
	}

	delete(block: string, key: string) {
		const current = this.data[block];
		if (!current || !(key in current)) return;
		delete current[key];
		if (!Object.keys(current).length) delete this.data[block];
		this.save();
	}

	/** Notes whose position-keyed blocks have state but no recorded prints yet. */
	untracked(): string[] {
		const paths = new Set<string>();
		for (const key of Object.keys(this.data)) {
			const position = POSITION_KEY.exec(key);
			if (position && !this.prints[position[1]]) paths.add(position[1]);
		}
		return Array.from(paths);
	}

	/** True when realign has work to do for this note. */
	tracks(path: string): boolean {
		return !!this.prints[path];
	}

	/**
	 * Records the viz blocks a note has now and moves the state of its
	 * position-keyed blocks to their new keys. State of a block that is gone is
	 * parked under `<note>#h<hash>` and returns when a block with the same
	 * source appears. Returns true when the blocks of the note changed.
	 */
	realign(path: string, blocks: BlockPrint[]): boolean {
		const old = this.prints[path];
		const next = blocks.map((b) => b.print);
		if (old && old.join("\n") === next.join("\n")) return false;
		this.prints[path] = next;
		if (!old) {
			this.save();
			return false;
		}
		const pairs = alignBlocks(old, next);
		const position = (i: number) => `${path}#${i}`;
		const parked = (print: string) => `${path}#h${print.slice(0, 10)}`;
		const taken: Record<string, Record<string, unknown>> = {};
		for (const key of Object.keys(this.data)) {
			const m = POSITION_KEY.exec(key);
			if (!m || m[1] !== path) continue;
			taken[key] = this.data[key];
			delete this.data[key];
		}
		const claimed = new Set<number>();
		old.forEach((print, i) => {
			const state = taken[position(i)];
			if (!state) return;
			const j = pairs.get(i);
			const target = j === undefined ? null : blocks[j].key;
			// A block that just got an id= keeps its state, unless the id already has some.
			if (j === undefined || !target || this.data[target]) {
				// The block is gone (or was cut to be pasted elsewhere).
				if (!print.startsWith("id:")) this.data[parked(print)] = state;
				return;
			}
			claimed.add(j);
			this.data[target] = state;
		});
		blocks.forEach((block, j) => {
			if (claimed.has(j) || block.print.startsWith("id:")) return;
			const key = parked(block.print);
			if (!this.data[key] || this.data[block.key]) return;
			this.data[block.key] = this.data[key];
			delete this.data[key];
		});
		// Nothing left to move: stop tracking until a block of the note gets state again.
		const prefix = `${path}#`;
		if (!Object.keys(this.data).some((key) => key.startsWith(prefix) && /^(\d+|h[0-9a-f]+)$/.test(key.slice(prefix.length)))) {
			delete this.prints[path];
		}
		this.save();
		return true;
	}

	/** Drops the state of all blocks of a deleted note (and of a deleted HTML file). */
	removeFile(path: string) {
		let changed = delete this.prints[path];
		for (const key of Object.keys(this.data)) {
			if (key.startsWith(path + "#") || key === `file:${path}`) {
				delete this.data[key];
				changed = true;
			}
		}
		if (changed) this.save();
	}

	rename(oldPath: string, newPath: string) {
		let changed = false;
		if (this.prints[oldPath]) {
			this.prints[newPath] = this.prints[oldPath];
			delete this.prints[oldPath];
			changed = true;
		}
		for (const key of Object.keys(this.data)) {
			let next: string | null = null;
			if (key.startsWith(oldPath + "#")) next = newPath + key.slice(oldPath.length);
			else if (key === `file:${oldPath}`) next = `file:${newPath}`;
			if (next && next !== key) {
				this.data[next] = this.data[key];
				delete this.data[key];
				changed = true;
			}
		}
		if (changed) this.save();
	}
}

/**
 * Pairs the blocks of a note before and after an edit: old index → new index.
 * Unchanged blocks are matched by their longest common subsequence; between
 * two matches, changed blocks are paired in order when as many are left on
 * both sides (blocks were edited, none inserted or removed).
 */
export function alignBlocks(old: string[], next: string[]): Map<number, number> {
	const n = old.length;
	const m = next.length;
	const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			lcs[i][j] = old[i] === next[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
		}
	}
	const anchors: [number, number][] = [];
	for (let i = 0, j = 0; i < n && j < m; ) {
		if (old[i] === next[j]) anchors.push([i++, j++]);
		else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
		else j++;
	}
	const pairs = new Map<number, number>();
	let i0 = 0;
	let j0 = 0;
	for (const [ai, aj] of [...anchors, [n, m] as [number, number]]) {
		if (ai - i0 === aj - j0) for (let k = 0; k < ai - i0; k++) pairs.set(i0 + k, j0 + k);
		if (ai < n) pairs.set(ai, aj);
		i0 = ai + 1;
		j0 = aj + 1;
	}
	return pairs;
}

/** Small vault-local key/value store on top of Obsidian's localStorage helpers. */
function local(app: App) {
	return {
		load<T>(key: string): T | null {
			try {
				return (app.loadLocalStorage(key) as T | null) ?? null;
			} catch {
				return null;
			}
		},
		save(key: string, value: unknown) {
			try {
				app.saveLocalStorage(key, value);
			} catch {
				/* storage unavailable */
			}
		},
	};
}

/** Last measured height per block, so re-renders reserve the right space. */
export class HeightCache {
	private map = new Map<string, number>();
	private store: ReturnType<typeof local>;
	private timer: number | null = null;

	constructor(app: App) {
		this.store = local(app);
		const saved = this.store.load<[string, number][]>("prism-viz-heights");
		if (Array.isArray(saved)) for (const [k, v] of saved) if (typeof v === "number") this.map.set(k, v);
	}

	get(key: string): number | undefined {
		return this.map.get(key);
	}

	set(key: string, height: number) {
		if (this.map.get(key) === height) return;
		this.map.delete(key);
		this.map.set(key, height);
		while (this.map.size > 400) this.map.delete(this.map.keys().next().value as string);
		if (this.timer === null) {
			this.timer = window.setTimeout(() => {
				this.timer = null;
				this.flush();
			}, 2000);
		}
	}

	flush() {
		this.store.save("prism-viz-heights", Array.from(this.map.entries()));
	}
}

/**
 * Crash guard: remembers blocks that started loading but never reported
 * `ready`. If Obsidian froze (e.g. an infinite loop in a block) and was
 * restarted, those blocks are not run automatically on the next start.
 */
export class CrashGuard {
	private pending: Record<string, string>;
	private suspects: Record<string, string>;
	private store: ReturnType<typeof local>;

	constructor(app: App) {
		this.store = local(app);
		this.suspects = this.store.load<Record<string, string>>("prism-viz-pending") ?? {};
		this.pending = {};
		this.store.save("prism-viz-pending", this.pending);
	}

	isSuspect(block: string, sourceHash: string): boolean {
		return this.suspects[block] === sourceHash;
	}

	forgive(block: string) {
		delete this.suspects[block];
	}

	start(block: string, sourceHash: string) {
		this.pending[block] = sourceHash;
		this.store.save("prism-viz-pending", this.pending);
	}

	done(block: string) {
		if (!(block in this.pending)) return;
		delete this.pending[block];
		this.store.save("prism-viz-pending", this.pending);
	}
}
