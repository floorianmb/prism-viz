import type { ThemeSnapshot } from "./protocol";

/** Obsidian color variables forwarded into every block (normalized to hex/rgba). */
const COLOR_VARS = [
	"background-primary",
	"background-primary-alt",
	"background-secondary",
	"background-secondary-alt",
	"background-modifier-border",
	"background-modifier-border-hover",
	"background-modifier-border-focus",
	"background-modifier-hover",
	"background-modifier-active-hover",
	"background-modifier-form-field",
	"background-modifier-error",
	"background-modifier-success",
	"background-modifier-message",
	"text-normal",
	"text-muted",
	"text-faint",
	"text-on-accent",
	"text-accent",
	"text-accent-hover",
	"text-error",
	"text-success",
	"text-warning",
	"text-selection",
	"text-highlight-bg",
	"interactive-normal",
	"interactive-hover",
	"interactive-accent",
	"interactive-accent-hover",
	"color-accent",
	"color-accent-1",
	"color-accent-2",
	"color-red",
	"color-orange",
	"color-yellow",
	"color-green",
	"color-cyan",
	"color-blue",
	"color-purple",
	"color-pink",
	"color-base-00",
	"color-base-05",
	"color-base-10",
	"color-base-20",
	"color-base-25",
	"color-base-30",
	"color-base-35",
	"color-base-40",
	"color-base-50",
	"color-base-60",
	"color-base-70",
	"color-base-100",
	"code-background",
	"code-normal",
	"code-comment",
	"code-keyword",
	"code-string",
	"code-function",
	"link-color",
	"tag-color",
	"tag-background",
	"blockquote-border-color",
	"hr-color",
	"table-border-color",
	"table-header-background",
	"checkbox-color",
];
const FONT_VARS = ["font-text", "font-interface", "font-monospace"];
const SIZE_VARS = ["font-text-size", "font-ui-smaller", "font-ui-small", "font-ui-medium", "font-ui-large"];
const RAW_VARS = [
	"line-height-normal",
	"line-height-tight",
	"font-normal",
	"font-medium",
	"font-semibold",
	"font-bold",
	"radius-s",
	"radius-m",
	"radius-l",
	"radius-xl",
	"size-4-1",
	"size-4-2",
	"size-4-3",
	"size-4-4",
	"size-4-6",
	"size-4-8",
	"border-width",
	"shadow-s",
	"shadow-l",
];
const PALETTE = ["color-blue", "color-orange", "color-green", "color-red", "color-purple", "color-cyan", "color-yellow", "color-pink"];

/** Reads Obsidian's current theme variables from `doc.body`. */
export function collectTheme(doc: Document): ThemeSnapshot {
	const body = doc.body;
	const dark = body.classList.contains("theme-dark");
	const bodyStyle = getComputedStyle(body);
	const probe = doc.createElement("div");
	probe.addClass("prism-theme-probe");
	body.appendChild(probe);
	const canvas = doc.createElement("canvas").getContext("2d");
	const vars: Record<string, string> = {};

	const normalizeColor = (value: string): string => {
		if (!canvas) return value;
		canvas.fillStyle = "#000000";
		canvas.fillStyle = value;
		return String(canvas.fillStyle);
	};

	try {
		const resolve = (name: string, prop: "color" | "fontFamily" | "fontSize") => {
			if (!bodyStyle.getPropertyValue(`--${name}`).trim()) return null;
			const cssProp = prop === "color" ? "color" : prop === "fontFamily" ? "font-family" : "font-size";
			probe.setCssProps({ [cssProp]: "" });
			probe.setCssProps({ [cssProp]: `var(--${name})` });
			return getComputedStyle(probe)[prop];
		};
		for (const name of COLOR_VARS) {
			const v = resolve(name, "color");
			if (v) vars[`--${name}`] = normalizeColor(v);
		}
		for (const name of FONT_VARS) {
			const v = resolve(name, "fontFamily");
			if (v) vars[`--${name}`] = v;
		}
		for (const name of SIZE_VARS) {
			const v = resolve(name, "fontSize");
			if (v) vars[`--${name}`] = v;
		}
		for (const name of RAW_VARS) {
			const v = bodyStyle.getPropertyValue(`--${name}`).trim();
			if (v) vars[`--${name}`] = v;
		}
	} finally {
		probe.remove();
	}

	return { dark, vars, palette: buildPalette(vars, dark) };
}

function rgb(color: string): [number, number, number] | null {
	const hex = /^#([0-9a-f]{6})$/i.exec(color);
	if (hex) {
		const n = parseInt(hex[1], 16);
		return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
	}
	const m = /rgba?\(([^)]+)\)/.exec(color);
	if (!m) return null;
	const [r, g, b] = m[1].split(",").map((s) => parseFloat(s));
	return [r, g, b];
}

function buildPalette(vars: Record<string, string>, dark: boolean): string[] {
	const palette: string[] = [];
	const accent = vars["--interactive-accent"] || vars["--color-accent"];
	const candidates = [accent, ...PALETTE.map((n) => vars[`--${n}`])].filter((c): c is string => !!c);
	for (const c of candidates) {
		const a = rgb(c);
		if (!a) continue;
		const tooClose = palette.some((p) => {
			const b = rgb(p);
			return !!b && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 60;
		});
		if (!tooClose) palette.push(c);
	}
	// Fallback for themes that do not define the color variables.
	const fallback = dark
		? ["#7aa2f7", "#ff9e64", "#9ece6a", "#f7768e", "#bb9af7", "#7dcfff", "#e0af68", "#ff75a0"]
		: ["#2f6fdb", "#e8590c", "#2b8a3e", "#c92a2a", "#7048e8", "#0c8599", "#e67700", "#d6336c"];
	for (const c of fallback) if (palette.length < 8 && !palette.includes(c)) palette.push(c);
	return palette.slice(0, 8);
}
