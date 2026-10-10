import { inflateSync, strFromU8 } from "fflate";
import chartSource from "libtext:chart.umd.min.js";
import d3Source from "libtext:d3.min.js";
import mermaidSource from "libtext:mermaid.min.js";
import katexSource from "libtext:katex.min.js";
import threeSource from "libtext:three.min.js";
import htmlToImageSource from "libtext:html-to-image.min.js";

/**
 * Library sources, embedded into main.js at build time so the plugin needs no
 * extra files: deflate-compressed and base64-encoded (scripts/lib-text-plugin.mjs).
 */
const BUNDLED: Record<string, string> = {
	"chart.umd.min.js": chartSource,
	"d3.min.js": d3Source,
	"mermaid.min.js": mermaidSource,
	"katex.min.js": katexSource,
	"three.min.js": threeSource,
	"html-to-image.min.js": htmlToImageSource,
};

export interface LibraryInfo {
	/** Library file name (its source is embedded into main.js at build time). */
	file: string;
	/** Global defined by the script. */
	globalName: string;
	aliases: string[];
	description: string;
}

/** Library keywords usable in the ```viz info line. */
export const LIBRARIES: Record<string, LibraryInfo> = {
	chart: {
		file: "chart.umd.min.js",
		globalName: "Chart",
		aliases: ["chartjs", "chart.js"],
		description: "Chart.js 4 (global `Chart`); defaults follow the theme, datasets without colors use the theme palette.",
	},
	d3: {
		file: "d3.min.js",
		globalName: "d3",
		aliases: [],
		description: "D3 v7 (global `d3`).",
	},
	mermaid: {
		file: "mermaid.min.js",
		globalName: "mermaid",
		aliases: [],
		description:
			"Mermaid 11 (global `mermaid`); `.mermaid` elements render automatically with theme colors. A block whose body is plain Mermaid text (not HTML) is rendered as a diagram.",
	},
	katex: {
		file: "katex.min.js",
		globalName: "katex",
		aliases: ["math", "latex", "tex"],
		description:
			"KaTeX (global `katex`, with mhchem). `$…$`, `$$…$$`, `\\(…\\)` and `\\[…\\]` in the block render as formulas automatically; call `prism.math(element)` after inserting new text with formulas.",
	},
	three: {
		file: "three.min.js",
		globalName: "THREE",
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

/** Bytes of a base64 string (no Obsidian API here: scripts/build-skill.mjs bundles this file for Node). */
function fromBase64(text: string): Uint8Array {
	const binary = atob(text);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

/** Returns the library sources embedded in main.js, inflated on first use and then kept in memory. */
export class LibraryCache {
	private sources = new Map<string, string>();

	load(file: string): Promise<string> {
		const cached = this.sources.get(file);
		if (cached !== undefined) return Promise.resolve(cached);
		const packed = BUNDLED[file];
		if (packed === undefined) return Promise.reject(new Error(`Prism library "${file}" is not bundled. Rebuild the plugin.`));
		try {
			const source = strFromU8(inflateSync(fromBase64(packed)));
			this.sources.set(file, source);
			return Promise.resolve(source);
		} catch (err) {
			return Promise.reject(new Error(`Prism library "${file}" could not be unpacked (${err instanceof Error ? err.message : String(err)})`));
		}
	}
}
