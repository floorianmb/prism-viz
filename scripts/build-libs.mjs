// Copies / bundles the offline visualization libraries into ./libs.
// Libraries are inlined into each iframe's srcdoc at render time, so they
// must be classic (non-module) scripts that define a global.
import esbuild from "esbuild";
import fs from "fs";
import path from "path";

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const out = path.join(root, "libs");
fs.mkdirSync(out, { recursive: true });

const copy = (from, to) => {
	fs.copyFileSync(path.join(root, "node_modules", from), path.join(out, to));
	console.log(`libs/${to}  <- ${from}`);
};

copy("chart.js/dist/chart.umd.min.js", "chart.umd.min.js");
copy("d3/dist/d3.min.js", "d3.min.js");
copy("mermaid/dist/mermaid.min.js", "mermaid.min.js");

// three.js no longer ships a UMD build: bundle it (plus OrbitControls) as an IIFE.
const bundle = async (contents, outfile) => {
	await esbuild.build({
		stdin: { contents, resolveDir: root, loader: "js" },
		bundle: true,
		format: "iife",
		minify: true,
		target: "es2020",
		legalComments: "eof",
		outfile: path.join(out, outfile),
	});
	console.log(`libs/${outfile}  <- bundled`);
};

await bundle(
	`import * as THREE from "three";
	 import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
	 window.THREE = Object.assign({}, THREE, { OrbitControls });`,
	"three.min.js"
);

// KaTeX: CSS with fonts inlined as data: URIs (the frame CSP only allows
// font-src data:), injected by the script itself, plus auto-render and mhchem.
{
	const dist = path.join(root, "node_modules", "katex", "dist");
	const css = fs
		.readFileSync(path.join(dist, "katex.min.css"), "utf8")
		// Keep only the woff2 source of each @font-face; every frame engine reads it.
		.replace(/src:url\(fonts\/([\w-]+)\.woff2\) format\("woff2"\)(,url\([^)]*\) format\("[^"]*"\))*/g, (_, name) => {
			const font = fs.readFileSync(path.join(dist, "fonts", `${name}.woff2`)).toString("base64");
			return `src:url(data:font/woff2;base64,${font}) format("woff2")`;
		});
	if (/url\(fonts\//.test(css)) throw new Error("KaTeX CSS still references font files; update the inlining pattern.");
	const inject = `(function(){var s=document.createElement("style");s.id="prism-katex";s.textContent=${JSON.stringify(css)};(document.head||document.documentElement).appendChild(s);})();`;
	const parts = [
		fs.readFileSync(path.join(dist, "katex.min.js"), "utf8"),
		fs.readFileSync(path.join(dist, "contrib", "auto-render.min.js"), "utf8"),
		fs.readFileSync(path.join(dist, "contrib", "mhchem.min.js"), "utf8"),
		inject,
	];
	fs.writeFileSync(path.join(out, "katex.min.js"), parts.join("\n;\n"));
	console.log("libs/katex.min.js  <- katex + auto-render + mhchem + inlined fonts");
}

// Screenshot library used for PNG/SVG export and snapshots (loaded on demand).
await bundle(
	`import * as htmlToImage from "html-to-image"; window.htmlToImage = htmlToImage;`,
	"html-to-image.min.js"
);

// Licenses travel with the bundled files.
const licenses = [
	["chart.js", "chart.js/LICENSE.md"],
	["d3", "d3/LICENSE"],
	["mermaid", "mermaid/LICENSE"],
	["three", "three/LICENSE"],
	["html-to-image", "html-to-image/LICENSE"],
	["katex", "katex/LICENSE"],
];
let text = "Third-party libraries bundled with Prism for offline use.\n";
for (const [name, file] of licenses) {
	const p = path.join(root, "node_modules", file);
	const version = JSON.parse(fs.readFileSync(path.join(root, "node_modules", name, "package.json"), "utf8")).version;
	text += `\n\n===== ${name} ${version} =====\n\n` + (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "(license file not found; see package)");
}
fs.writeFileSync(path.join(out, "THIRD_PARTY_LICENSES.txt"), text);
