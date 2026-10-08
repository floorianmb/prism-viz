// ```viz web blocks: a website shown inline in the note. Desktop uses an
// Electron <webview> (separate process and session; works for sites that
// refuse to be framed), mobile a cross-origin <iframe>. Only active when the
// user switched on Settings → Prism → Online access → Web pages.

import { MarkdownRenderChild, Platform, parseYaml, setIcon } from "obsidian";
import type PrismPlugin from "../../main";
import type { BlockSpec } from "../frame";
import { escapeHtml } from "../util";
import { openPrismSettings } from "./settings";

export const DEFAULT_WEB_HEIGHT = 520;
/** In-memory session for all web blocks: not shared with the system browser, cleared on restart. */
const PARTITION = "prism-web";

export interface WebSpec {
	url: string;
	mode: "auto" | "webview" | "iframe";
	/** Color scheme the page is shown in. Light by default, like a normal browser; Obsidian's dark mode is not passed on. */
	theme: "light" | "dark";
}

/** Body of a ```viz web block: a bare URL, or YAML `url: …`, optional `mode: auto|webview|iframe` and `theme: light|dark`. */
export function parseWebSpec(source: string): WebSpec {
	const text = source.trim();
	let url: unknown = text;
	let mode: unknown = "auto";
	let theme: unknown = "light";
	if (!/^https?:\/\/\S+$/i.test(text)) {
		let spec: unknown;
		try {
			spec = parseYaml(text);
		} catch {
			spec = null;
		}
		if (!spec || typeof spec !== "object") throw new Error("A ```viz web block contains a URL, or YAML with url: https://… (optional mode: auto | webview | iframe, theme: light | dark).");
		({ url, mode = "auto", theme = "light" } = spec as { url?: unknown; mode?: unknown; theme?: unknown });
	}
	let parsed: URL;
	try {
		parsed = new URL(String(url ?? ""));
	} catch {
		throw new Error(`Invalid URL "${String(url ?? "")}" in the web block.`);
	}
	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error(`Only http and https pages can be shown (got ${parsed.protocol}).`);
	if (mode !== "auto" && mode !== "webview" && mode !== "iframe") throw new Error(`Invalid mode "${String(mode)}" (auto, webview or iframe).`);
	if (theme !== "light" && theme !== "dark") throw new Error(`Invalid theme "${String(theme)}" (light or dark).`);
	return { url: parsed.href, mode, theme };
}

/** Static stand-in used where no live page can be shown (command-line renders, PDF export, gallery). */
export function webPlaceholderHtml(source: string): string {
	let label: string;
	try {
		label = parseWebSpec(source).url;
	} catch (err) {
		label = err instanceof Error ? err.message : String(err);
	}
	return `<div class="card"><div class="label">Web page</div><div>${escapeHtml(label)}</div><p class="muted">Shown live in Obsidian when Settings → Prism → Online access → Web pages is on.</p></div>`;
}

/** The parts of Electron's <webview> element used here. */
interface WebviewElement extends HTMLElement {
	src: string;
	canGoBack(): boolean;
	canGoForward(): boolean;
	goBack(): void;
	goForward(): void;
	reload(): void;
	getURL(): string;
	getWebContentsId(): number;
	insertCSS(css: string): Promise<string>;
}

interface GuestContents {
	debugger: { isAttached(): boolean; attach(version?: string): void; sendCommand(method: string, params?: unknown): Promise<unknown> };
}

/**
 * Electron passes Obsidian's dark mode to guest pages as prefers-color-scheme,
 * which turns many sites half dark. Emulates the block's scheme through the
 * DevTools protocol (needs Electron's remote module); otherwise falls back to
 * the CSS color-scheme, which fixes defaults (canvas, form controls) only.
 */
