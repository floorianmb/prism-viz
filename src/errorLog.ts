// Agent-readable error log at `<vault>/.prism/errors.json`.
//
// `blocks` holds the status of the last render of every block, `errors` the
// errors of those renders (most recent first). A block's previous errors are
// removed when it renders again, so the file always reflects the current state.

import type { DataAdapter } from "obsidian";
import type { ErrorKind } from "./protocol";
import { debounce } from "./util";

export const PRISM_DIR = ".prism";
export const ERROR_FILE = `${PRISM_DIR}/errors.json`;

export interface BlockRef {
	/** Stable block key: `<note path>#<index>` or `<note path>#<id>` or `file:<path>`. */
	block: string;
	notePath: string;
	/** 0-based index among the note's viz blocks. */
	blockIndex?: number;
	/** 1-based note lines of the opening and closing fence. */
	lines?: { start: number; end: number };
	title?: string;
	embeddedIn?: string;
}

export interface LoggedError extends BlockRef {
	time: string;
	kind: ErrorKind;
	message: string;
	/** 1-based line in the note (or HTML file) where the error occurred, if known. */
	line?: number;
	/** 1-based line relative to the block content. */
	blockLine?: number;
	column?: number;
	/** "block" for user code, "prism" for the runtime, "lib:<name>" for a bundled library. */
	origin?: string;
	stack?: string;
}

export interface BlockStatus extends BlockRef {
	/** "interrupted": the block was unloaded (scrolled away, note closed, app quit) before it finished loading. */
	status: "rendering" | "ok" | "error" | "warning" | "interrupted";
	renderedAt: string;
	errors: number;
	warnings: number;
	snapshot?: string;
}

interface ErrorFile {
	$comment: string;
	updated: string;
	blocks: Record<string, BlockStatus>;
	errors: LoggedError[];
}

const COMMENT =
	"Written by the Prism Obsidian plugin. `blocks` = status of the last render of each viz block, " +
	"`errors` = errors of those renders, newest first. Line numbers are 1-based note lines. " +
	"Entries are refreshed whenever a block renders in Obsidian (blocks render when visible). " +
	"`interrupted` = the block was unloaded before it finished loading; render it with prism-render.mjs to get a result.";

const MAX_ERRORS = 200;
const MAX_BLOCKS = 500;

export class ErrorLog {
	private data: ErrorFile = { $comment: COMMENT, updated: "", blocks: {}, errors: [] };
	private loaded = false;
	enabled = true;
	private flushSoon = debounce(() => void this.flush(), 1000);
	/** Frame that started the current render of each block; only it may settle or interrupt it. */
	private owners = new Map<string, object>();

	constructor(private adapter: DataAdapter) {}

	async load() {
		try {
			if (await this.adapter.exists(ERROR_FILE)) {
				const parsed = JSON.parse(await this.adapter.read(ERROR_FILE)) as Partial<ErrorFile>;
				this.data.blocks = parsed.blocks && typeof parsed.blocks === "object" ? parsed.blocks : {};
				this.data.errors = Array.isArray(parsed.errors) ? parsed.errors : [];
				// Nothing renders before the plugin has loaded: these were cut off in an earlier session.
				for (const status of Object.values(this.data.blocks)) {
					if (status.status === "rendering") status.status = "interrupted";
				}
			}
		} catch {
			// Corrupt file: start fresh, it is regenerated on the next write.
		}
		this.loaded = true;
	}

	/** A block starts rendering: forget its previous errors. */
	begin(ref: BlockRef, owner: object) {
		this.owners.set(ref.block, owner);
		this.data.errors = this.data.errors.filter((e) => e.block !== ref.block);
		this.data.blocks[ref.block] = {
			...ref,
			status: "rendering",
			renderedAt: new Date().toISOString(),
			errors: 0,
			warnings: 0,
			snapshot: this.data.blocks[ref.block]?.snapshot,
		};
		this.changed();
	}

