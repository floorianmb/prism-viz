// Prism iframe runtime. Bundled as an IIFE and injected as the first script of
// every block's srcdoc. Defines `window.prism`, the theme bridge, auto-height,
// error capture and the library adapters (Chart.js, Mermaid).
//
// Runs inside `sandbox="allow-scripts"` (opaque origin): no access to the host
// DOM, storage or network. Everything goes through postMessage to the parent.

import {
	DataFileInfo,
	DataFilePayload,
	DisplayMode,
	FrameConfig,
	FrameRect,
	HostMessage,
	MARK,
	NoteInfo,
	NoteMeta,
	NoteTable,
	NotesQuery,
	PRISM_VERSION,
	PerfSnapshot,
	RawFrameError,
	SectionInfo,
	ThemeSnapshot,
	themeToCss,
} from "../protocol";
import { ChartSpec, chartConfig, specWarnings } from "./chartSpec";
import { TableSpec, renderTable, tableWarnings } from "./table";
import { AnimateOptions, Choice, KitDeps, SegmentedOptions, Variant, animate, canvas, reducedMotion, segmented, variants } from "./kit";
import { createHttp } from "./online";
import { installPerf, setPerfReporting } from "./perf";
import { MonitorOptions, renderMonitor } from "./monitor";
import { toText } from "../util";
import { createEl, createSvg } from "./dom";

/** Listener of any arity; the emitter passes the arguments, so they are not typed here. */
type AnyFn = (...args: never[]) => unknown;

/** The parts of the bundled libraries that the adapters below use. */
interface ChartInstance {
	canvas?: HTMLCanvasElement;
	data: unknown;
	options: unknown;
	update(mode?: string): void;
	resize(): void;
}
interface ChartDataset {
	type?: string;
	data?: unknown[];
	backgroundColor?: unknown;
	borderColor?: unknown;
}
interface ChartLibrary {
	new (canvas: HTMLCanvasElement, config: unknown): ChartInstance;
	defaults: { color: string; borderColor: string; font: { family: string }; plugins?: { colors?: { enabled: boolean } } };
	instances?: Record<string, ChartInstance>;
	register(plugin: unknown): void;
}
interface MermaidLibrary {
	initialize(config: unknown): void;
	run(options: { nodes: HTMLElement[]; suppressErrors: boolean }): Promise<void> | void;
}
interface HtmlToImageLibrary {
	toSvg(node: HTMLElement, options?: unknown): Promise<string>;
	toPng(node: HTMLElement, options?: unknown): Promise<string>;
}

interface PrismWindow extends Window {
	__PRISM_CONFIG__?: FrameConfig;
	prism?: unknown;
	Chart?: ChartLibrary;
	mermaid?: MermaidLibrary;
	htmlToImage?: HtmlToImageLibrary;
	katex?: unknown;
	renderMathInElement?: (element: HTMLElement, options?: unknown) => void;
}

const w = window as PrismWindow;
const config = w.__PRISM_CONFIG__ as FrameConfig;
try {
	delete w.__PRISM_CONFIG__;
} catch {
	w.__PRISM_CONFIG__ = undefined;
}
// Remove the config script from the DOM so the token is not readable later.
try {
	document.currentScript?.remove();
} catch {
	/* ignore */
}

// Headless renders often run while Obsidian is in the background, where
// Chromium runs no animation frames at all: charts that draw their first frame
// in requestAnimationFrame (Chart.js) and animations stayed blank in snapshots.
// There, every requested frame also fires after 16 ms. Installed before the
// libraries load, since some of them keep a reference to the function.
if (config.headless) {
	const nativeRequest = w.requestAnimationFrame.bind(w);
	const nativeCancel = w.cancelAnimationFrame.bind(w);
	const waiting = new Map<number, { frame: number; timer: number }>();
	let lastId = 0;
	w.requestAnimationFrame = (cb: FrameRequestCallback) => {
		const id = ++lastId;
		const run = (t: number) => {
			const entry = waiting.get(id);
			if (!entry) return;
			waiting.delete(id);
			nativeCancel(entry.frame);
			window.clearTimeout(entry.timer);
			cb(t);
		};
		waiting.set(id, { frame: nativeRequest(run), timer: window.setTimeout(() => run(performance.now()), 16) });
		return id;
	};
	w.cancelAnimationFrame = (id: number) => {
		const entry = waiting.get(id);
		if (!entry) return;
		waiting.delete(id);
		nativeCancel(entry.frame);
		window.clearTimeout(entry.timer);
	};
}

// Page monitors: time the block's callbacks from here on (before libraries and user scripts).
installPerf(window);

const host = window.parent;
// Identifies this document instance; the host uses it to notice reloads
// (e.g. when Obsidian re-attaches a cached section) and navigations.
const DOC_ID = Math.random().toString(36).slice(2);
const send = (msg: Record<string, unknown>) => {
	try {
		host.postMessage({ ...msg, [MARK]: 1, token: config.token, doc: DOC_ID }, "*");
	} catch {
		/* host gone */
	}
};
const safe = (fn: AnyFn, ...args: unknown[]) => {
	try {
		(fn as (...values: unknown[]) => unknown)(...args);
	} catch (err) {
		reportError(err, "error");
	}
};

/* ------------------------------------------------------------------ errors */

const seen = new Set<string>();
let reportedCount = 0;
function report(error: RawFrameError) {
	const key = `${error.kind}|${error.message}|${error.line ?? ""}`;
	if (seen.has(key)) return;
	seen.add(key);
	if (++reportedCount > 50) return;
	error.message = String(error.message).slice(0, 4000);
	if (error.stack) error.stack = String(error.stack).slice(0, 4000);
	send({ type: "error", error });
}
function describe(value: unknown): string {
	if (value instanceof Error) return value.message || String(value);
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}
function reportError(err: unknown, kind: RawFrameError["kind"]) {
	report({
		kind,
		message: describe(err),
		stack: err instanceof Error ? err.stack : undefined,
	});
}

window.addEventListener(
	"error",
	(event) => {
		const target = event.target as (HTMLElement & { src?: string; href?: string }) | null;
		if (target && (target as unknown) !== window && target.tagName) {
			const url = target.src || target.href || "";
			if (cspBlocked.has(url)) return; // already reported as a CSP violation
			report({
				url,
				kind: "resource",
				message: `Failed to load <${target.tagName.toLowerCase()}> ${url.slice(0, 200)}`,
			});
			return;
		}
		const e = event;
		report({
			kind: "error",
			message: e.message || describe(e.error),
			line: e.lineno || undefined,
			column: e.colno || undefined,
			stack: e.error instanceof Error ? e.error.stack : undefined,
		});
	},
	true
);
window.addEventListener("unhandledrejection", (event) => {
	const reason: unknown = event.reason;
	report({
		kind: "unhandledrejection",
		message: "Unhandled promise rejection: " + describe(reason),
		stack: reason instanceof Error ? reason.stack : undefined,
	});
});
const cspBlocked = new Set<string>();
document.addEventListener("securitypolicyviolation", (e) => {
	const blocked = e.blockedURI || "inline code";
	if (e.blockedURI) cspBlocked.add(e.blockedURI);
	report({
		url: e.blockedURI || undefined,
		kind: "csp",
		message:
			`Blocked by Content-Security-Policy (${e.effectiveDirective}): ${blocked}. ` +
			`Network access is off: inline the resource, use a bundled library keyword, ` +
			`or add the domain to Prism's network allowlist.`,
		line: e.lineNumber || undefined,
		column: e.columnNumber || undefined,
	});
});
const nativeConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
	nativeConsoleError(...args);
	report({
		kind: "console.error",
		message: args.map(describe).join(" "),
		stack: new Error().stack,
	});
};

// Modal dialogs are blocked by the sandbox; map them to something visible.
w.alert = (message?: unknown) => toast(toText(message));
w.confirm = () => {
	report({ kind: "warning", message: "confirm() is not available in Prism blocks; it always returns false." });
	return false;
};
w.prompt = () => {
	report({ kind: "warning", message: "prompt() is not available in Prism blocks; it always returns null." });
	return null;
};

/* -------------------------------------------------------------- loop guard */

