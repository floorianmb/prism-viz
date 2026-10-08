import chartSource from "libtext:chart.umd.min.js";
import d3Source from "libtext:d3.min.js";
import mermaidSource from "libtext:mermaid.min.js";
import katexSource from "libtext:katex.min.js";
import threeSource from "libtext:three.min.js";
import htmlToImageSource from "libtext:html-to-image.min.js";

/** Library sources, embedded into main.js at build time so the plugin needs no extra files. */
const BUNDLED: Record<string, string> = {
	"chart.umd.min.js": chartSource,
	"d3.min.js": d3Source,
	"mermaid.min.js": mermaidSource,
	"katex.min.js": katexSource,
	"three.min.js": threeSource,
	"html-to-image.min.js": htmlToImageSource,
};

export interface LibraryInfo {
	/** File inside `<plugin>/libs/`. */
	file: string;
	/** Global defined by the script. */
	global: string;
	aliases: string[];
	description: string;
}

/** Library keywords usable in the ```viz info line. */
export const LIBRARIES: Record<string, LibraryInfo> = {
	chart: {
		file: "chart.umd.min.js",
		global: "Chart",
		aliases: ["chartjs", "chart.js"],
		description: "Chart.js 4 (global `Chart`); defaults follow the theme, datasets without colors use the theme palette.",
	},
	d3: {
		file: "d3.min.js",
		global: "d3",
		aliases: [],
		description: "D3 v7 (global `d3`).",
	},
	mermaid: {
		file: "mermaid.min.js",
		global: "mermaid",
		aliases: [],
		description:
			"Mermaid 11 (global `mermaid`); `.mermaid` elements render automatically with theme colors. A block whose body is plain Mermaid text (not HTML) is rendered as a diagram.",
	},
	katex: {
		file: "katex.min.js",
		global: "katex",
		aliases: ["math", "latex", "tex"],
		description:
			"KaTeX (global `katex`, with mhchem). `$…$`, `$$…$$`, `\\(…\\)` and `\\[…\\]` in the block render as formulas automatically; call `prism.math(element)` after inserting new text with formulas.",
	},
	three: {
		file: "three.min.js",
		global: "THREE",
		aliases: ["threejs", "three.js"],
		description: "three.js (global `THREE`, includes `THREE.OrbitControls`).",
	},
};

export const SCREENSHOT_LIB = "html-to-image.min.js";

const aliasMap = new Map<string, string>();
for (const [name, info] of Object.entries(LIBRARIES)) {
	aliasMap.set(name, name);
	for (const alias of info.aliases) aliasMap.set(alias, name);
}

export function resolveLibrary(keyword: string): string | null {
	return aliasMap.get(keyword.toLowerCase()) ?? null;
}

/** Returns the library sources embedded in main.js. */
export class LibraryCache {
	load(file: string): Promise<string> {
		const source = BUNDLED[file];
		if (source === undefined) return Promise.reject(new Error(`Prism library "${file}" is not bundled. Rebuild the plugin.`));
		return Promise.resolve(source);
	}
}
