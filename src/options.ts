import { resolveLibrary } from "./libs";

export interface VizOptions {
	/** Canonical library names to inline (see LIBRARIES). */
	libs: string[];
	/** Fixed height in px; null means auto-height. */
	height: number | null;
	/** Fill the container height (HTML file view, fullscreen). */
	fill: boolean;
	title?: string;
	id?: string;
	/** Skip Prism's default stylesheet. */
	raw: boolean;
	/** Render immediately, ignoring lazy rendering. */
	eager: boolean;
	noToolbar: boolean;
	/** Show the source below the rendering initially. */
	showSource: boolean;
	/** ```viz table: the body is a YAML/JSON table spec. */
	table: boolean;
	/** ```viz web: the body is a URL shown as a web page (Online access → Web pages). */
	web: boolean;
	/** ```viz monitor: CPU and memory of the blocks on this page; the body is an optional YAML spec. */
	monitor: boolean;
	/** Problems found while parsing options, shown as warnings. */
	warnings: string[];
}

export function emptyOptions(): VizOptions {
	return { libs: [], height: null, fill: false, raw: false, eager: false, noToolbar: false, showSource: false, table: false, web: false, monitor: false, warnings: [] };
}

const TOKEN = /([A-Za-z_][\w.-]*)(?:\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*'|[^\s"']+))?/g;

/** Parses `chart d3 height=420 title="Architecture"` into `into`. */
export function parseOptionString(input: string, into: VizOptions): VizOptions {
	TOKEN.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = TOKEN.exec(input))) {
		const key = m[1].toLowerCase();
		let value = m[2];
		if (value !== undefined) {
			if (value.startsWith('"')) value = value.slice(1, -1).replace(/\\(.)/g, "$1");
			else if (value.startsWith("'")) value = value.slice(1, -1);
		}
		switch (key) {
			case "height": {
				if (value === undefined || value === "auto") {
					into.height = null;
					break;
				}
				if (value === "fill") {
					into.fill = true;
					break;
				}
				const n = parseInt(value, 10);
				if (Number.isFinite(n) && n >= 40 && n <= 10000) into.height = n;
				else into.warnings.push(`Invalid height "${value}" (expected 40-10000, "auto" or "fill").`);
				break;
			}
			case "title":
				into.title = value ?? "";
				break;
			case "id":
				if (value && /^[\w.-]{1,80}$/.test(value)) into.id = value;
				else into.warnings.push(`Invalid id "${value ?? ""}" (letters, digits, "_", "-", "."; max 80).`);
				break;
			case "raw":
				into.raw = true;
				break;
			case "eager":
			case "nolazy":
				into.eager = true;
				break;
			case "notoolbar":
				into.noToolbar = true;
				break;
			case "source":
				into.showSource = true;
				break;
			case "fill":
				into.fill = true;
				break;
			case "table":
				into.table = true;
				break;
			case "web":
				into.web = true;
				break;
			case "monitor":
				into.monitor = true;
				break;
			default: {
				const lib = value === undefined ? resolveLibrary(key) : null;
				if (lib) {
					if (!into.libs.includes(lib)) into.libs.push(lib);
				} else {
					into.warnings.push(`Unknown option "${m[0]}".`);
				}
			}
		}
	}
	return into;
}

const FENCE = /^\s*(`{3,}|~{3,})\s*viz(?:\s+(.*))?$/i;

/** Extracts the option part of a ```viz fence line, or null if not a viz fence. */
export function fenceOptions(line: string): string | null {
	const m = FENCE.exec(line);
	return m ? (m[2] ?? "").trim() : null;
}

/** Options declared inside HTML: `<!-- prism: ... -->` or `<meta name="prism" content="...">`. */
export function inlineOptions(source: string): string {
	const head = source.slice(0, 4000);
	const parts: string[] = [];
	const comment = /<!--\s*prism:\s*([\s\S]*?)-->/i.exec(head);
	if (comment) parts.push(comment[1]);
	const meta = /<meta\s+[^>]*name\s*=\s*["']prism["'][^>]*>/i.exec(head);
	if (meta) {
		const content = /content\s*=\s*("([^"]*)"|'([^']*)')/i.exec(meta[0]);
		if (content) parts.push((content[2] ?? content[3] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
	}
	return parts.join(" ");
}

/** Index (0-based) of the viz block starting at `lineStart` among viz blocks in `text`. */
export function vizBlockIndex(text: string, lineStart: number): number {
	const lines = text.split("\n");
	let index = 0;
	let open: { char: string; len: number } | null = null;
	for (let i = 0; i < lines.length && i < lineStart; i++) {
		const line = lines[i];
		const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
		if (!fence) continue;
		const char = fence[1][0];
		const len = fence[1].length;
		if (open) {
			if (char === open.char && len >= open.len && fence[2].trim() === "") open = null;
		} else {
			open = { char, len };
			if (/^\s*viz(\s|$)/i.test(fence[2])) index++;
		}
	}
	return index;
}
