// Measures what a block costs, for page monitors (```viz monitor, prism.perf).
//
// Blocks share Obsidian's renderer process and JS heap, so the operating
// system cannot tell them apart. Instead every entry point into the block's
// code is timed: animation frames, timers, event listeners and handlers,
// observers – each including the microtasks it starts (code after an await).
// Installed by the prelude before libraries and user scripts run.

import type { BlockPerfStats } from "../protocol";

type Fn = (...args: unknown[]) => unknown;

const now = () => performance.now();
const microtask = (fn: () => void) => void Promise.resolve().then(fn);
const nativeSetInterval = window.setInterval.bind(window);
const nativeClearInterval = window.clearInterval.bind(window);

let busy = 0;
let depth = 0;
let regionStart = 0;
let lastEnd = 0;

function endRegion(start: number) {
	const t = now();
	busy += Math.max(0, t - Math.max(start, lastEnd));
	lastEnd = t;
}

/** Wraps a callback so its run time (plus the microtasks it queues) counts as the block's CPU time. */
function timed<F extends Fn>(fn: F): F {
	const wrapped = function (this: unknown, ...args: unknown[]) {
		if (depth++ === 0) regionStart = now();
		try {
			return fn.apply(this, args);
		} finally {
			if (--depth === 0) {
				const start = regionStart;
				// Two hops: runs after the continuations the callback resolved.
				microtask(() => microtask(() => endRegion(start)));
			}
		}
	};
	return wrapped as unknown as F;
}

function patchEventTargets() {
	const proto = EventTarget.prototype;
	const add = proto.addEventListener;
	const remove = proto.removeEventListener;
	const wrappers = new WeakMap<object, EventListener>();
	const wrapperOf = (listener: EventListenerOrEventListenerObject): EventListener => {
		let w = wrappers.get(listener);
		if (!w) {
			w =
				typeof listener === "function"
					? timed(listener as Fn) as EventListener
					: timed(function (e: unknown) {
							return (listener as EventListenerObject).handleEvent(e as Event);
					  } as Fn) as EventListener;
			wrappers.set(listener, w);
		}
		return w;
	};
	proto.addEventListener = function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
		return add.call(this, type, listener && (typeof listener === "function" || typeof listener === "object") ? wrapperOf(listener) : listener, options);
	};
	proto.removeEventListener = function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
		return remove.call(this, type, (listener && wrappers.get(listener)) || listener, options);
	};
}

/** el.onclick = fn and friends. */
function patchHandlerProperties(target: object | undefined) {
	if (!target) return;
	for (const name of Object.getOwnPropertyNames(target)) {
		if (!name.startsWith("on")) continue;
		const d = Object.getOwnPropertyDescriptor(target, name);
		if (!d || !d.get || !d.set || !d.configurable) continue;
		const { get, set } = d;
		const originals = new WeakMap<object, unknown>();
		Object.defineProperty(target, name, {
			...d,
			get(this: unknown) {
				const value = get.call(this) as object | null;
				return (value && originals.get(value)) ?? value;
			},
			set(this: unknown, value: unknown) {
				if (typeof value !== "function") return set.call(this, value);
				const w = timed(value as Fn);
				originals.set(w, value);
				set.call(this, w);
			},
		});
	}
}

function patchScheduling(w: Window & typeof globalThis) {
	const raf = w.requestAnimationFrame;
	w.requestAnimationFrame = function (cb: FrameRequestCallback) {
		return raf.call(w, typeof cb === "function" ? timed(cb as Fn) as FrameRequestCallback : cb);
	};
	for (const name of ["setTimeout", "setInterval"] as const) {
		const native = w[name] as unknown as Fn;
		w[name] = function (handler: unknown, ...rest: unknown[]) {
			return native.call(w, typeof handler === "function" ? timed(handler as Fn) : handler, ...rest);
		} as unknown as typeof setTimeout & typeof setInterval;
	}
	for (const name of ["ResizeObserver", "MutationObserver", "IntersectionObserver", "PerformanceObserver"]) {
		const Native = (w as unknown as Record<string, (new (cb: Fn, ...rest: unknown[]) => object) | undefined>)[name];
		if (typeof Native !== "function") continue;
		const Patched = class extends Native {
			constructor(cb: Fn, ...rest: unknown[]) {
				super(typeof cb === "function" ? timed(cb) : cb, ...rest);
			}
		};
		Object.defineProperty(Patched, "name", { value: name });
		(w as unknown as Record<string, unknown>)[name] = Patched;
	}
}

/* ---------------------------------------------------------------- memory */

type ContextKind = "2d" | "webgl" | "bitmap";
const contexts = new WeakMap<HTMLCanvasElement, ContextKind>();

function patchCanvas() {
	const proto = HTMLCanvasElement.prototype;
	const getContext = proto.getContext;
	proto.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
		const ctx = (getContext as unknown as Fn).call(this, kind, ...rest);
		if (ctx && !contexts.has(this)) contexts.set(this, /^webgl/.test(kind) ? "webgl" : kind === "bitmaprenderer" ? "bitmap" : "2d");
		return ctx;
	} as typeof proto.getContext;
}

/** Backing stores of canvases (WebGL: color, back and depth buffers) and decoded images. */
function graphicsBytes(): number {
	let bytes = 0;
	for (const canvas of Array.from(document.getElementsByTagName("canvas"))) {
		const kind = contexts.get(canvas);
		if (kind) bytes += canvas.width * canvas.height * 4 * (kind === "webgl" ? 3 : 1);
	}
	for (const img of Array.from(document.images)) {
		if (img.complete) bytes += img.naturalWidth * img.naturalHeight * 4;
	}
	return bytes;
}

/* -------------------------------------------------------------- reporting */

let startupMs = 0;
let reportTimer = 0;
let lastReport = 0;

/** Installs the instrumentation. Call once, first thing in the prelude. */
export function installPerf(w: Window & typeof globalThis) {
	const t0 = now();
	try {
		patchEventTargets();
		patchHandlerProperties(HTMLElement.prototype);
		patchHandlerProperties(SVGElement.prototype);
		patchHandlerProperties(Document.prototype);
		patchHandlerProperties(Object.getPrototypeOf(w));
		patchHandlerProperties(w);
		patchScheduling(w);
		patchCanvas();
	} catch (err) {
		console.warn("Prism: performance measurement unavailable", err);
	}
	// Parsing and running the inline scripts and libraries is not a callback;
	// count the time until the block has loaded as its startup cost.
	w.addEventListener("load", () => {
		startupMs = now() - t0;
		busy = Math.max(busy, startupMs);
	});
}

/** Starts or stops the per-second reports (only while a page monitor is visible). */
export function setPerfReporting(on: boolean, send: (stats: BlockPerfStats) => void) {
	if (on && !reportTimer) {
		lastReport = now();
		busy = 0;
		reportTimer = nativeSetInterval(() => {
			const t = now();
			send({ cpuMs: busy, periodMs: t - lastReport, startupMs, nodes: document.getElementsByTagName("*").length, graphicsBytes: graphicsBytes() });
			busy = 0;
			lastReport = t;
		}, 1000);
	} else if (!on && reportTimer) {
		nativeClearInterval(reportTimer);
		reportTimer = 0;
	}
}