// Called at the start of every loop body in user scripts (inserted by the
// host, see loopGuard.ts). The first call in a task records the time; a
// MessageChannel message (a macrotask, not delayed by timer throttling)
// resets it once the task yields. A loop that keeps the thread busy for
// longer than LOOP_LIMIT_MS is stopped with an error.
const LOOP_LIMIT_MS = 2000;
let loopArmed = false;
let loopStart = 0;
let loopCounter = 0;
const trippedLoops = new Set<number>();
const loopReset = new MessageChannel();
loopReset.port1.onmessage = () => {
	loopArmed = false;
};
function loopGuard(id: number) {
	if (trippedLoops.has(id)) throw new RangeError("Prism: this loop was stopped earlier because it never yielded.");
	if (!loopArmed) {
		loopArmed = true;
		loopStart = Date.now();
		loopCounter = 0;
		loopReset.port2.postMessage(0);
		return;
	}
	if ((++loopCounter & 31) !== 0) return;
	if (Date.now() - loopStart > LOOP_LIMIT_MS) {
		trippedLoops.add(id);
		loopArmed = false;
		throw new RangeError(
			`Prism stopped a loop that ran for more than ${LOOP_LIMIT_MS / 1000}s without yielding (infinite loop?). ` +
				`Make it terminate, or split long work with setTimeout/requestAnimationFrame.`
		);
	}
}
Object.defineProperty(w, "__prismLoop", { value: loopGuard, enumerable: false });

/* ------------------------------------------------------------------- theme */

let theme: ThemeSnapshot = config.theme;
const themeListeners = new Set<AnyFn>();

function applyTheme(next: ThemeSnapshot) {
	theme = next;
	const root = document.documentElement;
	root.classList.toggle("theme-dark", next.dark);
	root.classList.toggle("theme-light", !next.dark);
	root.setAttribute("data-theme", next.dark ? "dark" : "light");
	const style = document.getElementById("prism-theme");
	if (style) style.textContent = themeToCss(next);
}

function cssVar(name: string): string {
	const key = name.startsWith("--") ? name : `--${name}`;
	return theme.vars[key] ?? getComputedStyle(document.documentElement).getPropertyValue(key).trim();
}

/* ------------------------------------------------------- request/response */

let nextRequestId = 1;
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }>();
function request<T>(method: string, payload: Record<string, unknown>, timeoutMs = 20000): Promise<T> {
	const id = nextRequestId++;
	return new Promise<T>((resolve, reject) => {
		// The host answers with the type the caller asked for; the cast is the one place that trusts it.
		pending.set(id, { resolve: (value) => resolve(value as T), reject });
		send({ type: "request", id, method, ...payload });
		window.setTimeout(() => {
			if (pending.delete(id)) reject(new Error(`prism.${method}: no response from Obsidian`));
		}, timeoutMs);
	});
}

/* ------------------------------------------------------------------- state */

let state: Record<string, unknown> = { ...(config.state || {}) };
const stateListeners = new Set<AnyFn>();
const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

const stateApi = {
	get(key: string, fallback?: unknown) {
		return Object.prototype.hasOwnProperty.call(state, key) ? clone(state[key]) : fallback;
	},
	set(key: string, value: unknown): Promise<void> {
		const v = value === undefined ? null : clone(value);
		state[String(key)] = v;
		return request<void>("stateSet", { key: String(key), value: v });
	},
	delete(key: string): Promise<void> {
		delete state[key];
		return request<void>("stateDelete", { key: String(key) });
	},
	keys: () => Object.keys(state),
	all: () => clone(state),
	onChange(cb: AnyFn) {
		stateListeners.add(cb);
		return () => stateListeners.delete(cb);
	},
	/** Two-way binds a form control to a key of this block's state. */
	bind: (el: unknown, key: string, fallback?: unknown, onValue?: AnyFn): (() => void) => bindInput(stateApi, el, key, fallback, onValue),
};

let shared: Record<string, unknown> = { ...(config.shared || {}) };
const sharedListeners = new Set<AnyFn>();

const sharedApi = {
	get(key: string, fallback?: unknown) {
		return Object.prototype.hasOwnProperty.call(shared, key) ? clone(shared[key]) : fallback;
	},
	/** Sets a value for every block of this note; listeners here and in the other blocks run. */
	set(key: string, value: unknown): Promise<void> {
		const k = String(key);
		const v = value === undefined ? null : clone(value);
		shared[k] = v;
		sharedListeners.forEach((cb) => safe(cb, clone(shared), k));
		return request<void>("sharedSet", { key: k, value: v });
	},
	delete(key: string): Promise<void> {
		const k = String(key);
		delete shared[k];
		sharedListeners.forEach((cb) => safe(cb, clone(shared), k));
		return request<void>("sharedDelete", { key: k });
	},
	keys: () => Object.keys(shared),
	all: () => clone(shared),
	onChange(cb: AnyFn) {
		sharedListeners.add(cb);
		return () => sharedListeners.delete(cb);
	},
	/** Two-way binds a form control to a key shared by all blocks of this note. */
	bind: (el: unknown, key: string, fallback?: unknown, onValue?: AnyFn): (() => void) => bindInput(sharedApi, el, key, fallback, onValue),
};

type Store = { get(key: string, fallback?: unknown): unknown; set(key: string, value: unknown): Promise<void>; onChange(cb: AnyFn): () => boolean };

/**
 * Two-way binding of a form control (or a selector) to a store key: restores
 * the stored value, saves on input, follows changes from other blocks and
 * calls `onValue(value)` initially and on every change.
 */
function bindInput(store: Store, target: unknown, key: string, fallback?: unknown, onValue?: AnyFn): () => void {
	const el = (typeof target === "string" ? document.querySelector(target) : target) as HTMLInputElement | HTMLSelectElement | null;
	if (!el || !("value" in el)) throw new TypeError(`prism bind("${key}"): ${typeof target === "string" ? `no element matches "${target}"` : "not a form control"}`);
	const input = el as HTMLInputElement;
	const kind = input.type === "checkbox" ? "checkbox" : input.type === "range" || input.type === "number" ? "number" : "text";
	const read = (): unknown => (kind === "checkbox" ? input.checked : kind === "number" ? (input.value === "" ? null : Number(input.value)) : input.value);
	const write = (v: unknown) => {
		if (kind === "checkbox") input.checked = !!v;
		else input.value = toText(v);
	};
	const initial = store.get(key, fallback === undefined ? read() : fallback);
	write(initial);
	let last = JSON.stringify(read());
	const emit = () => {
		if (onValue) safe(onValue, read());
	};
	const onInput = () => {
		const v = read();
		last = JSON.stringify(v);
		void store.set(key, v).catch((err) => reportError(err, "error"));
		emit();
	};
	// Chromium fires "input" for text, range, select and checkbox alike.
	el.addEventListener("input", onInput);
	const off = store.onChange((all: Record<string, unknown>) => {
		if (!Object.prototype.hasOwnProperty.call(all, key)) return;
		const next = JSON.stringify(all[key]);
		if (next === last) return;
		last = next;
		write(all[key]);
		emit();
	});
	emit();
	return () => {
		off();
		el.removeEventListener("input", onInput);
	};
}

// Sandboxed frames cannot use Web Storage. Provide a localStorage shim that is
// persisted through prism.state, and an in-memory sessionStorage.
function makeStorage(persist: boolean): Storage {
	const mem = new Map<string, string>();
	const PREFIX = "localStorage:";
	if (persist) {
		for (const k of Object.keys(state)) if (k.startsWith(PREFIX)) mem.set(k.slice(PREFIX.length), String(state[k]));
	}
	const api = {
		get length() {
			return mem.size;
		},
		key: (i: number) => Array.from(mem.keys())[i] ?? null,
		getItem: (k: string) => (mem.has(String(k)) ? (mem.get(String(k)) as string) : null),
		setItem(k: string, v: string) {
			mem.set(String(k), String(v));
			if (persist) void stateApi.set(PREFIX + k, String(v)).catch(() => undefined);
		},
		removeItem(k: string) {
			mem.delete(String(k));
			if (persist) void stateApi.delete(PREFIX + k).catch(() => undefined);
		},
		clear() {
			for (const k of Array.from(mem.keys())) api.removeItem(k);
		},
	};
	return api;
}
for (const [name, persist] of [
	["localStorage", true],
	["sessionStorage", false],
] as const) {
	try {
		void w[name];
	} catch {
		try {
			Object.defineProperty(w, name, { configurable: true, value: makeStorage(persist) });
		} catch {
			/* leave as is */
		}
	}
}

