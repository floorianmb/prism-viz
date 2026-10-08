// Builds the srcdoc for a block: CSP, theme variables, base stylesheet,
// runtime prelude, inlined libraries and the user's HTML. Also produces a line
// map so that error positions inside the srcdoc can be traced back to lines of
// the note.

import type { FrameConfig, RawFrameError } from "./protocol";
import { themeToCss } from "./protocol";
import type { VizOptions } from "./options";
import { guardHtml } from "./loopGuard";
import { countNewlines, escapeHtml, escapeScript, scriptJson } from "./util";
import { MONITOR_CSS, NOTE_LINK_CSS, TABLE_CSS } from "./widgetCss";

export const BASE_CSS = `
:where(html){-webkit-text-size-adjust:100%;background:transparent}
:where(body){margin:0;padding:0;display:flow-root;background:transparent;color:var(--text-normal);font-family:var(--font-text,system-ui,sans-serif);font-size:var(--font-text-size,16px);line-height:var(--line-height-normal,1.5);-webkit-font-smoothing:antialiased}
:where(*,*::before,*::after){box-sizing:border-box}
:where(h1,h2,h3,h4,h5,h6){margin:.6em 0 .4em;line-height:var(--line-height-tight,1.3);font-weight:var(--font-semibold,600);color:var(--text-normal)}
:where(h1){font-size:1.6em}:where(h2){font-size:1.35em}:where(h3){font-size:1.15em}:where(h4,h5,h6){font-size:1em}
:where(p,ul,ol,dl,blockquote,table,pre,figure){margin:0 0 .8em}
:where(a){color:var(--link-color,var(--text-accent));text-underline-offset:2px}
:where(a:hover){color:var(--text-accent-hover)}
:where(small,.muted){color:var(--text-muted)}
:where(.faint){color:var(--text-faint)}
:where(code,kbd,pre,samp){font-family:var(--font-monospace,ui-monospace,monospace);font-size:.875em}
:where(code){background:var(--code-background);padding:.1em .3em;border-radius:var(--radius-s,4px)}
:where(pre){background:var(--code-background);padding:.75em 1em;border-radius:var(--radius-m,8px);overflow:auto}
:where(pre code){background:none;padding:0}
:where(.prism-math){font-size:1.15em;overflow-x:auto;overflow-y:hidden;padding:.25em 0}
:where(.katex-display){margin:.6em 0}
:where(pre.mermaid){background:none;padding:0;margin:0;font-family:inherit;font-size:inherit;display:flex;justify-content:center;overflow:visible}
:where(blockquote){margin-left:0;padding-left:1em;border-left:3px solid var(--blockquote-border-color,var(--interactive-accent));color:var(--text-muted)}
:where(hr){border:0;border-top:1px solid var(--hr-color,var(--background-modifier-border));margin:1em 0}
:where(table){border-collapse:collapse;width:100%;font-size:.9em}
:where(th,td){border:1px solid var(--table-border-color,var(--background-modifier-border));padding:.4em .6em;text-align:left;vertical-align:top}
:where(th){background:var(--table-header-background,var(--background-secondary));font-weight:var(--font-semibold,600)}
:where(button,input,select,textarea){font:inherit;color:inherit}
:where(button){background:var(--interactive-normal);color:var(--text-normal);border:1px solid var(--background-modifier-border);border-radius:var(--radius-s,4px);padding:.35em .8em;cursor:pointer}
:where(button:hover){background:var(--interactive-hover)}
:where(button.primary,button.mod-cta){background:var(--interactive-accent);color:var(--text-on-accent);border-color:transparent}
:where(button.primary:hover,button.mod-cta:hover){background:var(--interactive-accent-hover)}
:where(button:disabled){opacity:.5;cursor:default}
:where(input:not([type=checkbox],[type=radio],[type=range],[type=color]),select,textarea){background:var(--background-modifier-form-field,var(--background-primary));border:1px solid var(--background-modifier-border);border-radius:var(--radius-s,4px);padding:.3em .5em}
:where(input,select,textarea,button):focus-visible{outline:2px solid var(--background-modifier-border-focus,var(--interactive-accent));outline-offset:1px}
:where(input[type=checkbox],input[type=radio],input[type=range],progress){accent-color:var(--interactive-accent)}
:where(img,video,canvas){max-width:100%}
:where(img,video){height:auto}
::selection{background:var(--text-selection)}
:where(.card){background:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:var(--radius-m,8px);padding:var(--size-4-3,12px) var(--size-4-4,16px)}
:where(.grid){display:grid;gap:var(--size-4-3,12px);grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
:where(.row){display:flex;flex-wrap:wrap;gap:var(--size-4-2,8px);align-items:center}
:where(.stack){display:flex;flex-direction:column;gap:var(--size-4-2,8px)}
:where(.kpi){font-size:2em;font-weight:var(--font-bold,700);line-height:1.1;font-variant-numeric:tabular-nums}
:where(.label:not(.mermaid *)){font-size:var(--font-ui-small,13px);color:var(--text-muted)}
:where(.badge){display:inline-block;padding:.1em .55em;border-radius:999px;font-size:.8em;background:var(--background-modifier-hover);color:var(--text-muted)}
:where(.accent){color:var(--text-accent)}:where(.error){color:var(--text-error)}:where(.success){color:var(--text-success)}:where(.warning){color:var(--text-warning)}
:where(.toolbar){display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--size-4-2,8px);margin-bottom:var(--size-4-2,8px)}
:where(.segmented){display:inline-flex;flex-wrap:wrap;gap:2px;padding:3px;border-radius:999px;background:var(--background-modifier-hover)}
:where(.segmented button){border:0;background:transparent;box-shadow:none;border-radius:999px;padding:.25em .9em;font-size:var(--font-ui-small,13px);color:var(--text-muted)}
:where(.segmented button:hover){background:transparent;color:var(--text-normal)}
:where(.segmented button[aria-pressed=true]){background:var(--background-primary);color:var(--text-normal);box-shadow:0 1px 3px rgb(0 0 0/.18)}
:where(.chip,.icon-button){border:1px solid var(--background-modifier-border);background:transparent;box-shadow:none;color:var(--text-muted);border-radius:999px;font-size:var(--font-ui-small,13px)}
:where(.chip){padding:.25em .85em}
:where(.chip[aria-pressed=true]){color:var(--text-normal);border-color:var(--interactive-accent);background:color-mix(in srgb,var(--interactive-accent) 14%,transparent)}
:where(.icon-button){width:30px;height:30px;padding:0;display:inline-grid;place-items:center}
:where(.icon-button svg){width:14px;height:14px;fill:currentColor}
:where(.chip:hover,.icon-button:hover){background:var(--background-modifier-hover);color:var(--text-normal)}
:where(.stage){position:relative;height:clamp(240px,50vw,360px);border-radius:14px;overflow:hidden;color:oklch(.93 .01 260);background:radial-gradient(120% 90% at 50% 40%,oklch(.24 .03 260),oklch(.13 .02 260) 65%,oklch(.10 .02 260));box-shadow:inset 0 0 0 1px rgb(255 255 255/.06),0 8px 24px -12px rgb(0 0 0/.45)}
:where(.stage>canvas){position:absolute;inset:0;width:100%;height:100%;display:block}
:where(.hud){position:absolute;left:14px;right:14px;bottom:10px;display:flex;justify-content:space-between;gap:12px;pointer-events:none;font:500 11px/1.3 var(--font-monospace,ui-monospace,monospace);color:oklch(.72 .03 260);font-variant-numeric:tabular-nums}
:where(.hud b){color:oklch(.95 .01 260);font-weight:600}
:where(.caption){margin:.6em 2px 0;font-size:var(--font-ui-small,13px);color:var(--text-muted);line-height:1.45}
:where(.variants-bar){margin-bottom:var(--size-4-2,8px)}
:where(iframe){color-scheme:light}
:where(html.is-fullscreen .stage){height:calc(100vh - 140px)}
`.trim();

