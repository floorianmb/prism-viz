// esbuild plugin: `import src from "libtext:<file>"` yields the contents of ./libs/<file>,
// deflate-compressed and base64-encoded, so the visualization libraries ship inside
// main.js instead of next to it while main.js stays well below 5 MB (the file size
// Obsidian Sync Standard can sync). src/libs.ts inflates a library on first use.
// fflate (pure JavaScript) compresses, so the output does not depend on Node's zlib
// and the release build stays reproducible byte for byte.
import fs from "fs";
import path from "path";
import { deflateSync } from "fflate";

const libsDir = path.join(path.dirname(path.dirname(new URL(import.meta.url).pathname)), "libs");

export const libTextPlugin = {
	name: "lib-text",
	setup(build) {
		build.onResolve({ filter: /^libtext:/ }, (args) => ({
			path: path.join(libsDir, args.path.slice("libtext:".length)),
			namespace: "lib-text",
		}));
		build.onLoad({ filter: /.*/, namespace: "lib-text" }, async (args) => {
			const source = await fs.promises.readFile(args.path);
			const packed = Buffer.from(deflateSync(source, { level: 9, mem: 8 })).toString("base64");
			return { contents: `export default ${JSON.stringify(packed)};`, loader: "js" };
		});
	},
};
