import type { App } from "obsidian";

/** Per-block persistent state for `prism.state`, stored in the plugin data. */
export class StateStore {
	static readonly MAX_BYTES = 512 * 1024;

	constructor(private data: Record<string, Record<string, unknown>>, private save: () => void) {}

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
	}

	delete(block: string, key: string) {
		const current = this.data[block];
		if (!current || !(key in current)) return;
		delete current[key];
		if (!Object.keys(current).length) delete this.data[block];
		this.save();
	}

	/** Drops the state of all blocks of a deleted note (and of a deleted HTML file). */
	removeFile(path: string) {
		let changed = false;
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

/** Small vault-local key/value store on top of Obsidian's localStorage helpers. */
function local(app: App) {
	const a = app as App & {
		loadLocalStorage?: (key: string) => unknown;
		saveLocalStorage?: (key: string, value: unknown) => void;
	};
	const prefix = `prism-viz:${app.vault.getName()}:`;
	return {
		load<T>(key: string): T | null {
			try {
				if (a.loadLocalStorage) return (a.loadLocalStorage(key) as T) ?? null;
				const raw = window.localStorage.getItem(prefix + key);
				return raw ? (JSON.parse(raw) as T) : null;
			} catch {
				return null;
			}
		},
		save(key: string, value: unknown) {
			try {
				if (a.saveLocalStorage) a.saveLocalStorage(key, value);
				else window.localStorage.setItem(prefix + key, JSON.stringify(value));
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
