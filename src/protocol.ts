// Message protocol between the Prism host (plugin) and the sandboxed iframe.
// Shared by the host code and the iframe runtime (src/runtime/prelude.ts).

export const PRISM_VERSION = "0.4.1";

/** Marker present on every Prism message. */
export const MARK = "__prism";

export interface ThemeSnapshot {
	dark: boolean;
	/** CSS custom properties, e.g. { "--background-primary": "#1e1e1e" }. */
	vars: Record<string, string>;
	/** Ordered categorical palette derived from the theme colors. */
	palette: string[];
}

/** Embedded into the srcdoc as JSON before the prelude runs. */
export interface FrameConfig {
	token: string;
	blockId: string;
	sourcePath: string;
	theme: ThemeSnapshot;
	state: Record<string, unknown>;
	/** Obsidian's UI language (BCP 47), for number and date formatting. */
	locale: string;
	/** State shared by all blocks of the same note (prism.shared). */
	shared: Record<string, unknown>;
	autoHeight: boolean;
	libs: string[];
	/** "fullscreen" while the block is shown fullscreen or as an overlay. */
	displayMode: DisplayMode;
	/** Rendered for the command line (prism-render.mjs), possibly while Obsidian is in the background. */
	headless?: boolean;
	/** Online access switches (prism.online). */
	online?: OnlineFlags;
}

export type DisplayMode = "inline" | "fullscreen";

/** prism.online: what the user allowed in Settings → Prism → Online access. */
export interface OnlineFlags {
	/** prism.http works. */
	http: boolean;
	/** Requests wait for a click on "Run requests" below the block (never sent in command-line renders). */
	confirm: boolean;
	/** <iframe> with web pages and ```viz web blocks work. */
	web: boolean;
}

/** The heading of the note that the reader is at (scrollytelling, prism.onSection). */
export interface SectionInfo {
	/** 0-based position among the note's headings. */
	index: number;
	heading: string;
	level: number;
	/** 1-based note line. */
	line: number;
}

/** Position of an element inside the frame's viewport, in CSS pixels. */
export interface FrameRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export type ErrorKind =
	| "error"
	| "unhandledrejection"
	| "console.error"
	| "resource"
	| "csp"
	| "mermaid"
	| "warning"
	| "timeout"
	| "crash-guard";

/** Error as reported by the iframe (srcdoc coordinates, not yet mapped). */
export interface RawFrameError {
	kind: ErrorKind;
	message: string;
	line?: number;
	column?: number;
	stack?: string;
	/** Blocked or failed resource URL (csp/resource errors). */
	url?: string;
}

export type NoteExtra = "links" | "backlinks" | "headings" | "tasks";

export interface NotesQuery {
	folder?: string;
	tag?: string;
	limit?: number;
	sort?: "mtime" | "path" | "title";
	order?: "asc" | "desc";
	/** Extra fields per note; each costs time on large vaults, so only what is asked for is computed. */
	include?: NoteExtra[];
}

/** A Markdown task (`- [ ] …`), with Tasks-plugin emoji fields parsed. */
export interface NoteTask {
	/** Task text without the checkbox and without parsed emoji fields. */
	text: string;
	/** Checkbox character: " " open, "x" done, others (e.g. "/", "-") as written. */
	status: string;
	done: boolean;
	/** 1-based note line. */
	line: number;
	due?: string;
	scheduled?: string;
	start?: string;
	doneDate?: string;
	priority?: "highest" | "high" | "medium" | "low" | "lowest";
	tags: string[];
}

export interface NoteMeta {
	path: string;
	name: string;
	folder: string;
	title: string;
	tags: string[];
	frontmatter: Record<string, unknown>;
	mtime: number;
	/** Only with include: ["links"] – resolved vault paths, unresolved link text as written. */
	links?: string[];
	/** Only with include: ["backlinks"] – paths of notes linking here. */
	backlinks?: string[];
	headings?: NoteHeading[];
	tasks?: NoteTask[];
}

export interface NoteHeading {
	level: number;
	text: string;
	/** 1-based note line. */
	line: number;
}

/** A Markdown table of the note: header cells and body rows as raw cell text. */
export interface NoteTable {
	/** 0-based position among the note's tables. */
	index: number;
	/** Block id (from a `^id` line after the table), without the caret. */
	id?: string;
	/** Text of the nearest heading above the table. */
	heading?: string;
	/** 1-based note lines of the header row and the last row. */
	lines: { start: number; end: number };
	header: string[];
	rows: string[][];
}

/** The block's own note, for prism.note(). */
export interface NoteInfo extends NoteMeta {
	headings: NoteHeading[];
	links: string[];
	backlinks: string[];
	tasks: NoteTask[];
	tables: NoteTable[];
}

/** Raw content of an allowlisted data file, as sent to the iframe. */
export interface DataFilePayload {
	path: string;
	ext: string;
	size: number;
	mtime: number;
	/** File text (csv, tsv, json, geojson, txt). */
	text?: string;
	/** Parsed value (yaml/yml, parsed by Obsidian on the host). */
	data?: unknown;
}

export interface DataFileInfo {
	path: string;
	name: string;
	folder: string;
	ext: string;
	size: number;
	mtime: number;
}

