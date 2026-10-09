// One rendered Prism block: owns the sandboxed iframe, the message bridge,
// auto-height, the hover toolbar, the error badge and the watchdogs.

import { HoverParent, HoverPopover, MarkdownRenderChild, MarkdownRenderer, MarkdownView, Menu, Notice, TFile, setIcon } from "obsidian";
import type PrismPlugin from "../main";
import type { LineMap } from "./document";
import type { BlockRef } from "./errorLog";
import type { VizOptions } from "./options";
import { DisplayMode, FrameMessage, FrameRect, HostMessage, MARK, PerfSnapshot, RawFrameError, SectionInfo } from "./protocol";
import { dataUrlToArrayBuffer, hash, randomToken } from "./util";
import { DataAccessError } from "./data";
import { HTTP_OFF_MESSAGE, HttpApproval, sendHttp } from "./online/http";

export interface BlockSpec {
	kind: "codeblock" | "embed" | "file";
	source: string;
	options: VizOptions;
	/** Note path for code blocks, HTML file path for embeds/files. */
	sourcePath: string;
	/** Stable key for state, heights and the error log. */
	blockKey: string;
	blockIndex?: number;
	/** 1-based note lines of the opening and closing fence. */
	lines?: { start: number; end: number };
	/** 1-based line (in the note / HTML file) of the first content line. */
	contentStartLine: number;
	embeddedIn?: string;
}

/** Outcome of one render, used by headless renders (obsidian://prism?render=…). */
export interface FrameResult {
	block: string;
	blockIndex?: number;
	lines?: { start: number; end: number };
	title?: string;
	status: "ok" | "warning" | "error" | "timeout" | "skipped";
	errors: { kind: string; line?: number; message: string }[];
	height: number;
	snapshot?: string;
}

/** State key shared by all blocks of a note (an embedded HTML file shares with its note). */
export function sharedKey(spec: BlockSpec): string {
	return `${notePathOf(spec) ?? spec.sourcePath}#~shared`;
}

/** The note a block belongs to; null for an .html file opened on its own. */
export function notePathOf(spec: BlockSpec): string | null {
	if (spec.kind === "codeblock") return spec.sourcePath;
	if (spec.kind === "embed") return spec.embeddedIn ?? null;
	return null;
}

export interface FrameOptions {
	/** Force snapshots on/off regardless of the setting. */
	snapshot?: boolean;
	/** PDF export: render at once in the export window's theme and replace the frame with a static image. */
	print?: boolean;
	/** Command-line render (obsidian://prism?render=…), not shown to the user. */
	headless?: boolean;
}

interface ShownError {
	kind: RawFrameError["kind"];
	message: string;
	line?: number;
	blockLine?: number;
	origin?: string;
}

type HostRequestMessage = Omit<Extract<HostMessage, { type: "export" }>, "id"> | Omit<Extract<HostMessage, { type: "record" }>, "id">;

const RECORD_SECONDS = 5;
/** Grace time for the pointer to travel from a link to its preview (or back). */
const HOVER_CLOSE_DELAY = 300;
/** Share of the scroll area's height (from the top) that counts as "where the reader is". */
const READING_LINE = 0.35;

const SNAPSHOT_TIMEOUT = 10000;
const READY_TIMEOUT = 15000;
const STALL_TIMEOUT = 12000;
const MAX_MESSAGES_PER_SECOND = 400;

export class PrismFrame extends MarkdownRenderChild implements HoverParent {
	private popover: HoverPopover | null = null;
	private hoverTarget: HTMLElement | null = null;
	private hoverPath: string | null = null;
	private hoverCloseTimer: number | null = null;
	private sectionScroller: HTMLElement | null | undefined;
	private lastSection = "";
	sourceHash: string;
	private root!: HTMLElement;
	private stage!: HTMLElement;
	private toolbar: HTMLElement | null = null;
	private badge!: HTMLElement;
	private errorPanel!: HTMLElement;
	private sourceEl: HTMLElement | null = null;
	private noticeEl!: HTMLElement;
	private iframe: HTMLIFrameElement | null = null;
	private previous: HTMLIFrameElement | null = null;
	private lineMap: LineMap | null = null;
	private token = "";
	private docId: string | null = null;
	private docIdAtLastLoad: string | null = null;
	private generation = 0;
	private rendered = false;
	private ready = false;
	private visible = false;
	private autoHeight: boolean;
	private height: number;
	private heightFrozen = false;
	private growth: { at: number; delta: number }[] = [];
	private errors: ShownError[] = [];
	private lastBeat = 0;
	private timers = new Set<number>();
	private io: IntersectionObserver | null = null;
	private hostRequests = new Map<number, { resolve: (v: string) => void; reject: (e: Error) => void }>();
	private nextHostRequest = 1;
	private msgWindowStart = 0;
	private msgCount = 0;
	private lastOpen = 0;
	private lastToast = 0;
	private navigations = 0;
	private fullscreen = false;
	private themeVersion = -1;
	usesNotes = false;
	readonly dataPaths = new Set<string>();
	private result: FrameResult | null = null;
	/** The current render has started producing its result (snapshot + finish). */
	private resultPending = false;
	private resultWaiters: ((r: FrameResult) => void)[] = [];
	private listenedWindows = new Set<Window>();
	/** Holds prism.http requests until the reader clicks "Run requests" (Online access). */
	private httpApproval: HttpApproval;

	constructor(private plugin: PrismPlugin, containerEl: HTMLElement, public spec: BlockSpec, private frameOptions: FrameOptions = {}) {
		super(containerEl);
		this.sourceHash = hash(spec.source + "\n" + JSON.stringify(spec.options));
		this.autoHeight = spec.options.height === null && !spec.options.fill;
		this.height = spec.options.height ?? plugin.heights.get(spec.blockKey) ?? plugin.settings.defaultHeight;
		this.httpApproval = new HttpApproval(() => this.stage ?? null, !frameOptions.headless && !frameOptions.print);
	}

	get notePath(): string | null {
		return notePathOf(this.spec);
	}

	get ref(): BlockRef {
		const s = this.spec;
		return {
			block: s.blockKey,
			notePath: s.sourcePath,
			blockIndex: s.blockIndex,
			lines: s.lines,
			title: s.options.title,
			embeddedIn: s.embeddedIn,
		};
	}

	/* ------------------------------------------------------------ lifecycle */