/* -------------------------------------------------------------- auto-height */

let lastHeight = -1;
let measureQueued = false;
function measure(): number {
	const body = document.body;
	if (!body) return 0;
	const cs = getComputedStyle(body);
	const margins = (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
	return Math.ceil(Math.max(body.scrollHeight, body.getBoundingClientRect().height) + margins);
}
function postHeight(force = false) {
	measureQueued = false;
	if (!config.autoHeight && !force) return;
	const h = measure();
	if (!force && Math.abs(h - lastHeight) < 1) return;
	lastHeight = h;
	send({ type: "height", height: h });
}
function queueMeasure() {
	if (measureQueued) return;
	measureQueued = true;
	window.setTimeout(postHeight, 16);
}

function startObservers() {
	if (!config.autoHeight) return;
	const ro = new ResizeObserver(queueMeasure);
	ro.observe(document.documentElement);
	if (document.body) ro.observe(document.body);
	new MutationObserver(queueMeasure).observe(document.documentElement, {
		subtree: true,
		childList: true,
		attributes: true,
		characterData: true,
	});
	document.addEventListener("load", queueMeasure, true);
	document.fonts?.addEventListener?.("loadingdone", queueMeasure);
	// Catch late layout changes (absolutely positioned content, async libs).
	let ticks = 0;
	const timer = window.setInterval(() => {
		queueMeasure();
		if (++ticks > 10) window.clearInterval(timer);
	}, 300);
}

/* ------------------------------------------------------------------ notes */

const notesListeners = new Set<AnyFn>();
const noteListeners = new Set<AnyFn>();

type Note = Omit<NoteInfo, "tables"> & {
	tables: (Omit<NoteTable, "header" | "rows"> & { columns: string[]; rows: Record<string, unknown>[] })[];
	/** A table by heading text, block id ("^id" or "id") or index. Rows are typed like prism.data CSV rows. */
	table(ref?: string | number): Record<string, unknown>[] & { columns: string[] };
};

async function loadNote(): Promise<Note> {
	const info = await request<NoteInfo>("note", {});
	const tables = info.tables.map((t) => {
		const rows = typedRows([t.header, ...t.rows], {}, true) as Record<string, unknown>[] & { columns: string[] };
		const { header: _h, rows: _r, ...rest } = t;
		return { ...rest, columns: rows.columns, rows };
	});
	const note = { ...info, tables } as unknown as Note;
	Object.defineProperty(note, "table", {
		enumerable: false,
		value(ref: string | number = 0) {
			let hit;
			if (typeof ref === "number") hit = tables[ref];
			else {
				const r = String(ref).trim();
				const id = r.replace(/^\^/, "");
				hit =
					tables.find((t) => t.id === id) ||
					tables.find((t) => (t.heading || "").toLowerCase() === r.toLowerCase()) ||
					tables.find((t) => (t.heading || "").toLowerCase().includes(r.toLowerCase()));
			}
			if (!hit) {
				const known = tables.map((t) => `#${t.index}${t.id ? ` ^${t.id}` : ""}${t.heading ? ` under "${t.heading}"` : ""} (line ${t.lines.start})`);
				throw new Error(`prism.note().table(${JSON.stringify(ref)}): no such table. ${known.length ? "Tables: " + known.join(", ") : "The note has no Markdown tables."}`);
			}
			return hit.rows;
		},
	});
	return note;
}

/* -------------------------------------------------------------- data files */

const dataListeners = new Set<AnyFn>();

interface CsvOptions {
	delimiter?: string;
	header?: boolean;
	typed?: boolean;
}

function detectDelimiter(text: string): string {
	const firstLine = text.slice(0, text.search(/\r?\n|$/));
	const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0, "|": 0 };
	let quoted = false;
	for (const ch of firstLine) {
		if (ch === '"') quoted = !quoted;
		else if (!quoted && ch in counts) counts[ch]++;
	}
	const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
	return n > 0 ? best : ",";
}

/** RFC 4180 CSV parser (quotes, escaped quotes, CRLF, BOM). */
function parseCsv(input: string, options: CsvOptions = {}): unknown[] {
	const text = input.replace(/^\uFEFF/, "");
	const delimiter = options.delimiter || detectDelimiter(text);
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else quoted = false;
			} else field += ch;
		} else if (ch === '"' && field === "") quoted = true;
		else if (ch === delimiter) {
			row.push(field);
			field = "";
		} else if (ch === "\n" || ch === "\r") {
			if (ch === "\r" && text[i + 1] === "\n") i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else field += ch;
	}
	if (field !== "" || row.length) {
		row.push(field);
		rows.push(row);
	}
	const filled = rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
	return typedRows(filled, options, delimiter === ";");
}

/**
 * Turns rows of cell strings into typed values (first row = header unless
 * `header: false`). `commaDecimals` also accepts "0,385" as a number.
 */
function typedRows(filled: string[][], options: CsvOptions, commaDecimals: boolean): unknown[] {
	const header = options.header !== false;
	const body = header ? filled.slice(1) : filled;
	const width = Math.max(0, ...filled.map((r) => r.length));
	// Types are inferred per column: a column becomes numeric (or boolean) only
	// if every non-empty value is, so "911" stays a string next to "Macan".
	const NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;
	// German style (commaDecimals): "0,385", "1.500", "1.500,50".
	const COMMA_NUMBER = /^-?(0|[1-9]\d*),\d+$/;
	const GROUPED = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/;
	// Written placeholders for "no value" and unit signs around numbers (commaDecimals only).
	const PLACEHOLDER = /^(–|—|-|n\/a|k\.\s?a\.)$/i;
	const UNIT = /^(?:(€|\$|EUR|USD)\s*)?(.*?)(?:\s*(€|%|\$|EUR|USD))?$/;
	const blank = (v: string) => v === "" || (commaDecimals && PLACEHOLDER.test(v));
	const strip = (v: string): [string, string] => {
		if (!commaDecimals) return [v, ""];
		const m = UNIT.exec(v) as RegExpExecArray;
		return [m[2], (m[1] || m[3] || "").toUpperCase().replace("EUR", "€").replace("USD", "$")];
	};
	const germanGrouped = (nums: string[]) =>
		nums.some((v) => /^-?[1-9]\d{0,2}(\.\d{3})+$/.test(v)) && nums.every((v) => !/\.(\d{1,2}|\d{4,})$/.test(v));
	const kinds: ("number" | "comma" | "boolean" | "string")[] = [];
	const units: Record<number, string> = {};
	for (let c = 0; c < width; c++) {
		const values = body.map((r) => (r[c] ?? "").trim()).filter((v) => !blank(v));
		const stripped = values.map(strip);
		const unitSet = new Set(stripped.map(([, u]) => u));
		const nums = stripped.map(([n]) => n);
		const oneUnit = unitSet.size === 1;
		if (options.typed === false || !values.length) kinds.push("string");
		// "1.500" next to "999" is a thousands separator in German tables, not 1.5.
		else if (oneUnit && nums.every((v) => NUMBER.test(v)) && !(commaDecimals && germanGrouped(nums))) kinds.push("number");
		else if (commaDecimals && oneUnit && nums.every((v) => NUMBER.test(v) || COMMA_NUMBER.test(v) || GROUPED.test(v))) kinds.push("comma");
		else if (values.every((v) => v === "true" || v === "false")) kinds.push("boolean");
		else kinds.push("string");
		const unit = [...unitSet][0];
		if (oneUnit && unit && kinds[c] !== "string") units[c] = unit;
	}
	const convert = (raw: string, c: number): unknown => {
		if (options.typed === false) return raw;
		const v = raw.trim();
		if (blank(v)) return null;
		switch (kinds[c]) {
			case "number":
				return Number(strip(v)[0]);
			case "comma":
				return Number(strip(v)[0].replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
			case "boolean":
				return v === "true";
			default:
				return raw;
		}
	};
	if (!header) return body.map((r) => r.map(convert));
	const seenKeys = new Map<string, number>();
	const keys = (filled[0] || []).map((k, i) => {
		const base = k.trim() || `col${i + 1}`;
		const n = seenKeys.get(base) ?? 0;
		seenKeys.set(base, n + 1);
		return n ? `${base}_${n + 1}` : base;
	});
	const out = body.map((r) => {
		const obj: Record<string, unknown> = {};
		keys.forEach((k, i) => (obj[k] = convert(r[i] ?? "", i)));
		return obj;
	}) as unknown[] & { columns?: string[] };
	out.columns = keys;
	// Units written next to the numbers ("1.500 €", "12 %"), by column.
	const unitMap: Record<string, string> = {};
	for (const [i, u] of Object.entries(units)) unitMap[keys[Number(i)]] = u;
	if (Object.keys(unitMap).length) Object.defineProperty(out, "units", { value: unitMap, enumerable: false });
	return out;
}

interface DataOptions extends CsvOptions {
	/** Override the format detected from the file extension. */
	format?: "csv" | "tsv" | "json" | "yaml" | "text";
}

async function loadData(path: string, options: DataOptions = {}): Promise<unknown> {
	const file = await request<DataFilePayload>("data", { path: String(path) });
	const format = options.format || file.ext;
	switch (format) {
		case "csv":
			return parseCsv(file.text ?? "", options);
		case "tsv":
			return parseCsv(file.text ?? "", { ...options, delimiter: options.delimiter || "\t" });
		case "json":
		case "geojson":
			try {
				return JSON.parse(file.text ?? "null");
			} catch (err) {
				throw new Error(`prism.data: ${file.path} is not valid JSON (${describe(err)})`);
			}
		case "yaml":
		case "yml":
			return file.data;
		default:
			return file.text ?? "";
	}
}

/* -------------------------------------------------------------- toast/open */

function toast(message: string) {
	send({ type: "toast", message: String(message).slice(0, 500) });
}

// Links: in-page anchors behave normally, everything else is routed to
// Obsidian (notes) or the system browser (http/https/mailto). The frame never
// navigates away.
document.addEventListener("click", (event) => {
	if (event.defaultPrevented || !event.isTrusted) return;
	const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
	if (!anchor) return;
	const href = anchor.getAttribute("href") || "";
	if (href.startsWith("#")) return;
	event.preventDefault();
	if (/^(https?:|mailto:)/i.test(href)) {
		send({ type: "openExternal", url: href });
	} else if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) {
		let path = href;
		try {
			path = decodeURIComponent(href);
		} catch {
			/* keep raw */
		}
		send({ type: "openNote", path, newLeaf: event.metaKey || event.ctrlKey });
	} else {
		report({ kind: "warning", message: `Link scheme not allowed in Prism blocks: ${href.slice(0, 80)}` });
	}
});