	add(ref: BlockRef, error: Omit<LoggedError, keyof BlockRef | "time">) {
		const entry: LoggedError = { time: new Date().toISOString(), ...ref, ...error };
		this.data.errors.unshift(entry);
		if (this.data.errors.length > MAX_ERRORS) this.data.errors.length = MAX_ERRORS;
		const status = this.data.blocks[ref.block] ?? {
			...ref,
			status: "rendering",
			renderedAt: entry.time,
			errors: 0,
			warnings: 0,
		};
		if (error.kind === "warning") status.warnings++;
		else status.errors++;
		status.status = status.errors ? "error" : "warning";
		this.data.blocks[ref.block] = status;
		this.changed();
	}

	/** The block finished loading and settled. */
	settled(block: string, owner: object) {
		const status = this.data.blocks[block];
		if (!status || this.owners.get(block) !== owner) return;
		if (status.status === "rendering") status.status = status.errors ? "error" : status.warnings ? "warning" : "ok";
		this.changed();
	}

	/** The frame that rendered the block went away. Marks an unfinished render as interrupted. */
	release(block: string, owner: object) {
		if (this.owners.get(block) !== owner) return;
		this.owners.delete(block);
		const status = this.data.blocks[block];
		if (status?.status !== "rendering") return;
		status.status = "interrupted";
		this.changed();
	}

	setSnapshot(block: string, path: string | undefined) {
		const status = this.data.blocks[block];
		if (!status) return;
		status.snapshot = path;
		this.changed();
	}

	snapshotOf(block: string): string | undefined {
		return this.data.blocks[block]?.snapshot;
	}

	/** Status of the block's last render, if it rendered since the log was cleared. */
	statusOf(block: string): BlockStatus | undefined {
		return this.data.blocks[block];
	}

	/** Forgets the blocks of a deleted note or HTML file. */
	removeFile(path: string) {
		const gone = (key: string) => key.startsWith(path + "#") || key === `file:${path}`;
		const before = Object.keys(this.data.blocks).length + this.data.errors.length;
		for (const key of Object.keys(this.data.blocks)) if (gone(key)) delete this.data.blocks[key];
		this.data.errors = this.data.errors.filter((e) => !gone(e.block));
		if (Object.keys(this.data.blocks).length + this.data.errors.length !== before) this.changed();
	}

	/** Drops blocks whose note or HTML file no longer exists (e.g. deleted while Prism was off). */
	prune(exists: (path: string) => boolean) {
		const stale = new Set(Object.values(this.data.blocks).filter((b) => b.notePath && !exists(b.notePath)).map((b) => b.notePath));
		stale.forEach((path) => this.removeFile(path));
	}

	/** Keeps keys in sync when a note is renamed. */
	rename(oldPath: string, newPath: string) {
		const remap = (key: string) =>
			key.startsWith(oldPath + "#") ? newPath + key.slice(oldPath.length) : key === `file:${oldPath}` ? `file:${newPath}` : key;
		const blocks: Record<string, BlockStatus> = {};
		for (const [key, status] of Object.entries(this.data.blocks)) {
			const k = remap(key);
			blocks[k] = { ...status, block: k, notePath: status.notePath === oldPath ? newPath : status.notePath };
		}
		this.data.blocks = blocks;
		this.owners = new Map(Array.from(this.owners, ([key, owner]) => [remap(key), owner]));
		for (const e of this.data.errors) {
			e.block = remap(e.block);
			if (e.notePath === oldPath) e.notePath = newPath;
		}
		this.changed();
	}

	clear() {
		this.data.blocks = {};
		this.data.errors = [];
		this.changed();
	}

	private changed() {
		if (this.enabled && this.loaded) this.flushSoon();
	}

	async flush() {
		if (!this.enabled) return;
		const entries = Object.entries(this.data.blocks);
		if (entries.length > MAX_BLOCKS) {
			entries.sort((a, b) => b[1].renderedAt.localeCompare(a[1].renderedAt));
			this.data.blocks = Object.fromEntries(entries.slice(0, MAX_BLOCKS));
		}
		this.data.updated = new Date().toISOString();
		try {
			if (!(await this.adapter.exists(PRISM_DIR))) await this.adapter.mkdir(PRISM_DIR);
			await this.adapter.write(ERROR_FILE, JSON.stringify(this.data, null, 2));
		} catch (err) {
			console.warn("Prism: could not write error log", err);
		}
	}

	dispose() {
		this.flushSoon.cancel();
	}
}