/** Content-Security-Policy for a block. Network is off unless allowlisted; `frames` allows <iframe> web pages (Online access → Web pages). */
export function buildCsp(allowlist: string[], frames = false): string {
	const extra = allowlist.length ? " " + allowlist.join(" ") : "";
	const directives = [
		"default-src 'none'",
		`script-src 'unsafe-inline'${extra}`,
		`style-src 'unsafe-inline'${extra}`,
		`img-src data: blob:${extra}`,
		`font-src data:${extra}`,
		`media-src data: blob:${extra}`,
	];
	if (allowlist.length) directives.push(`connect-src${extra}`);
	if (frames) directives.push("frame-src https: http:");
	directives.push("base-uri 'none'", "form-action 'none'");
	return directives.join("; ") + ";";
}

/** Normalizes allowlist entries into CSP host sources; returns valid entries. */
export function normalizeAllowlist(lines: string[]): { valid: string[]; invalid: string[] } {
	const valid: string[] = [];
	const invalid: string[] = [];
	for (const raw of lines) {
		const entry = raw.trim().replace(/\/+$/, "");
		if (!entry) continue;
		const m = /^(https?:\/\/)?((?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+)(:\d{1,5})?$/i.exec(entry);
		if (!m) {
			invalid.push(raw.trim());
			continue;
		}
		const source = `${(m[1] || "https://").toLowerCase()}${m[2].toLowerCase()}${m[3] || ""}`;
		if (!valid.includes(source)) valid.push(source);
	}
	return { valid, invalid };
}

const FULL_DOCUMENT = /^\s*(?:<!--[\s\S]*?-->\s*)*(?:<!doctype|<html)/i;

export function isFullDocument(source: string): boolean {
	return FULL_DOCUMENT.test(source);
}

/** True when a mermaid block contains diagram text rather than HTML. */
export function isPlainMermaid(source: string): boolean {
	const t = source.replace(/^\s*(?:<!--[\s\S]*?-->\s*)*/, "");
	return !t.startsWith("<");
}

/** A ```viz chart block written as a YAML/JSON spec instead of HTML. */
export function isChartSpec(source: string, options: VizOptions): boolean {
	return !options.table && options.libs.includes("chart") && !options.libs.includes("mermaid") && isPlainMermaid(source) && source.trim() !== "";
}

/** A ```viz table block: YAML/JSON table spec. */
export function isTableSpec(source: string, options: VizOptions): boolean {
	return options.table && isPlainMermaid(source) && source.trim() !== "";
}

/** HTML that renders a parsed table spec with prism.table(). */
export function tableSpecHtml(spec: Record<string, unknown>): string {
	return `<div class="prism-table"></div>\n<script>prism.table(document.querySelector(".prism-table"), ${scriptJson(spec)});</script>`;
}

/**
 * A ```viz katex/math block written as plain LaTeX instead of HTML. A body
 * without $ or \[ delimiters is one display formula; otherwise it is text with
 * formulas, and blank lines separate paragraphs.
 */
export function plainMathHtml(source: string): string {
	const body = source.trim();
	if (!/\$|\\\[|\\\(/.test(body)) return `<div class="prism-math">${escapeHtml(`$$${body}$$`)}</div>`;
	return body
		.split(/\n\s*\n/)
		.map((p) => `<p>${escapeHtml(p)}</p>`)
		.join("\n");
}

export function isPlainMath(source: string, options: VizOptions): boolean {
	return options.libs.includes("katex") && !options.libs.includes("mermaid") && !options.libs.includes("chart") && isPlainMermaid(source) && source.trim() !== "";
}

/** HTML of a ```viz monitor block: the page monitor of prism.monitor(). */
export function monitorSpecHtml(spec: Record<string, unknown>): string {
	return `<div class="prism-monitor"></div>\n<script>prism.monitor(document.querySelector(".prism-monitor"), ${scriptJson(spec)});</script>`;
}

/** HTML that renders a parsed chart spec with prism.chart(). */
export function chartSpecHtml(spec: Record<string, unknown>): string {
	const height = Math.max(80, Math.min(4000, Number(spec.height) || 300));
	return (
		`<div class="prism-chart" style="position:relative;height:${height}px"></div>\n` +
		`<script>prism.chart(document.querySelector(".prism-chart"), ${scriptJson(spec)});</script>`
	);
}

type Segment = "user" | "wrapper" | "prelude" | `lib:${string}`;
interface Part {
	text: string;
	segment: Segment;
	/** For user parts: user line at the first line of this part (1-based). */
	userLine?: number;
}

export interface MappedLocation {
	/** 1-based line within the block content (or HTML file). */
	line?: number;
	column?: number;
	/** Where the error originated when it is not in user code. */
	origin: "block" | "prism" | `lib:${string}` | "unknown";
}

export class LineMap {
	private ranges: { start: number; end: number; part: Part }[] = [];

	constructor(parts: Part[]) {
		let line = 1;
		for (const part of parts) {
			const end = line + countNewlines(part.text);
			this.ranges.push({ start: line, end, part });
			line = end;
		}
	}

	map(srcdocLine: number, column?: number): MappedLocation {
		// A line can be shared by two parts; prefer user code.
		const hits = this.ranges.filter((r) => srcdocLine >= r.start && srcdocLine <= r.end);
		const user = hits.find((r) => r.part.segment === "user");
		const hit = user || hits[0];
		if (!hit) return { origin: "unknown" };
		if (hit.part.segment === "user") {
			return { line: (hit.part.userLine ?? 1) + (srcdocLine - hit.start), column, origin: "block" };
		}
		if (hit.part.segment === "wrapper" || hit.part.segment === "prelude") return { origin: "prism" };
		return { origin: hit.part.segment };
	}

	/** Best location for an error: first stack frame in user code, else the reported line. */
	locate(error: RawFrameError): MappedLocation {
		const candidates: { line: number; column?: number }[] = [];
		if (error.line) candidates.push({ line: error.line, column: error.column });
		if (error.stack) {
			const re = /about:srcdoc:(\d+):(\d+)/g;
			let m: RegExpExecArray | null;
			while ((m = re.exec(error.stack))) candidates.push({ line: +m[1], column: +m[2] });
		}
		let fallback: MappedLocation | null = null;
		for (const c of candidates) {
			const loc = this.map(c.line, c.column);
			if (loc.origin === "block") return loc;
			fallback = fallback || loc;
		}
		return fallback || { origin: "unknown" };
	}
}

export interface BuildInput {
	source: string;
	options: VizOptions;
	config: FrameConfig;
	allowlist: string[];
	/** Allow <iframe> with web pages (Online access → Web pages). */
	frames?: boolean;
	prelude: string;
	/** Library name -> source code, in load order. */
	libs: [string, string][];
	/** Parsed spec of a declarative chart block (see isChartSpec). */
	chartSpec?: Record<string, unknown>;
	/** Parsed spec of a declarative table block (see isTableSpec). */
	tableSpec?: Record<string, unknown>;
	/** Options of a ```viz monitor block. */
	monitorSpec?: Record<string, unknown>;
}

export function buildDocument(input: BuildInput): { html: string; lineMap: LineMap } {
	const { options, config } = input;
	let source = input.source;
	let userSegment: Segment = "user";
	if (input.monitorSpec) {
		source = monitorSpecHtml(input.monitorSpec);
		userSegment = "wrapper";
	} else if (input.tableSpec) {
		source = tableSpecHtml(input.tableSpec);
		userSegment = "wrapper";
	} else if (input.chartSpec) {
		source = chartSpecHtml(input.chartSpec);
		// Generated markup: errors point to the runtime, not to lines of the spec.
		userSegment = "wrapper";
	} else if (isPlainMath(source, options)) {
		source = plainMathHtml(source);
		userSegment = "wrapper";
	} else if (options.libs.includes("mermaid") && isPlainMermaid(source)) {
		// Escaping keeps line breaks, so line numbers stay aligned.
		source = `<pre class="mermaid">${escapeHtml(source)}</pre>`;
	} else {
		source = guardHtml(source);
	}

	const injection: Part[] = [];
	const add = (text: string, segment: Segment) => injection.push({ text, segment });
	add(
		`<meta charset="utf-8">` +
			`<meta http-equiv="Content-Security-Policy" content="${escapeHtml(buildCsp(input.allowlist, input.frames))}">` +
			`<meta name="viewport" content="width=device-width,initial-scale=1">` +
			`<style id="prism-theme">${themeToCss(config.theme)}</style>` +
			`<style id="prism-core">${config.autoHeight ? "html{overflow-y:hidden}" : "html,body{height:100%}"}</style>` +
			(options.raw ? "" : `<style id="prism-base">${BASE_CSS}</style>`) +
			`<style id="prism-widgets">${TABLE_CSS}${MONITOR_CSS}</style>` +
			`<style id="prism-note-links">${NOTE_LINK_CSS}</style>`,
		"wrapper"
	);
	add(`<script>window.__PRISM_CONFIG__=${scriptJson(config)};${escapeScript(input.prelude)}</script>`, "prelude");
	for (const [name, code] of input.libs) {
		add(`<script data-prism-lib="${name}">${escapeScript(code)}\n</script>`, `lib:${name}`);
	}
	if (input.libs.length) add(`<script>window.prism._afterLibs&&window.prism._afterLibs()</script>`, "wrapper");

	const parts: Part[] = [];
	const mode = config.theme.dark ? "dark" : "light";
	if (isFullDocument(source)) {
		const head = /<head(?:\s[^>]*)?>/i.exec(source);
		const scriptBefore = head ? /<script/i.test(source.slice(0, head.index)) : true;
		let pos: number;
		if (head && !scriptBefore) pos = head.index + head[0].length;
		else {
			const html = /<html(?:\s[^>]*)?>/i.exec(source);
			const doctype = /<!doctype[^>]*>/i.exec(source);
			pos = html ? html.index + html[0].length : doctype ? doctype.index + doctype[0].length : 0;
		}
		const before = source.slice(0, pos);
		parts.push({ text: before, segment: "user", userLine: 1 });
		parts.push(...injection);
		parts.push({ text: source.slice(pos), segment: "user", userLine: 1 + countNewlines(before) });
	} else {
		parts.push({
			text: `<!DOCTYPE html>\n<html lang="en" class="theme-${mode}" data-theme="${mode}">\n<head>\n`,
			segment: "wrapper",
		});
		parts.push(...injection);
		parts.push({ text: `\n</head>\n<body>\n`, segment: "wrapper" });
		parts.push({ text: source, segment: userSegment, userLine: 1 });
		parts.push({ text: `\n</body>\n</html>\n`, segment: "wrapper" });
	}
	return { html: parts.map((p) => p.text).join(""), lineMap: new LineMap(parts) };
}