/** prism.http(): a request the host sends on behalf of a block (Online access → API requests). */
export interface HttpRequest {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string;
}

export interface HttpResponse {
	/** Final URL of the request. */
	url: string;
	status: number;
	ok: boolean;
	/** Response headers, names in lower case. */
	headers: Record<string, string>;
	text: string;
}

/** What a block measured about itself (sent every second while a page monitor is visible). */
export interface BlockPerfStats {
	/** Main-thread time the block's scripts used in this period (callbacks incl. the code after their awaits). */
	cpuMs: number;
	periodMs: number;
	/** Script time from the start of the block until it finished loading. */
	startupMs: number;
	/** Elements in the block's document. */
	nodes: number;
	/** Estimated memory of canvases (2D/WebGL backing stores) and decoded images. */
	graphicsBytes: number;
}

export interface PerfProcess {
	/** Percent of one CPU core. */
	cpu: number;
	/** Working set in bytes. */
	memory: number;
}

/** One block of the page in a perf snapshot. */
export interface PerfEntry {
	key: string;
	label: string;
	kind: "block" | "web" | "monitor";
	/** 1-based note line of the block. */
	line?: number;
	/** "loading": not rendered yet (lazy) or no measurement so far. */
	state: "running" | "loading" | "off";
	/** Percent of one CPU core: script time for blocks, whole process for web views. */
	cpu: number | null;
	/** Bytes: graphics estimate for blocks, process working set for web views. */
	memory: number | null;
	nodes: number | null;
	startupMs: number | null;
	/** True when the numbers come from the operating system (own process), not from Prism's estimate. */
	exact: boolean;
}

/** prism.perf.watch(): the page the monitoring block is on, once per second. */
export interface PerfSnapshot {
	time: number;
	/** Sum over the blocks of this page. */
	page: { cpu: number; memory: number; blocks: number };
	blocks: PerfEntry[];
	/** Obsidian's processes for reference (desktop only, else null). */
	obsidian: { window: PerfProcess | null; gpu: PerfProcess | null; app: PerfProcess | null; heapBytes: number | null };
}

/** iframe -> host */
export type FrameMessage =
	| { type: "ready"; height: number }
	| { type: "height"; height: number }
	| { type: "heartbeat" }
	| { type: "error"; error: RawFrameError }
	| { type: "toast"; message: string }
	| { type: "perf"; stats: BlockPerfStats }
	| { type: "openNote"; path: string; newLeaf?: boolean }
	| { type: "openExternal"; url: string }
	| { type: "hoverNote"; path: string; rect: FrameRect }
	| { type: "hoverEnd" }
	| { type: "watch"; what: "sections" }
	| { type: "request"; id: number; method: "notes"; query: NotesQuery }
	| { type: "request"; id: number; method: "stateSet"; key: string; value: unknown }
	| { type: "request"; id: number; method: "stateDelete"; key: string }
	| { type: "request"; id: number; method: "sharedSet"; key: string; value: unknown }
	| { type: "request"; id: number; method: "sharedDelete"; key: string }
	| { type: "request"; id: number; method: "note" }
	| { type: "request"; id: number; method: "lib"; name: string }
	| { type: "request"; id: number; method: "data"; path: string }
	| { type: "request"; id: number; method: "dataFiles"; folder?: string }
	| { type: "request"; id: number; method: "http"; request: HttpRequest }
	| { type: "request"; id: number; method: "perfWatch"; on: boolean }
	| { type: "reply"; id: number; ok: boolean; result?: unknown; error?: string };

/** host -> iframe */
export type HostMessage =
	| { type: "theme"; theme: ThemeSnapshot }
	| { type: "state"; state: Record<string, unknown> }
	| { type: "notesChanged" }
	| { type: "noteChanged" }
	| { type: "shared"; shared: Record<string, unknown>; key?: string }
	| { type: "measure" }
	| { type: "dataChanged"; path: string }
	| { type: "reply"; id: number; ok: boolean; result?: unknown; error?: string }
	| { type: "export"; id: number; format: "png" | "svg"; scale: number; background: string }
	| { type: "record"; id: number; seconds: number; fps: number }
	| { type: "display"; mode: DisplayMode }
	| { type: "section"; section: SectionInfo | null }
	| { type: "perf"; on: boolean }
	| { type: "perfSnapshot"; snapshot: PerfSnapshot };

export type Envelope<T> = T & { [MARK]: 1; token?: string; doc?: string };

/** Serializes a theme snapshot into the `:root` rule injected into the iframe. */
export function themeToCss(theme: ThemeSnapshot): string {
	let body = "";
	for (const [name, value] of Object.entries(theme.vars)) {
		if (!/^--[\w-]+$/.test(name) || /[<>{};]/.test(value)) continue;
		body += `${name}:${value};`;
	}
	theme.palette.forEach((color, i) => {
		if (!/[<>{};]/.test(color)) body += `--prism-series-${i + 1}:${color};`;
	});
	const mode = theme.dark ? "dark" : "light";
	return `:root{${body}--prism-mode:${mode};color-scheme:${mode};}`;
}
