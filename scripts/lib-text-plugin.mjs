// esbuild plugin: `import src from "libtext:<file>"` yields the contents of ./libs/<file> as a string,
// so the visualization libraries ship inside main.js instead of next to it.
import fs from "fs";
import path from "path";

const libsDir = path.join(path.dirname(path.dirname(new URL(import.meta.url).pathname)), "libs");

export const libTextPlugin = {
	name: "lib-text",
	setup(build) {
		build.onResolve({ filter: /^libtext:/ }, (args) => ({
			path: path.join(libsDir, args.path.slice("libtext:".length)),
			namespace: "lib-text",
		}));
		build.onLoad({ filter: /.*/, namespace: "lib-text" }, async (args) => {
			const source = await fs.promises.readFile(args.path, "utf8");
			return { contents: `export default ${JSON.stringify(source)};`, loader: "js" };
		});
	},
};