async function applyScheme(view: WebviewElement, theme: "light" | "dark") {
	try {
		const electron = (window as Window & { require?: (id: string) => { remote?: { webContents: { fromId(id: number): GuestContents | undefined } } } }).require?.("electron");
		const contents = electron?.remote?.webContents.fromId(view.getWebContentsId());
		if (contents) {
			if (!contents.debugger.isAttached()) contents.debugger.attach("1.3");
			await contents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });
			return;
		}
	} catch (err) {
		console.warn("Prism: could not set the color scheme of a web block", err);
	}
	await view.insertCSS(`:root{color-scheme:${theme} !important}`).catch(() => undefined);
}

const live = new Set<PrismWebBlock>();

/** Re-renders all web blocks (after the setting changed). */
export function reloadWebBlocks() {
	live.forEach((b) => b.render());
}

/** Web blocks displayed inside `scope`, for page monitors (src/perf/monitor.ts). */
export function webBlocksIn(scope: HTMLElement): { key: string; label: string; line?: number; loaded: boolean; contentsId: number | null }[] {
	const out: { key: string; label: string; line?: number; loaded: boolean; contentsId: number | null }[] = [];
	for (const block of live) {
		const el = block.containerEl;
		if (el.isConnected && scope.contains(el) && el.getClientRects().length > 0) out.push(block.perfInfo());
	}
	return out;
}

export class PrismWebBlock extends MarkdownRenderChild {
	private io: IntersectionObserver | null = null;
	private view: WebviewElement | HTMLIFrameElement | null = null;

	constructor(private plugin: PrismPlugin, containerEl: HTMLElement, private spec: BlockSpec) {
		super(containerEl);
	}

	onload() {
		live.add(this);
		this.render();
	}

	onunload() {
		live.delete(this);
		this.teardown();
	}

	private teardown() {
		this.io?.disconnect();
		this.io = null;
		this.view?.remove();
		this.view = null;
	}