/* ------------------------------------------------------------ note hovers */

// Hovering a note link shows Obsidian's page preview. The host positions the
// popover from the element's rectangle inside this frame.
let hoverTarget: Element | null = null;
function rectOf(target: unknown): FrameRect | null {
	if (target instanceof Element) {
		const r = target.getBoundingClientRect();
		return { x: r.left, y: r.top, width: r.width, height: r.height };
	}
	if (target && typeof target === "object") {
		const t = target as { clientX?: number; clientY?: number; x?: number; y?: number; width?: number; height?: number };
		const x = Number(t.clientX ?? t.x);
		const y = Number(t.clientY ?? t.y);
		if (Number.isFinite(x) && Number.isFinite(y)) return { x, y, width: Number(t.width) || 1, height: Number(t.height) || 1 };
	}
	return null;
}
function hoverNote(path: string, target: unknown) {
	const rect = rectOf(target);
	if (!path || !rect) return;
	send({ type: "hoverNote", path: String(path), rect });
}
function hoverEnd() {
	hoverTarget = null;
	send({ type: "hoverEnd" });
}
function notePathOfLink(el: Element): string | null {
	const note = el.getAttribute("data-prism-note");
	if (note) return note;
	const href = el.getAttribute("href") || "";
	if (!href || href.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
	try {
		return decodeURIComponent(href);
	} catch {
		return href;
	}
}
document.addEventListener("mouseover", (event) => {
	const link = (event.target as Element | null)?.closest?.("a[href], [data-prism-note]") ?? null;
	if (link === hoverTarget) return;
	if (hoverTarget) hoverEnd();
	const path = link && notePathOfLink(link);
	if (!link || !path) return;
	hoverTarget = link;
	hoverNote(path, link);
});
// Leaving the frame (e.g. towards the preview): mouseleave fires on the root element, not on document.
document.documentElement.addEventListener("mouseleave", () => hoverTarget && hoverEnd());

// Form submission is blocked by the sandbox (no allow-forms), which also
// suppresses the submit event. Re-dispatch a cancelable submit event so
// ordinary `form.onsubmit` handlers keep working.
function dispatchSubmit(form: HTMLFormElement, submitter: HTMLElement | null) {
	const ev =
		typeof SubmitEvent === "function"
			? new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter })
			: new Event("submit", { bubbles: true, cancelable: true });
	form.dispatchEvent(ev);
}
document.addEventListener(
	"click",
	(event) => {
		const button = (event.target as Element | null)?.closest?.("button, input[type=submit]") as
			| HTMLButtonElement
			| HTMLInputElement
			| null;
		if (!button || !button.form) return;
		const type = (button.getAttribute("type") || "submit").toLowerCase();
		if (type !== "submit") return;
		event.preventDefault();
		dispatchSubmit(button.form, button);
	},
	false
);
document.addEventListener("keydown", (event) => {
	if (event.key !== "Enter" || event.defaultPrevented) return;
	const input = event.target as HTMLInputElement | null;
	if (!input || input.tagName !== "INPUT" || !input.form) return;
	if (["button", "checkbox", "radio", "file", "submit", "reset"].includes(input.type)) return;
	event.preventDefault();
	dispatchSubmit(input.form, null);
});

/* ------------------------------------------------------------------ export */

/** html-to-image, included in every block's srcdoc (src/document.ts). */
function screenshotLib(): HtmlToImageLibrary {
	if (!w.htmlToImage) throw new Error("Screenshot library is not loaded");
	return w.htmlToImage;
}

function primarySvg(): SVGSVGElement | null {
	const body = document.body.getBoundingClientRect();
	const bodyArea = Math.max(1, body.width * body.height);
	let best: SVGSVGElement | null = null;
	let bestArea = 0;
	document.querySelectorAll("svg").forEach((svg) => {
		if (svg.parentElement?.closest("svg")) return;
		const r = svg.getBoundingClientRect();
		const area = r.width * r.height;
		if (area > bestArea) {
			best = svg;
			bestArea = area;
		}
	});
	return best && bestArea >= bodyArea * 0.5 ? best : null;
}

function serializeSvg(svg: SVGSVGElement): string {
	const rect = svg.getBoundingClientRect();
	const copy = svg.cloneNode(true) as SVGSVGElement;
	copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	copy.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
	if (!copy.getAttribute("width")) copy.setAttribute("width", String(Math.round(rect.width)));
	if (!copy.getAttribute("height")) copy.setAttribute("height", String(Math.round(rect.height)));
	const css =
		themeToCss(theme) +
		Array.from(document.querySelectorAll("style:not(#prism-theme):not(#prism-base):not(#prism-widgets)"))
			.map((s) => s.textContent || "")
			.join("\n");
	const style = createSvg("style");
	style.textContent = css;
	copy.insertBefore(style, copy.firstChild);
	copy.style.fontFamily = getComputedStyle(svg).fontFamily;
	copy.style.color = getComputedStyle(svg).color;
	return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(copy);
}

/**
 * Chromium defers some work while Obsidian is in the background (headless
 * renders from the command line): animation frames do not run, and
 * HTMLImageElement.decode() of raster images (every canvas becomes one in
 * html-to-image) never settles. Snapshots then hung until their timeout. During
 * an export, requested frames also fire after 50 ms and decode() of a loaded
 * image gives up waiting after 100 ms.
 */
async function withBackgroundFallbacks<T>(work: () => Promise<T>): Promise<T> {
	// eslint-disable-next-line @typescript-eslint/unbound-method -- re-invoked via .call(w)
	const nativeFrame = w.requestAnimationFrame;
	// eslint-disable-next-line @typescript-eslint/unbound-method -- re-invoked via .call(image)
	const nativeDecode = HTMLImageElement.prototype.decode;
	w.requestAnimationFrame = (cb: FrameRequestCallback) => {
		let done = false;
		const run = (t: number) => {
			if (done) return;
			done = true;
			cb(t);
		};
		const id = nativeFrame.call(w, run);
		window.setTimeout(() => run(performance.now()), 50);
		return id;
	};
	HTMLImageElement.prototype.decode = function (this: HTMLImageElement) {
		return Promise.race([nativeDecode.call(this), new Promise<void>((resolve) => window.setTimeout(resolve, 100))]);
	};
	try {
		return await work();
	} finally {
		w.requestAnimationFrame = nativeFrame;
		HTMLImageElement.prototype.decode = nativeDecode;
	}
}