	onload() {
		this.plugin.frames.add(this);
		this.buildDom();
		if (this.plugin.crashGuard.isSuspect(this.spec.blockKey, this.sourceHash)) {
			this.showCrashGuard();
			return;
		}
		this.observeVisibility();
		const lazy = this.plugin.settings.lazyRender && !this.spec.options.eager && this.spec.kind !== "file" && !this.frameOptions.print;
		if (!lazy) void this.render();
	}

	onunload() {
		this.generation++;
		this.plugin.frames.delete(this);
		this.io?.disconnect();
		this.io = null;
		for (const t of this.timers) window.clearTimeout(t);
		this.timers.clear();
		this.httpApproval.reset();
		this.plugin.perf.drop(this);
		for (const r of this.hostRequests.values()) r.reject(new Error("Block was unloaded"));
		this.hostRequests.clear();
		if (this.fullscreen) this.exitFullscreen();
		this.closePopover();
		this.destroyIframe(this.previous);
		this.destroyIframe(this.iframe);
		this.previous = this.iframe = null;
		this.plugin.crashGuard.done(this.spec.blockKey);
		// Loaded but unloaded before the settle delay: the render did finish.
		if (this.ready) this.plugin.errorLog.settled(this.spec.blockKey, this);
		this.plugin.errorLog.release(this.spec.blockKey, this);
	}

	private later(fn: () => void | Promise<void>, ms: number): number {
		const id = window.setTimeout(() => {
			this.timers.delete(id);
			void fn();
		}, ms);
		this.timers.add(id);
		return id;
	}

	private cancel(id: number | null) {
		if (id === null) return;
		window.clearTimeout(id);
		this.timers.delete(id);
	}

	/* ------------------------------------------------------------------ DOM */

	private buildDom() {
		const el = this.containerEl;
		el.addClass("prism-host");
		this.root = el.createDiv({ cls: "prism-block" });
		if (this.spec.options.fill) this.root.addClass("is-fill");
		if (this.spec.options.title) {
			this.root.createDiv({ cls: "prism-title", text: this.spec.options.title });
		}
		this.stage = this.root.createDiv({ cls: "prism-stage" });
		if (!this.spec.options.fill) this.stage.style.height = `${this.height}px`;
		this.stage.createDiv({ cls: "prism-placeholder", text: "Prism" });

		this.badge = this.stage.createDiv({ cls: "prism-badge" });
		this.badge.hide();
		this.badge.addEventListener("click", (e) => {
			e.stopPropagation();
			this.errorPanel.toggle(this.errorPanel.isShown() === false);
		});
		this.errorPanel = this.root.createDiv({ cls: "prism-errors" });
		this.errorPanel.hide();
		this.noticeEl = this.root.createDiv({ cls: "prism-notice" });
		this.noticeEl.hide();
		// In Live Preview a mousedown on the widget moves the cursor into the
		// block and reveals the source; keep Prism's own controls clickable.
		this.root.addEventListener("mousedown", (e) => {
			if ((e.target as Element | null)?.closest?.(".prism-toolbar, .prism-badge, .prism-errors, .prism-notice, .prism-http-bar")) e.stopPropagation();
		});

		if (this.frameOptions.print) this.root.addClass("is-print");
		else if (!this.spec.options.noToolbar) this.buildToolbar();
		if (this.spec.options.showSource) void this.toggleSource(true);
	}