	render() {
		this.teardown();
		const el = this.containerEl;
		el.empty();
		el.addClass("prism-host");
		const root = el.createDiv({ cls: "prism-block prism-web" });
		// Keep clicks on the controls from moving the Live Preview cursor into the block.
		root.addEventListener("mousedown", (e) => e.stopPropagation());
		if (this.spec.options.title) root.createDiv({ cls: "prism-title", text: this.spec.options.title });

		let spec: WebSpec;
		try {
			spec = parseWebSpec(this.spec.source);
		} catch (err) {
			root.createDiv({ cls: "prism-notice", text: err instanceof Error ? err.message : String(err) });
			return;
		}
		if (!this.plugin.settings.online.web) {
			const notice = root.createDiv({ cls: "prism-notice" });
			notice.createSpan({ text: `Web pages are off. This block wants to show ${new URL(spec.url).host}.` });
			const open = notice.createEl("button", { text: "Open Prism settings" });
			open.addEventListener("click", () => openPrismSettings(this.plugin.app, this.plugin.manifest.id));
			return;
		}

		const useWebview = Platform.isDesktopApp && spec.mode !== "iframe";
		const bar = root.createDiv({ cls: "prism-web-bar" });
		const stage = root.createDiv({ cls: `prism-stage prism-web-stage is-${spec.theme}` });
		stage.style.height = `${this.spec.options.height ?? DEFAULT_WEB_HEIGHT}px`;
		stage.createDiv({ cls: "prism-placeholder", text: "Web page" });

		const button = (icon: string, label: string, onClick: () => void) => {
			const b = bar.createEl("button", { cls: "clickable-icon", attr: { "aria-label": label } });
			setIcon(b, icon);
			b.addEventListener("click", (e) => {
				e.preventDefault();
				onClick();
			});
			return b;
		};
		const back = useWebview ? button("arrow-left", "Back", () => (this.view as WebviewElement | null)?.goBack()) : null;
		const forward = useWebview ? button("arrow-right", "Forward", () => (this.view as WebviewElement | null)?.goForward()) : null;
		button("refresh-cw", "Reload", () => {
			if (this.view instanceof HTMLIFrameElement) this.view.src = spec.url;
			else (this.view as WebviewElement | null)?.reload();
		});
		const address = bar.createDiv({ cls: "prism-web-url", text: spec.url });
		const status = bar.createSpan({ cls: "prism-web-status" });
		button("external-link", "Open in browser", () => window.open(this.currentUrl(spec.url), "_blank", "noopener"));

		const updateNav = () => {
			const view = this.view as WebviewElement | null;
			if (!view || !back || !forward) return;
			try {
				back.toggleClass("is-disabled", !view.canGoBack());
				forward.toggleClass("is-disabled", !view.canGoForward());
			} catch {
				/* not attached yet */
			}
		};
		updateNav();

		const load = () => {
			stage.empty();
			if (useWebview) {
				const view = stage.ownerDocument.createElement("webview") as WebviewElement;
				view.addClass("prism-web-view");
				view.setAttribute("partition", PARTITION);
				view.setAttribute("src", spec.url);
				const onNavigate = (e: Event) => {
					address.setText((e as Event & { url?: string }).url ?? view.getURL());
					status.setText("");
					updateNav();
				};
				// Each new document: emulation survives navigations, the CSS fallback does not.
				view.addEventListener("dom-ready", () => void applyScheme(view, spec.theme));
				view.addEventListener("did-navigate", onNavigate);
				view.addEventListener("did-navigate-in-page", onNavigate);
				view.addEventListener("did-start-loading", () => status.setText("Loading…"));
				view.addEventListener("did-stop-loading", () => status.setText(""));
				view.addEventListener("did-fail-load", (e: Event) => {
					const f = e as Event & { errorCode?: number; errorDescription?: string; isMainFrame?: boolean };
					// -3 = aborted (e.g. a new navigation started); not an error.
					if (f.isMainFrame !== false && f.errorCode !== -3) status.setText(`Could not load (${f.errorDescription || f.errorCode})`);
				});
				this.view = view;
				stage.appendChild(view);
			} else {
				const frame = stage.createEl("iframe", { cls: "prism-frame prism-web-view" });
				// Cross-origin page: same-origin refers to the site itself, never to Obsidian.
				frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
				frame.setAttribute("referrerpolicy", "no-referrer");
				frame.setAttribute("allow", "camera 'none'; microphone 'none'; geolocation 'none'; usb 'none'; payment 'none'");
				frame.setAttribute("title", this.spec.options.title || spec.url);
				// An embedded page takes prefers-color-scheme from the frame's color-scheme.
				frame.style.colorScheme = spec.theme;
				frame.src = spec.url;
				this.view = frame;
			}
		};

		// Load when the block comes near the viewport, like other blocks.
		if (!this.plugin.settings.lazyRender || this.spec.options.eager) {
			load();
			return;
		}
		const win = (el.ownerDocument.defaultView ?? window) as Window & typeof globalThis;
		this.io = new (win.IntersectionObserver ?? IntersectionObserver)(
			(entries) => {
				if (!entries.some((e) => e.isIntersecting)) return;
				this.io?.disconnect();
				this.io = null;
				load();
			},
			{ rootMargin: "400px 0px" }
		);
		this.io.observe(root);
	}

	perfInfo() {
		let label = this.spec.options.title || "Web page";
		try {
			if (!this.spec.options.title) label = `Web: ${new URL(parseWebSpec(this.spec.source).url).host}`;
		} catch {
			/* invalid spec: keep the generic label */
		}
		let contentsId: number | null = null;
		const view = this.view;
		if (view && !(view instanceof HTMLIFrameElement)) {
			try {
				contentsId = view.getWebContentsId();
			} catch {
				contentsId = null;
			}
		}
		return { key: this.spec.blockKey, label, line: this.spec.lines?.start, loaded: !!view, contentsId };
	}

	private currentUrl(fallback: string): string {
		const view = this.view;
		if (!view || view instanceof HTMLIFrameElement) return fallback;
		try {
			return view.getURL() || fallback;
		} catch {
			return fallback;
		}
	}
}