async function exportImage(format: "png" | "svg", scale: number, background: string): Promise<string> {
	return withBackgroundFallbacks(() => renderImage(format, scale, background));
}

async function renderImage(format: "png" | "svg", scale: number, background: string): Promise<string> {
	const body = document.body;
	const width = Math.ceil(Math.max(body.scrollWidth, body.getBoundingClientRect().width));
	const height = Math.max(1, measure());
	if (format === "svg") {
		const svg = primarySvg();
		if (svg) return serializeSvg(svg);
		const images = screenshotLib();
		const url = await images.toSvg(body, { width, height, skipFonts: true });
		return decodeURIComponent(url.slice(url.indexOf(",") + 1));
	}
	const images = screenshotLib();
	return await images.toPng(body, {
		width,
		height,
		pixelRatio: scale,
		backgroundColor: background,
		skipFonts: true,
		cacheBust: false,
	});
}

/** The largest visible canvas of the block, the one a recording captures. */
function primaryCanvas(): HTMLCanvasElement | null {
	let best: HTMLCanvasElement | null = null;
	let bestArea = 0;
	document.querySelectorAll("canvas").forEach((c) => {
		const r = c.getBoundingClientRect();
		const area = r.width * r.height;
		if (area > bestArea) {
			best = c;
			bestArea = area;
		}
	});
	return best;
}

/** Records the block's main canvas for `seconds` as a WebM video (data URL). */
async function recordCanvas(seconds: number, fps: number): Promise<string> {
	const cv = primaryCanvas();
	if (!cv) throw new Error("Nothing to record: this block has no canvas. Recording captures canvas animations only.");
	if (typeof MediaRecorder !== "function" || typeof cv.captureStream !== "function") throw new Error("Video recording is not available here");
	const stream = cv.captureStream(fps);
	const type = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
	const recorder = new MediaRecorder(stream, { mimeType: type || undefined, videoBitsPerSecond: 8_000_000 });
	const chunks: Blob[] = [];
	recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
	const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
	recorder.start(250);
	await new Promise((r) => window.setTimeout(r, Math.max(1, Math.min(30, seconds)) * 1000));
	recorder.stop();
	await stopped;
	stream.getTracks().forEach((t) => t.stop());
	const blob = new Blob(chunks, { type: "video/webm" });
	return await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
		reader.onerror = () => reject(reader.error ?? new Error("Could not read the recording"));
		reader.readAsDataURL(blob);
	});
}

/* --------------------------------------------------- display mode, sections */

let displayMode: DisplayMode = config.displayMode || "inline";
const displayListeners = new Set<AnyFn>();
let section: SectionInfo | null = null;
const sectionListeners = new Set<AnyFn>();
let watchingSections = false;

/* ------------------------------------------------------- declarative charts */

type Rows = Record<string, unknown>[];

/** Rows for a chart/table spec and where they came from (to follow changes). */
async function specRows(spec: { source?: unknown; rows?: unknown; data?: unknown }): Promise<{ rows: Rows | null; from: "note" | "data" | "inline" | null }> {
	if (spec.data) return { rows: null, from: null };
	const src = spec.rows ?? spec.source;
	if (Array.isArray(src)) return { rows: src, from: "inline" };
	if (typeof src !== "string" || !src.trim()) {
		throw new Error('Set "source" ("^table-id", "table:<heading>" or a data file path) or "rows" in the spec.');
	}
	const s = src.trim();
	if (s.startsWith("^") || /^table:/i.test(s) || /^#\d+$/.test(s)) {
		const ref = s.startsWith("^") ? s : s.startsWith("#") ? Number(s.slice(1)) : s.slice(6).trim();
		return { rows: (await loadNote()).table(ref), from: "note" };
	}
	const value = await loadData(s);
	if (!Array.isArray(value)) throw new Error(`${s} does not contain a list of rows`);
	return { rows: value as Rows, from: "data" };
}

/**
 * Draws a chart from a spec ({ type, source, x, y, series, … }) into a canvas
 * or container and keeps it current when its note table or data file changes.
 */
async function chart(target: unknown, spec: ChartSpec): Promise<ChartInstance> {
	const Chart = w.Chart;
	if (!Chart) throw new Error("prism.chart needs Chart.js: add `chart` to the ```viz line.");
	if (!spec || typeof spec !== "object") throw new TypeError("prism.chart(target, spec): spec must be an object");
	let el = (typeof target === "string" ? document.querySelector(target) : target) as HTMLElement | null;
	if (!el) throw new Error(`prism.chart: no element matches ${JSON.stringify(target)}`);
	if (el.tagName !== "CANVAS") {
		if (!el.style.height && !el.style.position) el.style.cssText += `;position:relative;height:${Number(spec.height) || 300}px`;
		el = el.appendChild(createEl("canvas"));
	}
	let instance: ChartInstance | null = null;
	let warned = false;
	let from: string | null = null;
	const draw = async () => {
		const loaded = await specRows(spec);
		from = loaded.from;
		if (!warned) {
			warned = true;
			specWarnings(spec, loaded.rows).forEach((message) => report({ kind: "warning", message }));
		}
		const config = chartConfig(spec, loaded.rows);
		if (instance) {
			instance.data = config.data;
			instance.options = config.options;
			instance.update();
		} else instance = new Chart(el as HTMLCanvasElement, config);
		return instance;
	};
	const first = await draw();
	const redraw = () => {
		// Removed (e.g. another variant is shown) or destroyed: stop following changes.
		if (!el?.isConnected || !instance?.canvas) {
			noteListeners.delete(redraw);
			dataListeners.delete(redraw);
			return;
		}
		void draw().catch((err) => reportError(err, "error"));
	};
	if (from === "note") noteListeners.add(redraw);
	if (from === "data") dataListeners.add(redraw);
	return first;
}

/** Interactive table (search, sort, formatting) from a note table, data file or inline rows. */
async function table(target: unknown, spec: TableSpec): Promise<void> {
	if (!spec || typeof spec !== "object") throw new TypeError("prism.table(target, spec): spec must be an object");
	const el = (typeof target === "string" ? document.querySelector(target) : target) as HTMLElement | null;
	if (!el) throw new Error(`prism.table: no element matches ${JSON.stringify(target)}`);
	let warned = false;
	const draw = async () => {
		const { rows, from } = await specRows(spec);
		const list = (rows ?? []) as Rows & { columns?: string[] };
		if (!warned) {
			warned = true;
			const cols = Array.isArray(list.columns) ? list.columns : Object.keys(list[0] ?? {});
			tableWarnings(spec, cols).forEach((message) => report({ kind: "warning", message }));
		}
		renderTable(el, list, spec, {
			locale: config.locale || "en",
			stateGet: (k, f) => stateApi.get(k, f),
			stateSet: (k, v) => void stateApi.set(k, v).catch(() => undefined),
			resize: queueMeasure,
		});
		return from;
	};
	const from = await draw();
	const redraw = () => {
		if (!el.isConnected) {
			noteListeners.delete(redraw);
			dataListeners.delete(redraw);
			return;
		}
		void draw().catch((err) => reportError(err, "error"));
	};
	if (from === "note") noteListeners.add(redraw);
	if (from === "data") dataListeners.add(redraw);
}

/** Locale-aware formatting: number, integer, percent (0.12 or 12), eur, usd, date. */
function format(value: unknown, kind = "number", digits?: number): string {
	const locale = config.locale || "en";
	if (value === null || value === undefined || value === "") return "–";
	if (kind === "date") {
		const d = value instanceof Date ? value : new Date(toText(value));
		return isNaN(d.getTime()) ? toText(value) : new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
	}
	const n = typeof value === "number" ? value : Number(toText(value).replace(",", "."));
	if (!Number.isFinite(n)) return toText(value);
	const opts: Intl.NumberFormatOptions =
		kind === "percent"
			? { style: "percent", maximumFractionDigits: digits ?? 1 }
			: kind === "eur" || kind === "usd"
			? { style: "currency", currency: kind.toUpperCase(), maximumFractionDigits: digits ?? 0 }
			: kind === "integer"
			? { maximumFractionDigits: 0 }
			: { minimumFractionDigits: digits ?? 0, maximumFractionDigits: digits ?? 2 };
	return new Intl.NumberFormat(locale, opts).format(kind === "percent" && Math.abs(n) > 1 ? n / 100 : n);
}