	private buildToolbar() {
		const bar = (this.toolbar = this.stage.createDiv({ cls: "prism-toolbar" }));
		const button = (icon: string, label: string, onClick: (e: MouseEvent) => void) => {
			const b = bar.createEl("button", { cls: "prism-tool clickable-icon", attr: { "aria-label": label } });
			setIcon(b, icon);
			b.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				onClick(e);
			});
			return b;
		};
		button("code", "Show/hide source", () => void this.toggleSource());
		button("refresh-cw", "Reload", () => void this.render());
		button("maximize-2", "Fullscreen", () => this.toggleFullscreen());
		button("image", "Export PNG", () => void this.exportImage("png"));
		button("more-horizontal", "More", (e) => {
			const menu = new Menu();
			menu.addItem((i) => i.setTitle("Copy as PNG").setIcon("clipboard-copy").onClick(() => void this.copyImage()));
			menu.addItem((i) => i.setTitle(`Record video (${RECORD_SECONDS} s)`).setIcon("video").onClick(() => void this.record(RECORD_SECONDS)));
			menu.addItem((i) => i.setTitle("Export SVG").setIcon("file-image").onClick(() => void this.exportImage("svg")));
			menu.addItem((i) => i.setTitle("Save as .html in vault").setIcon("file-code").onClick(() => void this.plugin.saveAsHtml(this.spec)));
			menu.addItem((i) => i.setTitle("Copy source").setIcon("copy").onClick(() => void this.copy(this.spec.source, "Source copied")));
			menu.addItem((i) => i.setTitle("Copy prompt for agent").setIcon("bot").onClick(() => void this.copy(this.agentPrompt(), "Prompt copied – paste it into your agent")));
			if (this.errors.length) {
				menu.addItem((i) => i.setTitle("Copy errors").setIcon("alert-triangle").onClick(() => void this.copy(this.errorReport(), "Errors copied")));
			}
			menu.showAtMouseEvent(e);
		});
	}

	private async copy(text: string, message: string) {
		try {
			await navigator.clipboard.writeText(text);
			new Notice(message);
		} catch {
			new Notice("Clipboard is not available");
		}
	}

	private async toggleSource(force?: boolean) {
		if (!this.sourceEl) {
			this.sourceEl = this.root.createDiv({ cls: "prism-source" });
			const longest = Math.max(2, ...Array.from(this.spec.source.matchAll(/`+/g), (m) => m[0].length));
			const fence = "`".repeat(longest + 1);
			const lang = /^\s*</.test(this.spec.source) ? "html" : "plain";
			await MarkdownRenderer.render(this.plugin.app, `${fence}${lang}\n${this.spec.source}\n${fence}`, this.sourceEl, this.spec.sourcePath, this);
			this.sourceEl.hide();
		}
		const show = force ?? !this.sourceEl.isShown();
		this.sourceEl.toggle(show);
	}

	private showNotice(text: string, actions: [string, () => void][] = []) {
		this.noticeEl.empty();
		this.noticeEl.createSpan({ text });
		for (const [label, fn] of actions) {
			const b = this.noticeEl.createEl("button", { text: label });
			b.addEventListener("click", (e) => {
				e.stopPropagation();
				fn();
			});
		}
		this.noticeEl.show();
	}

	private hideNotice() {
		this.noticeEl.hide();
		this.noticeEl.empty();
	}

	/** One click to allow a data folder the block asked for (the user decides; nothing is allowed automatically). */
	private offerDataFolder(folder: string) {
		if (this.frameOptions.print || this.plugin.settings.dataFolders.includes(folder)) return;
		const label = folder === "/" ? "the whole vault" : `"${folder}"`;
		this.showNotice(`This block wants to read data files from ${label}, which is not an allowed data folder.`, [
			[
				`Allow ${label}`,
				() => {
					void this.plugin.allowDataFolder(folder).then(() => {
						this.hideNotice();
						new Notice(`Prism: data folder ${folder} allowed`);
					});
				},
			],
			["Not now", () => this.hideNotice()],
		]);
	}

	private showCrashGuard() {
		const message = "This block did not finish loading last time (Obsidian may have frozen, e.g. an infinite loop). It was not run.";
		this.plugin.errorLog.begin(this.ref, this);
		this.addError({ kind: "crash-guard", message });
		this.finish("skipped");
		this.markPrinted();
		this.showNotice(message, [
			[
				"Run anyway",
				() => {
					this.plugin.crashGuard.forgive(this.spec.blockKey);
					this.hideNotice();
					this.observeVisibility();
					void this.render();
				},
			],
		]);
	}

	/* ----------------------------------------------------------- rendering */

	private observeVisibility() {
		if (this.io) return;
		const win = this.containerEl.ownerDocument.defaultView ?? window;
		const IO = win.IntersectionObserver ?? IntersectionObserver;
		this.io = new IO(
			(entries) => {
				for (const entry of entries) {
					this.visible = entry.isIntersecting;
					if (this.visible && !this.rendered) void this.render();
				}
			},
			{ rootMargin: "400px 0px" }
		);
		this.io.observe(this.root);
	}

	/** (Re-)renders the block. Keeps the previous frame visible until the new one is ready. */
	async render() {
		const gen = ++this.generation;
		this.rendered = true;
		this.ready = false;
		this.result = null;
		this.resultPending = false;
		this.docId = null;
		this.docIdAtLastLoad = null;
		this.errors = [];
		this.updateBadge();
		this.hideNotice();
		this.httpApproval.reset();
		this.plugin.perf.drop(this);
		this.heightFrozen = false;
		this.growth = [];
		this.plugin.errorLog.begin(this.ref, this);
		for (const w of this.spec.options.warnings) this.addError({ kind: "warning", message: w });

		this.token = randomToken();
		let built: { html: string; lineMap: LineMap };
		try {
			built = await this.plugin.buildFrameDocument(this.spec, this.token, this.autoHeight, this.theme(), {
				displayMode: this.displayMode(),
				headless: this.frameOptions.headless,
			});
		} catch (err) {
			if (gen !== this.generation) return;
			const message = err instanceof Error ? err.message : String(err);
			this.addError({ kind: "error", message });
			this.showNotice(`Prism could not build this block: ${message}`);
			this.finish("error");
			this.markPrinted();
			return;
		}
		if (gen !== this.generation) return;
		this.lineMap = built.lineMap;
		this.themeVersion = this.plugin.themeVersion;

		const iframe = createEl("iframe", {
			cls: "prism-frame",
			attr: {
				// Security: scripts only. No same-origin, top navigation, popups, forms or modals.
				sandbox: "allow-scripts",
				referrerpolicy: "no-referrer",
				allow: "camera 'none'; microphone 'none'; geolocation 'none'; usb 'none'; payment 'none'; clipboard-read 'none'",
				title: this.spec.options.title || "Prism visualization",
			},
		});
		if (this.iframe) {
			this.destroyIframe(this.previous);
			this.previous = this.iframe;
			iframe.addClass("is-pending");
			// Swap after a while even if the new frame never becomes ready.
			this.later(() => this.promote(iframe), 3000);
		}
		this.iframe = iframe;
		iframe.addEventListener("load", () => this.onFrameLoad(iframe, gen));
		iframe.srcdoc = built.html;
		this.stage.querySelector(".prism-placeholder")?.remove();
		this.stage.insertBefore(iframe, this.stage.firstChild);
		this.listen(iframe);
		this.plugin.crashGuard.start(this.spec.blockKey, this.sourceHash);

		const timeout = this.later(() => {
			if (gen !== this.generation || this.ready) return;
			this.addError({ kind: "timeout", message: `Block did not finish loading within ${READY_TIMEOUT / 1000}s (slow code or an infinite loop?).` });
			this.finish("timeout");
			this.showNotice("This block is not responding.", [
				["Stop", () => this.stop()],
				["Keep waiting", () => this.hideNotice()],
			]);
		}, READY_TIMEOUT);
		this.readyTimer = timeout;
	}

	private readyTimer: number | null = null;
	private stallTimer: number | null = null;

	private promote(iframe: HTMLIFrameElement) {
		if (iframe !== this.iframe) return;
		iframe.removeClass("is-pending");
		if (this.previous) {
			this.destroyIframe(this.previous);
			this.previous = null;
		}
	}

	private destroyIframe(iframe: HTMLIFrameElement | null) {
		if (!iframe) return;
		try {
			iframe.srcdoc = "";
		} catch {
			/* ignore */
		}
		iframe.remove();
	}

	/** Kills the block's document (e.g. stuck in a loop). */
	stop() {
		this.generation++;
		this.destroyIframe(this.previous);
		this.destroyIframe(this.iframe);
		this.previous = this.iframe = null;
		this.ready = false;
		this.plugin.crashGuard.done(this.spec.blockKey);
		this.showNotice("Stopped.", [["Run again", () => void this.render()]]);
	}

	reload() {
		if (this.rendered) void this.render();
	}

	/** Replaces the block source (e.g. new data for a Bases chart) and re-renders without flicker. */
	setSource(source: string) {
		if (source === this.spec.source) return;
		this.spec = { ...this.spec, source };
		this.sourceHash = hash(source + "\n" + JSON.stringify(this.spec.options));
		if (this.rendered) void this.render();
	}

	private onFrameLoad(iframe: HTMLIFrameElement, gen: number) {
		if (iframe !== this.iframe || gen !== this.generation) return;
		// Every load must come with a fresh Prism document (new doc id). A
		// re-attached section reloads the srcdoc and gets a new id; a frame that
		// navigated away from its srcdoc never reports one.
		const fresh = () => this.docId !== null && this.docId !== this.docIdAtLastLoad;
		const settle = () => {
			this.docIdAtLastLoad = this.docId;
		};
		if (fresh()) return settle();
		this.later(() => {
			if (iframe !== this.iframe || gen !== this.generation) return;
			if (fresh()) return settle();
			this.navigations++;
			this.addError({ kind: "error", message: "The block tried to navigate away from its content; navigation is not allowed." });
			if (this.navigations <= 3) void this.render();
			else this.stop();
		}, 3000);
	}

	/* ------------------------------------------------------------ messaging */

	private listen(iframe: HTMLIFrameElement) {
		const win = iframe.ownerDocument.defaultView;
		if (!win || this.listenedWindows.has(win)) return;
		this.listenedWindows.add(win);
		this.registerDomEvent(win, "message", (e: MessageEvent) => this.onMessage(e));
	}

	private post(msg: HostMessage) {
		try {
			this.iframe?.contentWindow?.postMessage({ ...msg, [MARK]: 1 }, "*");
		} catch {
			/* frame gone */
		}
	}

	private onMessage(event: MessageEvent) {
		// Only the block's own frame, with the token of the current render.
		if (!this.iframe || event.source !== this.iframe.contentWindow) return;
		const data = event.data as (FrameMessage & { [MARK]?: number; token?: string; doc?: string }) | null;
		if (!data || typeof data !== "object" || data[MARK] !== 1 || data.token !== this.token) return;

		const now = Date.now();
		if (now - this.msgWindowStart > 1000) {
			this.msgWindowStart = now;
			this.msgCount = 0;
		}
		if (++this.msgCount > MAX_MESSAGES_PER_SECOND) {
			if (this.msgCount === MAX_MESSAGES_PER_SECOND + 1) this.addError({ kind: "warning", message: "Too many messages from the block; some were dropped." });
			return;
		}

		if (data.doc && data.doc !== this.docId) {
			if (this.docId !== null) {
				// Same srcdoc, new document instance (e.g. section re-attached): fresh render state.
				this.errors = [];
				this.updateBadge();
				this.plugin.errorLog.begin(this.ref, this);
			}
			this.docId = data.doc;
		}
		this.lastBeat = now;

		switch (data.type) {
			case "ready":
				this.onReady(data.height);
				break;
			case "height":
				this.applyHeight(data.height);
				break;
			case "heartbeat":
				break;
			case "error":
				this.onFrameError(data.error);
				break;
			case "perf":
				if (data.stats && typeof data.stats === "object") this.plugin.perf.report(this, data.stats);
				break;
			case "toast":
				if (now - this.lastToast > 300) {
					this.lastToast = now;
					new Notice(String(data.message).slice(0, 500));
				}
				break;
			case "openNote":
				if (now - this.lastOpen > 500 && typeof data.path === "string") {
					this.lastOpen = now;
					void this.plugin.app.workspace.openLinkText(data.path.replace(/\.md$/i, ""), this.spec.sourcePath, data.newLeaf ? "tab" : false);
				}
				break;
			case "openExternal":
				if (now - this.lastOpen > 1000 && typeof data.url === "string" && /^(https?:|mailto:)/i.test(data.url)) {
					this.lastOpen = now;
					window.open(data.url, "_blank", "noopener");
				}
				break;
			case "request":
				void this.onRequest(data);
				break;
			case "hoverNote":
				if (typeof data.path === "string" && data.rect) this.showHover(data.path, data.rect);
				break;
			case "hoverEnd":
				this.leaveHover();
				break;
			case "watch":
				if (data.what === "sections") this.watchSections();
				break;
			case "reply": {
				const r = this.hostRequests.get(data.id);
				if (!r) return;
				this.hostRequests.delete(data.id);
				if (data.ok && typeof data.result === "string") r.resolve(data.result);
				else r.reject(new Error(data.error || "Block request failed"));
				break;
			}
		}
	}

	private async onRequest(msg: Extract<FrameMessage, { type: "request" }>) {
		// A reply that arrives after a re-render belongs to the old document; its ids would collide.
		const token = this.token;
		const reply = (ok: boolean, result?: unknown, error?: string) => {
			if (token === this.token) this.post({ type: "reply", id: msg.id, ok, result, error });
		};
		try {
			switch (msg.method) {
				case "notes":
					this.usesNotes = true;
					reply(true, await this.plugin.queryNotes(msg.query ?? {}));
					break;
				case "stateSet":
					this.plugin.state.set(this.spec.blockKey, String(msg.key), msg.value);
					this.plugin.broadcastState(this);
					reply(true);
					break;
				case "sharedSet":
					this.plugin.state.set(sharedKey(this.spec), String(msg.key), msg.value);
					this.plugin.broadcastShared(this, String(msg.key));
					reply(true);
					break;
				case "sharedDelete":
					this.plugin.state.delete(sharedKey(this.spec), String(msg.key));
					this.plugin.broadcastShared(this, String(msg.key));
					reply(true);
					break;
				case "note":
					reply(true, await this.plugin.noteInfo(this.notePath));
					break;
				case "stateDelete":
					this.plugin.state.delete(this.spec.blockKey, String(msg.key));
					this.plugin.broadcastState(this);
					reply(true);
					break;
				case "data": {
					const payload = await this.plugin.readDataFile(String(msg.path), this.spec.sourcePath).catch((err) => {
						if (err instanceof DataAccessError) this.offerDataFolder(err.folder);
						throw err;
					});
					this.dataPaths.add(payload.path);
					reply(true, payload);
					break;
				}
				case "dataFiles":
					reply(true, this.plugin.listDataFiles(typeof msg.folder === "string" ? msg.folder : undefined));
					break;
				case "perfWatch":
					this.plugin.perf.watch(this, !!msg.on);
					reply(true);
					break;
				case "http":
					if (!this.plugin.settings.online.http) throw new Error(HTTP_OFF_MESSAGE);
					reply(true, await sendHttp(this, msg.request, this.plugin.settings.online.httpConfirm ? this.httpApproval : null));
					break;
				default:
					throw new Error("Unknown request");
			}
		} catch (err) {
			reply(false, undefined, err instanceof Error ? err.message : String(err));
		}
	}

	/** Sends a request to the frame and waits for its reply. */
	private hostRequest(msg: HostRequestMessage, timeoutMs = 30000): Promise<string> {
		if (!this.iframe || !this.ready) return Promise.reject(new Error("The block is not loaded yet"));
		const id = this.nextHostRequest++;
		return new Promise<string>((resolve, reject) => {
			this.hostRequests.set(id, { resolve, reject });
			this.post({ ...msg, id });
			this.later(() => {
				if (this.hostRequests.delete(id)) reject(new Error("The block did not respond"));
			}, timeoutMs);
		});
	}

	/* ------------------------------------------------------- page monitors */

	/** The block's document has loaded. */
	get isLoaded(): boolean {
		return this.ready;
	}

	/** Near the viewport (command-line renders count as visible). */
	get perfVisible(): boolean {
		return this.ready && (this.visible || !!this.frameOptions.headless);
	}

	/** Asks the block to report its CPU and memory every second (src/runtime/perf.ts). */
	setPerfReporting(on: boolean) {
		if (this.ready) this.post({ type: "perf", on });
	}

	sendPerfSnapshot(snapshot: PerfSnapshot) {
		if (this.ready) this.post({ type: "perfSnapshot", snapshot });
	}

	sendState(state: Record<string, unknown>) {
		if (this.ready) this.post({ type: "state", state });
	}

	sendShared(shared: Record<string, unknown>, key?: string) {
		if (this.ready) this.post({ type: "shared", shared, key });
	}

	notifyNoteChanged() {
		if (this.ready) this.post({ type: "noteChanged" });
	}

	notifyDataChanged(path: string) {
		if (this.ready && this.dataPaths.has(path)) this.post({ type: "dataChanged", path });
	}

	notifyNotesChanged() {
		if (this.ready && this.usesNotes) this.post({ type: "notesChanged" });
	}

	/** Theme of the window the block lives in (the PDF export window is always light). */
	private theme() {
		return this.plugin.getTheme(this.containerEl.ownerDocument);
	}

	pushTheme() {
		if (!this.ready || this.frameOptions.print) return;
		this.themeVersion = this.plugin.themeVersion;
		this.post({ type: "theme", theme: this.plugin.getTheme() });
	}

	/* ---------------------------------------------------------- ready/height */

	private onReady(height: number) {
		this.ready = true;
		this.cancel(this.readyTimer);
		this.readyTimer = null;
		this.hideNotice();
		this.plugin.crashGuard.done(this.spec.blockKey);
		if (this.iframe) this.promote(this.iframe);
		this.applyHeight(height);
		if (this.themeVersion !== this.plugin.themeVersion) this.pushTheme();
		this.startStallWatch();
		if (this.frameOptions.print) this.schedulePrintImage();
		if (this.plugin.perf.active) this.setPerfReporting(true);
		// Every document instance sends one "ready". A re-attached section (new
		// doc id) started a fresh log entry, so it has to settle too; the render
		// result and snapshot are produced once per render.
		const gen = this.generation;
		const doc = this.docId;
		this.later(async () => {
			if (gen !== this.generation || doc !== this.docId) return;
			this.plugin.errorLog.settled(this.spec.blockKey, this);
			if (this.resultPending) return;
			this.resultPending = true;
			const failed = this.errors.some((e) => e.kind !== "warning");
			const wantSnapshot = this.frameOptions.snapshot ?? this.plugin.settings.snapshots;
			// Snapshot also failing blocks in headless renders: the agent wants to see them.
			const snapshot = wantSnapshot && (!failed || this.frameOptions.snapshot) ? await this.snapshot() : undefined;
			if (gen !== this.generation) return;
			this.finish(failed ? "error" : this.errors.length ? "warning" : "ok", snapshot);
		}, 1500);
	}

	private printWaiters: (() => void)[] = [];
	private printed = false;

	/** Resolves once the block was replaced by a static image for the PDF export (or after `timeoutMs`). */
	whenPrinted(timeoutMs: number): Promise<void> {
		if (this.printed) return Promise.resolve();
		return new Promise((resolve) => {
			const timer = window.setTimeout(resolve, timeoutMs);
			this.printWaiters.push(() => {
				window.clearTimeout(timer);
				resolve();
			});
		});
	}

	private markPrinted() {
		this.printed = true;
		this.printWaiters.splice(0).forEach((w) => w());
	}

	/** Replaces the iframe with a PNG once animations had time to finish; iframes are unreliable in PDFs. */
	private schedulePrintImage() {
		if (this.printed) return;
		const gen = this.generation;
		this.later(async () => {
			if (gen !== this.generation || this.printed) return;
			try {
				const data = await this.hostRequest(
					{ type: "export", format: "png", scale: 2, background: this.theme().vars["--background-primary"] ?? "#ffffff" },
					8000
				);
				const width = this.stage.clientWidth;
				const img = createEl("img", { cls: "prism-print-image", attr: { src: data, alt: this.spec.options.title || "Prism visualization" } });
				if (width) img.style.width = `${width}px`;
				await img.decode().catch(() => undefined);
				this.stage.replaceWith(img);
				this.destroyIframe(this.iframe);
				this.iframe = null;
			} catch (err) {
				// Keep the live frame; Chromium may still print it.
				console.warn("Prism: no static image for PDF export", err);
			}
			this.markPrinted();
		}, 1200);
	}

	private finish(status: FrameResult["status"], snapshot?: string) {
		const s = this.spec;
		this.result = {
			block: s.blockKey,
			blockIndex: s.blockIndex,
			lines: s.lines,
			title: s.options.title,
			status,
			errors: this.errors.map((e) => ({ kind: e.kind, line: e.line, message: e.message })),
			height: this.height,
			snapshot,
		};
		const waiters = this.resultWaiters.splice(0);
		waiters.forEach((w) => w(this.result as FrameResult));
	}

	/** Resolves when the current render has settled (or after `timeoutMs`). */
	whenSettled(timeoutMs: number): Promise<FrameResult> {
		if (this.result) return Promise.resolve(this.result);
		return new Promise((resolve) => {
			const timer = window.setTimeout(() => {
				this.resultWaiters = this.resultWaiters.filter((w) => w !== done);
				this.addError({ kind: "timeout", message: `Block did not settle within ${Math.round(timeoutMs / 1000)}s.` });
				this.finish("timeout");
				resolve(this.result as FrameResult);
			}, timeoutMs);
			const done = (r: FrameResult) => {
				window.clearTimeout(timer);
				resolve(r);
			};
			this.resultWaiters.push(done);
		});
	}

	private startStallWatch() {
		this.cancel(this.stallTimer);
		const check = () => {
			this.stallTimer = this.later(check, 5000);
			if (!this.ready || !this.visible || this.containerEl.ownerDocument.visibilityState !== "visible") {
				this.lastBeat = Math.max(this.lastBeat, Date.now() - 4000);
				return;
			}
			if (Date.now() - this.lastBeat > STALL_TIMEOUT && !this.noticeEl.isShown()) {
				this.addError({ kind: "timeout", message: "Block stopped responding (busy loop?)." });
				this.showNotice("This block stopped responding.", [
					["Stop", () => this.stop()],
					["Keep waiting", () => this.hideNotice()],
				]);
			}
		};
		this.stallTimer = this.later(check, 5000);
	}

	private applyHeight(raw: number) {
		if (!this.autoHeight || this.fullscreen || !Number.isFinite(raw)) return;
		const max = this.plugin.settings.maxAutoHeight;
		const h = Math.max(24, Math.min(Math.ceil(raw), max));
		if (Math.abs(h - this.height) < 1) return;
		if (this.heightFrozen) return;
		if (h > this.height) {
			// Content that grows with its frame (100vh, height:100%) never settles:
			// it answers every resize at once with the same increment. Animations
			// grow in varying steps and stop; appended content grows more slowly.
			const now = performance.now();
			const last = this.growth[this.growth.length - 1];
			if (last && now - last.at > 400) this.growth = [];
			this.growth.push({ at: now, delta: h - this.height });
			const deltas = this.growth.map((g) => g.delta);
			const uniform = this.growth.length >= 12 && deltas.every((d) => Math.abs(d - deltas[0]) <= 1);
			if (uniform || this.growth.length >= 120) {
				this.heightFrozen = true;
				this.addError({
					kind: "warning",
					message: "Auto-height stopped: content grows with the frame (100vh or height:100%?). Use a fixed height=… or avoid viewport units.",
				});
				return;
			}
		} else {
			this.growth = [];
		}
		this.height = h;
		this.stage.style.height = `${h}px`;
		this.plugin.heights.set(this.spec.blockKey, h);
	}

	/* --------------------------------------------------------------- errors */

	private onFrameError(raw: RawFrameError) {
		let loc = this.lineMap?.locate(raw) ?? { origin: "unknown" as const };
		// Resource loads from markup report the parser position, not the tag:
		// locate the URL in the block source instead.
		if (raw.url && (raw.kind === "csp" || raw.kind === "resource")) {
			const line = this.findInSource(raw.url);
			if (line !== undefined) loc = { line, origin: "block" };
		}
		const noteLine = loc.line !== undefined ? this.spec.contentStartLine + loc.line - 1 : undefined;
		this.addError({
			kind: raw.kind,
			message: String(raw.message),
			line: noteLine,
			blockLine: loc.line,
			origin: loc.origin,
			column: loc.column,
			stack: raw.stack,
		});
	}

	private findInSource(url: string): number | undefined {
		const candidates = [url, url.replace(/\/$/, "")];
		try {
			const u = new URL(url);
			candidates.push(u.host + u.pathname.replace(/\/$/, ""));
		} catch {
			/* not a URL */
		}
		for (const c of candidates) {
			if (!c) continue;
			const i = this.spec.source.indexOf(c);
			if (i !== -1 && this.spec.source.indexOf(c, i + 1) === -1) return this.spec.source.slice(0, i).split("\n").length;
		}
		return undefined;
	}

	private addError(e: ShownError & { column?: number; stack?: string }) {
		if (this.errors.length >= 50) return;
		this.errors.push({ kind: e.kind, message: e.message, line: e.line, blockLine: e.blockLine, origin: e.origin });
		this.updateBadge();
		if (this.plugin.settings.errorLog) {
			this.plugin.errorLog.add(this.ref, {
				kind: e.kind,
				message: e.message,
				line: e.line,
				blockLine: e.blockLine,
				column: e.column,
				origin: e.origin,
				stack: e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : undefined,
			});
		}
		if (e.kind !== "warning") console.warn(`Prism [${this.spec.blockKey}]`, e.message);
	}

	private updateBadge() {
		const errors = this.errors.filter((e) => e.kind !== "warning").length;
		const warnings = this.errors.length - errors;
		if (!this.errors.length) {
			this.badge.hide();
			this.errorPanel.hide();
			this.errorPanel.empty();
			this.root.removeClass("has-errors");
			return;
		}
		this.root.toggleClass("has-errors", errors > 0);
		this.badge.empty();
		this.badge.toggleClass("is-warning", errors === 0);
		setIcon(this.badge.createSpan(), "alert-triangle");
		const parts = [];
		if (errors) parts.push(`${errors} error${errors > 1 ? "s" : ""}`);
		if (warnings) parts.push(`${warnings} warning${warnings > 1 ? "s" : ""}`);
		this.badge.createSpan({ text: parts.join(", ") });
		this.badge.setAttr("aria-label", "Show details");
		this.badge.show();

		this.errorPanel.empty();
		for (const e of this.errors) {
			const row = this.errorPanel.createDiv({ cls: `prism-error-row is-${e.kind === "warning" ? "warning" : "error"}` });
			row.createSpan({ cls: "prism-error-kind", text: e.kind });
			if (e.line !== undefined) row.createSpan({ cls: "prism-error-line", text: `line ${e.line}` });
			else if (e.origin && e.origin !== "block" && e.origin !== "unknown") row.createSpan({ cls: "prism-error-line", text: e.origin });
			row.createSpan({ cls: "prism-error-message", text: e.message });
		}
		const actions = this.errorPanel.createDiv({ cls: "prism-error-actions" });
		const copy = actions.createEl("button", { text: "Copy fix prompt for agent" });
		copy.addEventListener("click", (ev) => {
			ev.stopPropagation();
			void this.copy(this.agentPrompt(), "Prompt copied – paste it into your agent");
		});
	}

	private errorReport(): string {
		const s = this.spec;
		const where = s.lines ? `${s.sourcePath} (lines ${s.lines.start}-${s.lines.end})` : s.sourcePath;
		return [
			`Prism block ${s.blockKey} in ${where}:`,
			...this.errors.map((e) => `- [${e.kind}]${e.line !== undefined ? ` line ${e.line}` : ""}: ${e.message}`),
		].join("\n");
	}

	/**
	 * A ready-to-paste prompt for a coding agent: where the block is, what went
	 * wrong, its source and how to verify the fix.
	 */
	private agentPrompt(): string {
		const s = this.spec;
		const where = s.lines ? `"${s.sourcePath}" (lines ${s.lines.start}–${s.lines.end})` : `"${s.sourcePath}"`;
		const longest = Math.max(2, ...Array.from(s.source.matchAll(/`+/g), (m) => m[0].length));
		const fence = "`".repeat(longest + 1);
		const failing = this.errors.length > 0;
		const out = [
			failing
				? `Fix the Prism visualization block ${s.blockKey} in the Obsidian note ${where}.`
				: `Improve the Prism visualization block ${s.blockKey} in the Obsidian note ${where}.`,
			"",
		];
		if (failing) {
			out.push("Reported problems (line = note line):");
			for (const e of this.errors) out.push(`- [${e.kind}]${e.line !== undefined ? ` line ${e.line}` : ""}: ${e.message}`);
			out.push("");
		}
		out.push("Current block source:", `${fence}viz`, s.source, fence, "");
		out.push(
			"Edit the block in the note (keep its ```viz options), then verify from the vault root:",
			`node .obsidian/plugins/prism-viz/scripts/prism-render.mjs "${s.sourcePath}"`,
			"Repeat until the status is ok and the snapshot looks right. Use the prism skill if you have it; otherwise read PRISM.md in the vault root first."
		);
		return out.join("\n");
	}

	/* ---------------------------------------------------------------- hover */

	/**
	 * Obsidian sets this when the page preview of a link in this block opens.
	 * The preview cannot see the pointer inside the frame, so Prism decides when
	 * it closes: when the pointer is neither on the link nor on the preview.
	 */
	get hoverPopover(): HoverPopover | null {
		return this.popover;
	}

	set hoverPopover(popover: HoverPopover | null) {
		this.popover = popover;
		if (!popover) return;
		// The pointer left the link before Obsidian's hover delay ran out.
		if (!this.hoverPath) {
			this.closePopover();
			return;
		}
		queueMicrotask(() => {
			popover.hoverEl?.addEventListener("mouseenter", () => this.cancelHoverClose());
			popover.hoverEl?.addEventListener("mouseleave", () => this.scheduleHoverClose());
		});
		popover.register(() => {
			if (this.popover !== popover) return;
			this.popover = null;
			this.hoverPath = null;
			this.hoverTarget?.remove();
			this.hoverTarget = null;
		});
	}

	/** Shows Obsidian's page preview for a note link inside the frame. */
	private showHover(path: string, rect: FrameRect) {
		if (!this.iframe) return;
		this.cancelHoverClose();
		// Back on the same link (e.g. across a gap inside a diagram node): keep the preview where it is.
		if (path === this.hoverPath && this.hoverTarget) {
			this.hoverTarget.dataset.prismPointer = "on";
			return;
		}
		this.closePopover();
		const frameBox = this.iframe.getBoundingClientRect();
		const stageBox = this.stage.getBoundingClientRect();
		// A stand-in for the link in the host DOM, so the preview is positioned next to it.
		// It stays until the preview closes: Obsidian hides a preview whose target is gone.
		const target = this.stage.createDiv({ cls: "prism-hover-target" });
		target.style.left = `${frameBox.left - stageBox.left + rect.x}px`;
		target.style.top = `${frameBox.top - stageBox.top + rect.y}px`;
		target.style.width = `${Math.max(1, rect.width)}px`;
		target.style.height = `${Math.max(1, rect.height)}px`;
		// Read by the HoverPopover patch in main.ts: the pointer is on the link inside the frame.
		target.dataset.prismPointer = "on";
		this.hoverTarget = target;
		this.hoverPath = path;
		const event = new MouseEvent("mouseover", {
			clientX: frameBox.left + rect.x + rect.width / 2,
			clientY: frameBox.top + rect.y + rect.height / 2,
		});
		this.plugin.app.workspace.trigger("hover-link", {
			event,
			source: "prism",
			hoverParent: this,
			targetEl: target,
			linktext: path.replace(/\.md$/i, ""),
			sourcePath: this.spec.embeddedIn ?? this.spec.sourcePath,
		});
	}

	/** The pointer left the link inside the frame. */
	private leaveHover() {
		if (this.hoverTarget) this.hoverTarget.dataset.prismPointer = "off";
		this.scheduleHoverClose();
	}

	/** Close soon, unless the pointer reaches the preview or comes back to the link. */
	private scheduleHoverClose() {
		this.cancelHoverClose();
		this.hoverCloseTimer = this.later(() => {
			this.hoverCloseTimer = null;
			// On the preview or back on the link: their leave events schedule the next attempt.
			if (this.popover?.hoverEl?.matches(":hover") || this.hoverTarget?.dataset.prismPointer === "on") return;
			this.closePopover();
		}, HOVER_CLOSE_DELAY);
	}

	private cancelHoverClose() {
		this.cancel(this.hoverCloseTimer);
		this.hoverCloseTimer = null;
	}

	private closePopover() {
		this.cancelHoverClose();
		const popover: { hide?: () => void; unload(): void } | null = this.popover;
		this.popover = null;
		this.hoverPath = null;
		this.hoverTarget?.remove();
		this.hoverTarget = null;
		if (popover) {
			if (popover.hide) popover.hide();
			else popover.unload();
		}
	}

	/* ------------------------------------------------------------- sections */

	/** Starts reporting the heading the reader is at (prism.onSection). */
	private watchSections() {
		if (this.sectionScroller === undefined) {
			const scroller = this.containerEl.closest<HTMLElement>(".markdown-preview-view, .cm-scroller");
			this.sectionScroller = scroller;
			if (scroller) {
				let queued = false;
				const onScroll = () => {
					if (queued) return;
					queued = true;
					this.later(() => {
						queued = false;
						this.postSection();
					}, 80);
				};
				this.registerDomEvent(scroller, "scroll", onScroll, { passive: true });
			}
		}
		// Also for a re-rendered document that asks again.
		this.lastSection = "";
		this.postSection();
	}

	private postSection() {
		const section = this.currentSection();
		const key = JSON.stringify(section);
		if (key === this.lastSection) return;
		this.lastSection = key;
		this.post({ type: "section", section });
	}

	/** The last heading above the reading line, from the rendered headings (or the scroll position). */
	private currentSection(): SectionInfo | null {
		const scroller = this.sectionScroller;
		const path = this.notePath;
		const file = path ? this.plugin.app.vault.getAbstractFileByPath(path) : null;
		const headings = file instanceof TFile ? this.plugin.app.metadataCache.getFileCache(file)?.headings ?? [] : [];
		if (!scroller || !headings.length) return null;
		const info = (i: number): SectionInfo => ({
			index: i,
			heading: headings[i].heading,
			level: headings[i].level,
			line: headings[i].position.start.line + 1,
		});
		const norm = (t: string) =>
			t
				.replace(/^#+\s*/, "")
				.replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
				.toLowerCase()
				.replace(/[^\p{L}\p{N}]+/gu, "");
		const readingLine = scroller.getBoundingClientRect().top + scroller.clientHeight * READING_LINE;
		// Rendered heading elements, matched in order to the note's headings.
		const rendered: { index: number; top: number }[] = [];
		let next = 0;
		scroller.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, .cm-line.HyperMD-header").forEach((el) => {
			if (el.closest(".markdown-embed, .prism-block")) return;
			const text = norm(el.textContent || "");
			for (let j = next; j < headings.length; j++) {
				if (norm(headings[j].heading) === text) {
					rendered.push({ index: j, top: el.getBoundingClientRect().top });
					next = j + 1;
					return;
				}
			}
		});
		if (rendered.length) {
			const above = rendered.filter((r) => r.top <= readingLine);
			if (above.length) return info(above[above.length - 1].index);
			return rendered[0].index > 0 ? info(rendered[0].index - 1) : null;
		}
		// Inside a long section: no heading is rendered near the viewport.
		let line: number | null = null;
		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			if (line === null && leaf.view instanceof MarkdownView && leaf.view.containerEl.contains(this.containerEl)) {
				line = leaf.view.currentMode.getScroll();
			}
		});
		if (line === null) return null;
		const top: number = line;
		let hit = -1;
		headings.forEach((h, i) => {
			if (h.position.start.line <= top) hit = i;
		});
		return hit >= 0 ? info(hit) : null;
	}

	private displayMode(): DisplayMode {
		return this.fullscreen ? "fullscreen" : "inline";
	}

	/** Records the block's canvas animation and saves it as a WebM video next to the note. */
	private async record(seconds: number) {
		const notice = new Notice(`Prism: recording ${seconds} s…`, 0);
		try {
			const data = await this.hostRequest({ type: "record", seconds, fps: 60 }, (seconds + 20) * 1000);
			const path = await this.plugin.saveExport(this.spec, "webm", data);
			const name = path.split("/").pop() ?? path;
			notice.hide();
			try {
				await navigator.clipboard.writeText(`![[${name}]]`);
				new Notice(`Saved ${path}. Embed link copied: ![[${name}]]`);
			} catch {
				new Notice(`Saved ${path}. Embed with ![[${name}]]`);
			}
		} catch (err) {
			notice.hide();
			new Notice(`Prism: recording failed (${err instanceof Error ? err.message : String(err)})`);
		}
	}

	/* -------------------------------------------------------- export & view */

	private async exportImage(format: "png" | "svg") {
		try {
			const data = await this.hostRequest({
				type: "export",
				format,
				scale: format === "png" ? 2 : 1,
				background: this.plugin.getTheme().vars["--background-primary"] ?? "#ffffff",
			});
			const path = await this.plugin.saveExport(this.spec, format, data);
			new Notice(`Saved ${path}`);
		} catch (err) {
			new Notice(`Prism export failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	/** Puts a PNG of the block on the clipboard (for chat, slides, mail). */
	private async copyImage() {
		try {
			const data = await this.hostRequest({
				type: "export",
				format: "png",
				scale: 2,
				background: this.plugin.getTheme().vars["--background-primary"] ?? "#ffffff",
			});
			const blob = new Blob([dataUrlToArrayBuffer(data)], { type: "image/png" });
			await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
			new Notice("Prism: image copied");
		} catch (err) {
			new Notice(`Prism: could not copy the image (${err instanceof Error ? err.message : String(err)})`);
		}
	}

	private async snapshot(): Promise<string | undefined> {
		try {
			// Short timeout: a snapshot normally takes well under a second, and a
			// hanging one would hold up the whole headless render.
			const data = await this.hostRequest(
				{
					type: "export",
					format: "png",
					scale: 1,
					background: this.plugin.getTheme().vars["--background-primary"] ?? "#ffffff",
				},
				SNAPSHOT_TIMEOUT
			);
			// "data:," is what an empty (0×0) canvas exports; never store it as a snapshot.
			if (!/^data:image\/png;base64,./.test(data)) throw new Error("the block exported an empty image");
			return await this.plugin.saveSnapshot(this, data);
		} catch (err) {
			console.warn("Prism: snapshot failed", err);
			return undefined;
		}
	}

	private toggleFullscreen() {
		if (this.fullscreen) this.exitFullscreen();
		else this.enterFullscreen();
	}

	private enterFullscreen() {
		this.fullscreen = true;
		this.root.addClass("is-fullscreen");
		this.post({ type: "display", mode: "fullscreen" });
		this.stage.setCssProps({ height: "" });
		const doc = this.containerEl.ownerDocument;
		const onChange = () => {
			if (!doc.fullscreenElement && this.fullscreen) this.exitFullscreen();
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") this.exitFullscreen();
		};
		this.fullscreenCleanup = () => {
			doc.removeEventListener("fullscreenchange", onChange);
			doc.removeEventListener("keydown", onKey, true);
		};
		doc.addEventListener("keydown", onKey, true);
		if (this.root.requestFullscreen) {
			this.root.requestFullscreen().then(
				() => doc.addEventListener("fullscreenchange", onChange),
				() => this.root.addClass("is-overlay")
			);
		} else {
			this.root.addClass("is-overlay");
		}
	}

	private fullscreenCleanup: (() => void) | null = null;

	private exitFullscreen() {
		this.fullscreen = false;
		this.fullscreenCleanup?.();
		this.fullscreenCleanup = null;
		const doc = this.containerEl.ownerDocument;
		if (doc.fullscreenElement === this.root) void doc.exitFullscreen().catch(() => undefined);
		this.root.removeClass("is-fullscreen", "is-overlay");
		if (!this.spec.options.fill) this.stage.style.height = `${this.height}px`;
		this.post({ type: "display", mode: "inline" });
		// Content may have reflowed at the larger size.
		this.post({ type: "measure" });
	}
}
