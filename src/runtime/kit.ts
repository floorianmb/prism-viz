// Building blocks for blocks with canvas scenes, animations and controls:
// prism.canvas, prism.animate, prism.segmented, prism.variants. They take the
// boilerplate (devicePixelRatio, resize, pausing off screen, reduced motion,
// persisted choices) off the block author, so blocks stay short.

/** Listener of any arity; the emitter passes the arguments, so they are not typed here. */
type AnyFn = (...args: never[]) => unknown;

interface Store {
	get(key: string, fallback?: unknown): unknown;
	set(key: string, value: unknown): Promise<void>;
	onChange(cb: AnyFn): () => boolean;
}

export interface KitDeps {
	state: Store;
	shared: Store;
	safe: (fn: AnyFn, ...args: unknown[]) => void;
	reportError: (err: unknown) => void;
	measure: () => void;
}

function resolve(target: unknown, api: string): HTMLElement {
	const el = (typeof target === "string" ? document.querySelector(target) : target) as HTMLElement | null;
	if (!el || !(el instanceof HTMLElement)) throw new Error(`${api}: no element matches ${JSON.stringify(target)}`);
	return el;
}

const reducedMotionQuery = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;

/** True when the reader asked the system to reduce motion. */
export function reducedMotion(): boolean {
	return !!reducedMotionQuery?.matches;
}

/* ------------------------------------------------------------------ canvas */

export interface Scene {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	/** Size in CSS pixels; draw in these units. */
	readonly width: number;
	readonly height: number;
	readonly dpr: number;
	/** Called with (width, height) after every resize. Returns an unsubscribe function. */
	onResize(cb: (width: number, height: number) => void): () => void;
	clear(): void;
}

/**
 * A crisp 2D canvas that follows its element's size. `target` is a canvas, or a
 * container that gets a canvas filling it (give the container a height).
 */
export function canvas(target: unknown, deps: KitDeps): Scene {
	const el = resolve(target, "prism.canvas");
	let cv: HTMLCanvasElement;
	if (el instanceof HTMLCanvasElement) cv = el;
	else {
		cv = document.createElement("canvas");
		for (const [prop, value] of [["display", "block"], ["width", "100%"], ["height", "100%"]]) cv.style.setProperty(prop, value);
		el.appendChild(cv);
	}
	const ctx = cv.getContext("2d");
	if (!ctx) throw new Error("prism.canvas: 2D canvas is not available");
	let width = 0;
	let height = 0;
	let dpr = 1;
	const listeners = new Set<(w: number, h: number) => void>();
	const fit = () => {
		const r = cv.getBoundingClientRect();
		const nextDpr = window.devicePixelRatio || 1;
		if (r.width === width && r.height === height && nextDpr === dpr && cv.width) return;
		width = r.width;
		height = r.height;
		dpr = nextDpr;
		cv.width = Math.max(1, Math.round(width * dpr));
		cv.height = Math.max(1, Math.round(height * dpr));
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		listeners.forEach((cb) => deps.safe(cb, width, height));
	};
	new ResizeObserver(fit).observe(cv);
	fit();
	return {
		canvas: cv,
		ctx,
		get width() {
			return width;
		},
		get height() {
			return height;
		},
		get dpr() {
			return dpr;
		},
		onResize(cb) {
			listeners.add(cb);
			return () => listeners.delete(cb);
		},
		clear() {
			ctx.clearRect(0, 0, width, height);
		},
	};
}

/* ----------------------------------------------------------------- animate */

export interface AnimateOptions {
	/** Start playing at once (default true; false under reduced motion). */
	autoplay?: boolean;
	/** Largest time step passed to the frame callback, in seconds (default 1/30). */
	maxDt?: number;
}

export interface Loop {
	play(): void;
	pause(): void;
	toggle(): void;
	readonly playing: boolean;
	/** Seconds of animation time played so far. */
	readonly time: number;
	/** Sets the animation time back to 0 and draws one frame. */
	reset(): void;
	/** Draws one frame without advancing time (e.g. after a control changed while paused). */
	redraw(): void;
	/** Called with `playing` whenever play/pause changes. */
	onChange(cb: (playing: boolean) => void): () => void;
}

/**
 * Runs `frame(dt, t)` once per display frame with real elapsed time (seconds,
 * clamped). Pauses while the block is off screen or the window is hidden;
 * starts paused under prefers-reduced-motion. The first call has dt = 0.
 */