/* -------------------------------------------------------------------- zoom */

// Pinch-to-zoom. The host scales the whole frame, so libraries keep getting
// correct pointer coordinates; this document only reports the gestures.
// Plain wheel and one-finger scrolling are left alone and scroll the note.
// The frame is usually out of process: by the time the host reads a message
// the zoom may have changed again, so frame coordinates are only sent where
// the frame is at rest (a gesture's anchor); movement goes as screen deltas,
// which no zoom affects.
let zoomScale = 1;
let chartRatioTimer = 0;
let lastZoomWheel = -Infinity;
// Where a press starts something of its own instead of panning.
const OWN_DRAG = "a,button,input,select,textarea,label,summary,option,[contenteditable],[draggable=true],[role=button],[role=slider],[role=scrollbar]";

window.addEventListener(
	"wheel",
	(e) => {
		// Trackpad pinches arrive as wheel events with ctrlKey set; a block with its own zoom (d3.zoom) handles them first.
		if (!e.ctrlKey || e.defaultPrevented) return;
		e.preventDefault();
		const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
		// Chromium reports a pinch as deltaY = -100·ln(scale); a ctrl+mouse-wheel notch is capped to a gentle step.
		const factor = Math.exp(-Math.max(-25, Math.min(25, px)) / 100);
		const fresh = e.timeStamp - lastZoomWheel > 150;
		lastZoomWheel = e.timeStamp;
		send(fresh ? { type: "zoom", factor, x: e.clientX, y: e.clientY } : { type: "zoom", factor });
	},
	{ passive: false }
);

let pinch: { x: number; y: number; distance: number } | null = null;
const between = (touches: TouchList, screen: boolean) => {
	const [a, b] = [touches[0], touches[1]];
	const [ax, ay, bx, by] = screen ? [a.screenX, a.screenY, b.screenX, b.screenY] : [a.clientX, a.clientY, b.clientX, b.clientY];
	return { x: (ax + bx) / 2, y: (ay + by) / 2, distance: Math.hypot(ax - bx, ay - by) };
};
window.addEventListener(
	"touchstart",
	(e) => {
		if (e.touches.length !== 2 || e.defaultPrevented) return;
		pinch = between(e.touches, true);
		const at = between(e.touches, false);
		send({ type: "pinch", phase: "start", x: at.x, y: at.y });
	},
	{ passive: true }
);
window.addEventListener(
	"touchmove",
	(e) => {
		if (!pinch || e.touches.length !== 2) return;
		e.preventDefault();
		const next = between(e.touches, true);
		const factor = pinch.distance > 0 && next.distance > 0 ? next.distance / pinch.distance : 1;
		send({ type: "pinch", phase: "move", factor, dx: next.x - pinch.x, dy: next.y - pinch.y });
		pinch = next;
	},
	{ passive: false }
);
const endPinch = (e: TouchEvent) => {
	if (!pinch || e.touches.length === 2) return;
	pinch = null;
	send({ type: "pinch", phase: "end" });
};
window.addEventListener("touchend", endPinch);
window.addEventListener("touchcancel", endPinch);
// WebKit (iOS) zooms the page on its own gesture events.
window.addEventListener("gesturestart", (e) => e.preventDefault());

// Zoomed in, the content can be dragged around with the mouse.
let drag: { x: number; y: number; moving: boolean } | null = null;
window.addEventListener("mousedown", (e) => {
	if (zoomScale <= 1 || e.button !== 0 || e.defaultPrevented) return;
	if ((e.target as Element | null)?.closest?.(OWN_DRAG)) return;
	drag = { x: e.screenX, y: e.screenY, moving: false };
});
window.addEventListener("mousemove", (e) => {
	if (!drag) return;
	if (!drag.moving) {
		if (Math.hypot(e.screenX - drag.x, e.screenY - drag.y) < 4) return;
		drag.moving = true;
		document.documentElement.classList.add("prism-panning");
		window.getSelection()?.removeAllRanges();
	}
	send({ type: "pan", dx: e.screenX - drag.x, dy: e.screenY - drag.y });
	drag.x = e.screenX;
	drag.y = e.screenY;
});
window.addEventListener("mouseup", () => {
	if (!drag) return;
	if (drag.moving) {
		document.documentElement.classList.remove("prism-panning");
		// The release after a drag is not a click on whatever is under the pointer.
		const swallow = (e: MouseEvent) => {
			e.stopPropagation();
			e.preventDefault();
		};
		window.addEventListener("click", swallow, { capture: true, once: true });
		window.setTimeout(() => window.removeEventListener("click", swallow, true), 0);
	}
	drag = null;
});

function setZoomScale(scale: number) {
	zoomScale = scale;
	const root = document.documentElement;
	root.classList.toggle("prism-zoomed", scale > 1);
	// Canvas charts are bitmaps: redraw them sharp once the gesture settles (bounded to keep memory in check).
	window.clearTimeout(chartRatioTimer);
	chartRatioTimer = window.setTimeout(() => {
		const base = window.devicePixelRatio || 1;
		const ratio = Math.max(base, Math.min(base * scale, 4));
		Object.values(w.Chart?.instances || {}).forEach((chart) =>
			safe(() => {
				const options = chart.options as { devicePixelRatio?: number };
				if (options.devicePixelRatio === ratio || (!options.devicePixelRatio && ratio === base)) return;
				options.devicePixelRatio = ratio;
				chart.resize();
			})
		);
	}, 200);
}

/* ---------------------------------------------------------------- messages */

window.addEventListener("message", (event) => {
	if (event.source !== host) return;
	const msg = event.data as HostMessage & { [MARK]?: number };
	if (!msg || msg[MARK] !== 1) return;
	switch (msg.type) {
		case "theme":
			applyTheme(msg.theme);
			themeListeners.forEach((cb) => safe(cb, prism.theme));
			queueMeasure();
			break;
		case "state":
			state = { ...msg.state };
			stateListeners.forEach((cb) => safe(cb, clone(state)));
			break;
		case "notesChanged":
			notesListeners.forEach((cb) => safe(cb));
			break;
		case "noteChanged":
			noteListeners.forEach((cb) => safe(cb));
			break;
		case "shared":
			shared = { ...msg.shared };
			sharedListeners.forEach((cb) => safe(cb, clone(shared), msg.key));
			break;
		case "measure":
			postHeight(true);
			break;
		case "dataChanged":
			dataListeners.forEach((cb) => safe(cb, msg.path));
			break;
		case "reply": {
			const p = pending.get(msg.id);
			if (!p) return;
			pending.delete(msg.id);
			if (msg.ok) p.resolve(msg.result);
			else p.reject(new Error(msg.error || "Request failed"));
			break;
		}
		case "export":
			exportImage(msg.format, msg.scale, msg.background).then(
				(result) => send({ type: "reply", id: msg.id, ok: true, result }),
				(err) => send({ type: "reply", id: msg.id, ok: false, error: describe(err) })
			);
			break;
		case "record":
			recordCanvas(msg.seconds, msg.fps).then(
				(result) => send({ type: "reply", id: msg.id, ok: true, result }),
				(err) => send({ type: "reply", id: msg.id, ok: false, error: describe(err) })
			);
			break;
		case "display":
			if (msg.mode === displayMode) break;
			displayMode = msg.mode;
			document.documentElement.classList.toggle("is-fullscreen", displayMode === "fullscreen");
			displayListeners.forEach((cb) => safe(cb, displayMode));
			queueMeasure();
			break;
		case "perf":
			setPerfReporting(!!msg.on, (stats) => send({ type: "perf", stats }));
			break;
		case "perfSnapshot":
			perfListeners.forEach((cb) => safe(cb, msg.snapshot));
			break;
		case "zoomed":
			setZoomScale(msg.scale);
			break;
		case "section": {
			const next = msg.section ?? null;
			if (JSON.stringify(next) === JSON.stringify(section)) break;
			section = next;
			sectionListeners.forEach((cb) => safe(cb, section ? { ...section } : null));
			break;
		}
	}
});

/* -------------------------------------------------------------------- perf */

const perfListeners = new Set<AnyFn>();
const perfApi = {
	/** Calls cb(snapshot) every second while the block is visible: CPU and memory of every block on this page. Returns an unsubscribe function. */
	watch(cb: (snapshot: PerfSnapshot) => void) {
		perfListeners.add(cb);
		if (perfListeners.size === 1) void request("perfWatch", { on: true }).catch(() => undefined);
		return () => {
			if (perfListeners.delete(cb) && perfListeners.size === 0) void request("perfWatch", { on: false }).catch(() => undefined);
		};
	},
};

/* ------------------------------------------------------------ public API */

const kitDeps: KitDeps = {
	state: stateApi,
	shared: sharedApi,
	safe,
	reportError: (err: unknown) => reportError(err, "error"),
	measure: queueMeasure,
};

const prism = {
	version: PRISM_VERSION,
	blockId: config.blockId,
	sourcePath: config.sourcePath,
	libs: config.libs.slice(),
	get theme() {
		return {
			dark: theme.dark,
			mode: theme.dark ? "dark" : "light",
			vars: { ...theme.vars },
			palette: theme.palette.slice(),
		};
	},
	get palette() {
		return theme.palette.slice();
	},
	/** Resolved value of an Obsidian CSS variable, e.g. prism.color("--text-accent"). */
	color: cssVar,
	onTheme(cb: AnyFn) {
		themeListeners.add(cb);
		return () => themeListeners.delete(cb);
	},
	openNote(path: string, newLeaf = false) {
		send({ type: "openNote", path: String(path), newLeaf: !!newLeaf });
	},
	notes(query: NotesQuery = {}): Promise<NoteMeta[]> {
		return request<NoteMeta[]>("notes", { query: clone(query) || {} });
	},
	onNotesChange(cb: AnyFn) {
		notesListeners.add(cb);
		return () => notesListeners.delete(cb);
	},
	/** The block's own note: frontmatter, tags, headings, links, backlinks and typed Markdown tables. */
	note: loadNote,
	/** Called when the block's own note changes (text, frontmatter, tables). */
	onNoteChange(cb: AnyFn) {
		noteListeners.add(cb);
		return () => noteListeners.delete(cb);
	},
	/** State shared by all blocks of this note. */
	shared: sharedApi,
	/** Reads an allowlisted data file: CSV/TSV as row objects, JSON/YAML parsed, TXT as string. */
	data: loadData,
	/** Lists readable data files, optionally below a folder. */
	dataFiles(folder?: string): Promise<DataFileInfo[]> {
		return request<DataFileInfo[]>("dataFiles", { folder: folder === undefined ? undefined : String(folder) });
	},
	/** HTTP request through Obsidian (only when the user enabled Online access → API requests): { status, ok, headers, text, json() }. prism.http.json(url) parses and rejects on errors. */
	http: createHttp(request, !!config.online?.confirm),
	/** CPU and memory of the blocks on this page (see prism.monitor for a ready-made view). */
	perf: perfApi,
	/** Page monitor: RAM (MB) and CPU (% of the whole machine) of this page. Returns a stop function. */
	monitor: (target: unknown, options: MonitorOptions = {}) => renderMonitor(target, options, { watch: (cb) => perfApi.watch(cb), format }),
	/** Online access switches set by the user: { http, confirm, web }. Read-only. */
	get online() {
		return { http: false, confirm: false, web: false, ...(config.online ?? {}) };
	},
	/** Called with the path when a data file read by this block changes. */
	onDataChange(cb: AnyFn) {
		dataListeners.add(cb);
		return () => dataListeners.delete(cb);
	},
	/** The CSV parser used by prism.data, for inline CSV text. */
	parseCsv,
	/** Declarative Chart.js chart from a note table, data file or inline rows. */
	chart,
	/** Renders LaTeX ($…$, $$…$$) inside an element with KaTeX (automatic for the initial content). */
	math: renderMath,
	/** Interactive table with search and sorting. */
	table,
	/** Obsidian's UI language, e.g. "de". */
	locale: config.locale || "en",
	/** Formats numbers, currencies, percentages and dates in Obsidian's language. */
	format,
	state: stateApi,
	resize() {
		postHeight(true);
	},
	toast,
	/** Crisp 2D canvas that follows its element's size: { canvas, ctx, width, height, dpr, onResize, clear }. */
	canvas: (target: unknown) => canvas(target, kitDeps),
	/** Runs frame(dt, t) every display frame; pauses off screen, respects reduced motion. Returns { play, pause, toggle, playing, time, reset, redraw, onChange }. */
	animate: (frame: (dt: number, t: number) => void, options: AnimateOptions = {}) => animate(frame, options, kitDeps),
	/** Segmented control (pill group) for 2–6 exclusive options; persists with { key }. */
	segmented: (target: unknown, options: Choice[], opts: SegmentedOptions = {}) => segmented(target, options, opts, kitDeps),
	/** Alternative views of the same content with a switcher; the reader's choice persists. */
	variants: (target: unknown, list: Variant[], opts: { key?: string; value?: string } = {}) => variants(target, list, opts, kitDeps),
	/** True when the reader asked the system to reduce motion. */
	get reducedMotion() {
		return reducedMotion();
	},
	/** "inline" or "fullscreen" (the block's fullscreen view). */
	get displayMode() {
		return displayMode;
	},
	onDisplayMode(cb: AnyFn) {
		displayListeners.add(cb);
		return () => displayListeners.delete(cb);
	},
	/** The heading of the note the reader is at ({ index, heading, level, line }), or null. */
	get section() {
		return section ? { ...section } : null;
	},
	/** Called with the current section whenever the reader scrolls to another heading (scrollytelling). */
	onSection(cb: AnyFn) {
		sectionListeners.add(cb);
		if (!watchingSections) {
			watchingSections = true;
			send({ type: "watch", what: "sections" });
		}
		return () => sectionListeners.delete(cb);
	},
	/** Shows Obsidian's page preview of a note next to an element, rectangle or mouse event. */
	hoverNote,
	/** Hides a preview opened with prism.hoverNote. */
	hoverEnd,
	/** Internal: called once after the bundled libraries have loaded. */
	_afterLibs() {
		delete (prism as Partial<typeof prism>)._afterLibs;
		safe(setupChart);
		safe(setupMermaid);
		safe(setupKatex);
	},
};
// Configurable so that a user `let prism` does not throw; read-only otherwise.
Object.defineProperty(w, "prism", { value: prism, writable: false, configurable: true });

/* ------------------------------------------------------- library adapters */