export function animate(frame: (dt: number, t: number) => void, options: AnimateOptions, deps: KitDeps): Loop {
	if (typeof frame !== "function") throw new TypeError("prism.animate(frame): frame must be a function");
	const maxDt = options.maxDt ?? 1 / 30;
	let playing = (options.autoplay ?? true) && !reducedMotion();
	let onScreen = true;
	let time = 0;
	let last = 0;
	let handle = 0;
	const listeners = new Set<(p: boolean) => void>();
	const call = (dt: number) => {
		try {
			frame(dt, time);
		} catch (err) {
			// A throwing frame would report the same error 60 times a second.
			stop();
			playing = false;
			deps.reportError(err);
		}
	};
	const tick = (now: number) => {
		handle = 0;
		const dt = last ? Math.min((now - last) / 1000, maxDt) : 0;
		last = now;
		time += dt;
		call(dt);
		schedule();
	};
	const schedule = () => {
		if (handle || !playing || !onScreen) return;
		handle = window.requestAnimationFrame(tick);
	};
	const stop = () => {
		if (handle) cancelAnimationFrame(handle);
		handle = 0;
		last = 0;
	};
	const update = () => {
		const visible = onScreen && document.visibilityState !== "hidden";
		if (!visible || !playing) stop();
		else schedule();
	};
	new IntersectionObserver((entries) => {
		onScreen = entries.some((e) => e.isIntersecting);
		update();
	}).observe(document.body ?? document.documentElement);
	document.addEventListener("visibilitychange", update);
	const setPlaying = (next: boolean) => {
		if (next === playing) return;
		playing = next;
		update();
		listeners.forEach((cb) => deps.safe(cb, playing));
	};
	// First frame after the block's script has finished defining its state.
	queueMicrotask(() => {
		call(0);
		schedule();
	});
	return {
		play: () => setPlaying(true),
		pause: () => setPlaying(false),
		toggle: () => setPlaying(!playing),
		get playing() {
			return playing;
		},
		get time() {
			return time;
		},
		reset() {
			time = 0;
			last = 0;
			call(0);
		},
		redraw: () => call(0),
		onChange(cb) {
			listeners.add(cb);
			return () => listeners.delete(cb);
		},
	};
}

/* --------------------------------------------------------------- segmented */

export type Choice = string | number | { value: string | number; label?: string };

export interface SegmentedOptions {
	/** Persist the choice under this key (prism.state, or prism.shared with shared: true). */
	key?: string;
	shared?: boolean;
	/** Initial value when nothing is stored (default: the first option). */
	value?: string | number;
	/** Called with the value initially and on every change. */
	onChange?: (value: string | number) => void;
	/** Accessible name of the group. */
	label?: string;
}

export interface Segmented {
	readonly value: string | number;
	set(value: string | number): void;
	readonly el: HTMLElement;
}

/** A segmented control (pill group) for 2–6 exclusive options. */
export function segmented(target: unknown, choices: Choice[], options: SegmentedOptions, deps: KitDeps): Segmented {
	const el = resolve(target, "prism.segmented");
	if (!Array.isArray(choices) || !choices.length) throw new TypeError("prism.segmented(target, options): options must be a non-empty array");
	const items = choices.map((c) => (typeof c === "object" ? { value: c.value, label: String(c.label ?? c.value) } : { value: c, label: String(c) }));
	const store = options.shared ? deps.shared : deps.state;
	const known = (v: unknown) => items.some((i) => i.value === v);
	const stored = options.key ? store.get(options.key) : undefined;
	let value = known(stored) ? (stored as string | number) : known(options.value) ? (options.value as string | number) : items[0].value;

	const group = document.createElement("div");
	group.className = "segmented";
	group.setAttribute("role", "group");
	if (options.label) group.setAttribute("aria-label", options.label);
	const buttons = items.map((item) => {
		const b = document.createElement("button");
		b.type = "button";
		b.textContent = item.label;
		b.addEventListener("click", () => set(item.value, true));
		group.appendChild(b);
		return b;
	});
	el.appendChild(group);

	const paint = () => buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(items[i].value === value)));
	const emit = () => options.onChange && deps.safe(options.onChange, value);
	function set(next: string | number, persist: boolean) {
		if (!known(next) || next === value) return;
		value = next;
		paint();
		if (persist && options.key) void store.set(options.key, value).catch(deps.reportError);
		emit();
	}
	if (options.key) {
		const key = options.key;
		store.onChange((all: Record<string, unknown>) => {
			if (Object.prototype.hasOwnProperty.call(all, key)) set(all[key] as string | number, false);
		});
	}
	paint();
	emit();
	return {
		get value() {
			return value;
		},
		set: (v) => set(v, true),
		el: group,
	};
}

/* ---------------------------------------------------------------- variants */

export interface Variant {
	label: string;
	/** Draws the variant into `el`; may return a cleanup function. */
	render: (el: HTMLElement) => void | (() => void) | Promise<void | (() => void)>;
}

/**
 * Alternative views of the same content with a switcher above them, e.g. bar
 * vs. line vs. table. The reader's choice persists (key "variant" by default).
 */
export function variants(target: unknown, list: Variant[], options: { key?: string; value?: string }, deps: KitDeps): Segmented {
	const el = resolve(target, "prism.variants");
	if (!Array.isArray(list) || !list.length) throw new TypeError("prism.variants(target, variants): variants must be a non-empty array");
	el.classList.add("variants");
	const bar = document.createElement("div");
	bar.className = "variants-bar";
	const body = document.createElement("div");
	body.className = "variants-body";
	el.append(bar, body);
	let cleanup: void | (() => void);
	let run = 0;
	const show = async (label: string | number) => {
		const v = list.find((x) => x.label === label) ?? list[0];
		const mine = ++run;
		if (typeof cleanup === "function") deps.safe(cleanup);
		cleanup = undefined;
		body.replaceChildren();
		try {
			const result = await v.render(body);
			if (mine === run) cleanup = result;
			else if (typeof result === "function") deps.safe(result);
		} catch (err) {
			deps.reportError(err);
		}
		deps.measure();
	};
	return segmented(
		bar,
		list.map((v) => v.label),
		{ key: options.key ?? "variant", value: options.value, label: "Variant", onChange: (label) => void show(label) },
		deps
	);
}