let colorCtx: CanvasRenderingContext2D | null = null;
function rgba(color: string): [number, number, number, number] {
	colorCtx = colorCtx || createEl("canvas").getContext("2d");
	if (!colorCtx) return [128, 128, 128, 1];
	colorCtx.fillStyle = "#808080";
	colorCtx.fillStyle = color;
	const v = String(colorCtx.fillStyle);
	if (v.startsWith("#")) {
		const n = parseInt(v.slice(1), 16);
		return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
	}
	const parts = v.replace(/[^\d.,]/g, "").split(",").map(Number);
	return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts.length > 3 ? parts[3] : 1];
}
function withAlpha(color: string, alpha: number): string {
	const [r, g, b] = rgba(color);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
/** Opaque hex color, blending translucent colors over the page background. */
function solid(color: string): string {
	const [r, g, b, a] = rgba(color);
	const [br, bg, bb] = rgba(cssVar("--background-primary") || (theme.dark ? "#1e1e1e" : "#ffffff"));
	const mix = (c: number, base: number) => Math.round(c * a + base * (1 - a));
	return "#" + [mix(r, br), mix(g, bg), mix(b, bb)].map((c) => c.toString(16).padStart(2, "0")).join("");
}

function setupChart() {
	const Chart = w.Chart;
	if (!Chart) return;
	const auto = new WeakSet<object>();
	const SEGMENTED = new Set(["pie", "doughnut", "polarArea"]);
	const applyDefaults = () => {
		Chart.defaults.color = cssVar("--text-muted");
		Chart.defaults.borderColor = withAlpha(cssVar("--text-muted") || "#888", 0.18);
		Chart.defaults.font.family = cssVar("--font-text") || Chart.defaults.font.family;
		if (Chart.defaults.plugins?.colors) Chart.defaults.plugins.colors.enabled = false;
	};
	applyDefaults();
	Chart.register({
		id: "prismTheme",
		beforeLayout(chart: { config: { type?: string; data?: { labels?: unknown[]; datasets?: ChartDataset[] } } }) {
			const palette = theme.palette;
			const data = chart.config.data || {};
			(data.datasets || []).forEach((ds, i) => {
				if (!auto.has(ds) && (ds.backgroundColor !== undefined || ds.borderColor !== undefined)) return;
				auto.add(ds);
				const type = ds.type || chart.config.type || "";
				if (SEGMENTED.has(type)) {
					const n = Math.max(data.labels?.length || 0, ds.data?.length || 0);
					ds.backgroundColor = Array.from({ length: n }, (_, j) => palette[j % palette.length]);
					ds.borderColor = cssVar("--background-primary");
				} else {
					const c = palette[i % palette.length];
					ds.borderColor = c;
					ds.backgroundColor = withAlpha(c, type === "line" || type === "radar" ? 0.18 : 0.75);
				}
			});
		},
	});
	prism.onTheme(() => {
		applyDefaults();
		Object.values(Chart.instances || {}).forEach((chart) => safe(() => chart.update("none")));
	});
}

function mermaidTheme() {
	const v = (name: string, fallback: string) => solid(cssVar(name) || fallback);
	const bg = v("--background-primary", theme.dark ? "#1e1e1e" : "#ffffff");
	const alt = v("--background-secondary", theme.dark ? "#262626" : "#f6f6f6");
	const text = v("--text-normal", theme.dark ? "#dadada" : "#222222");
	const muted = v("--text-muted", "#888888");
	const accent = v("--interactive-accent", "#7c3aed");
	const border = v("--background-modifier-border", "#999999");
	return {
		darkMode: theme.dark,
		background: bg,
		fontFamily: cssVar("--font-text") || "sans-serif",
		primaryColor: alt,
		primaryTextColor: text,
		primaryBorderColor: accent,
		secondaryColor: v("--background-primary-alt", alt),
		secondaryTextColor: text,
		secondaryBorderColor: border,
		tertiaryColor: bg,
		tertiaryTextColor: text,
		tertiaryBorderColor: border,
		lineColor: muted,
		textColor: text,
		mainBkg: alt,
		nodeBorder: accent,
		clusterBkg: v("--background-primary-alt", bg),
		clusterBorder: border,
		titleColor: text,
		edgeLabelBackground: bg,
		noteBkgColor: alt,
		noteTextColor: text,
		noteBorderColor: border,
		actorBkg: alt,
		actorBorder: accent,
		actorTextColor: text,
		signalColor: text,
		signalTextColor: text,
		labelBoxBkgColor: alt,
		labelTextColor: text,
	};
}

const MATH_OPTIONS = {
	delimiters: [
		{ left: "$$", right: "$$", display: true },
		{ left: "\\[", right: "\\]", display: true },
		{ left: "\\(", right: "\\)", display: false },
		{ left: "$", right: "$", display: false },
	],
	ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code", "option", "svg"],
	ignoredClasses: ["no-math"],
	throwOnError: false,
	strict: "ignore",
	errorCallback: (message: string) => report({ kind: "error", message: `KaTeX: ${message}` }),
};

/** Renders $…$ / $$…$$ formulas inside `target` (default: the whole block). */
function renderMath(target?: unknown) {
	const render = w.renderMathInElement;
	if (!render) throw new Error("prism.math needs KaTeX: add `katex` (or `math`) to the ```viz line.");
	const el = (typeof target === "string" ? document.querySelector(target) : target ?? document.body) as HTMLElement | null;
	if (!el) throw new Error(`prism.math: no element matches ${JSON.stringify(target)}`);
	render(el, MATH_OPTIONS);
	queueMeasure();
}

function setupKatex() {
	if (!w.renderMathInElement) return;
	const run = () => safe(renderMath);
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
	else run();
}

const WIKILINKS = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;

/** Replaces [[Note|Text]] in diagram source by its display text; returns display text → note. */
function stripWikilinks(source: string): { text: string; links: Map<string, string> } {
	const links = new Map<string, string>();
	const text = source.replace(WIKILINKS, (_, note: string, alias?: string) => {
		const shown = (alias ?? note.split("/").pop() ?? note).trim();
		links.set(shown, note.trim());
		return shown;
	});
	return { text, links };
}

/** Makes diagram nodes whose label contains a linked text open that note on click. */
function linkNotesIn(root: Element, links: Map<string, string>) {
	if (!links.size) return;
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const hits: [Text, string][] = [];
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		const value = n.nodeValue || "";
		for (const [shown, note] of links) if (shown && value.includes(shown)) hits.push([n as Text, note]);
	}
	if (!hits.length) return;
	for (const [text, target] of hits) {
		const label = text.parentElement;
		if (label) {
			label.classList.add("prism-note-link-text");
			// Inline as well: exports copy inline styles of diagram labels, not stylesheet rules.
			label.style.setProperty("color", cssVar("--link-color") || cssVar("--text-accent"), "important");
			label.style.setProperty("fill", cssVar("--link-color") || cssVar("--text-accent"), "important");
			label.style.setProperty("text-decoration", getComputedStyle(label).textDecorationLine || "underline");
		}
		// The whole shape is the click target; fall back to the nearest group.
		const node =
			[".node", ".mindmap-node", ".actor", ".task", ".section"].map((sel) => label?.closest(sel)).find(Boolean) ?? label?.closest("g") ?? label;
		if (!node || (node as HTMLElement).dataset?.prismNote) continue;
		node.classList.add("prism-note-link");
		node.setAttribute("data-prism-note", target);
		node.setAttribute("role", "link");
		node.setAttribute("tabindex", "0");
		const open = (e: Event) => {
			e.preventDefault();
			e.stopPropagation();
			prism.openNote(target, (e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey);
		};
		node.addEventListener("click", open);
		node.addEventListener("keydown", (e) => {
			if ((e as KeyboardEvent).key === "Enter") open(e);
		});
	}
}

function setupMermaid() {
	const mermaid = w.mermaid;
	if (!mermaid) return;
	const init = () =>
		mermaid.initialize({
			startOnLoad: false,
			securityLevel: "strict",
			theme: "base",
			themeVariables: mermaidTheme(),
			fontFamily: cssVar("--font-text") || "sans-serif",
			// Label boxes are measured without slack; exports rasterize text slightly
			// wider, which clipped the last characters. Part of the SVG's own <style>,
			// so it also applies to exported SVGs.
			themeCSS: "foreignObject{overflow:visible}",
		});
	init();
	const run = () => {
		const nodes = Array.from(document.querySelectorAll<HTMLElement>(".mermaid")).filter(
			(n) => !n.getAttribute("data-processed")
		);
		if (!nodes.length) return;
		const links = new Map<HTMLElement, Map<string, string>>();
		nodes.forEach((n) => {
			if (!n.hasAttribute("data-prism-src")) n.setAttribute("data-prism-src", n.textContent || "");
			const stripped = stripWikilinks(n.getAttribute("data-prism-src") || "");
			n.textContent = stripped.text;
			links.set(n, stripped.links);
		});
		Promise.resolve(mermaid.run({ nodes, suppressErrors: false }))
			.catch((err: unknown) => {
				// Mermaid rejects with an Error or with a plain { str } object.
				const e = err as { message?: string; str?: string } | undefined;
				report({ kind: "mermaid", message: "Mermaid: " + (e?.message || e?.str || describe(err)) });
			})
			.finally(() => {
				nodes.forEach((n) => safe(linkNotesIn, n, links.get(n) ?? new Map()));
				queueMeasure();
			});
	};
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
	else run();
	prism.onTheme(() => {
		init();
		document.querySelectorAll<HTMLElement>("[data-prism-src]").forEach((n) => {
			n.removeAttribute("data-processed");
			n.textContent = n.getAttribute("data-prism-src");
		});
		run();
	});
}

/* ------------------------------------------------------------------ start */

window.addEventListener("load", () => {
	document.documentElement.classList.toggle("is-fullscreen", displayMode === "fullscreen");
	startObservers();
	lastHeight = measure();
	send({ type: "ready", height: lastHeight });
});
window.setInterval(() => send({ type: "heartbeat" }), 2000);
