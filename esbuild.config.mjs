import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

/**
 * Resolves `import X from "runtime:<name>"` by bundling `src/runtime/<name>.ts`
 * into a self-contained IIFE and exposing it as a string. This is how the
 * iframe prelude is shipped: type-checked TypeScript, injected as text.
 */
const runtimeTextPlugin = {
	name: "runtime-text",
	setup(build) {
		build.onResolve({ filter: /^runtime:/ }, (args) => ({
			path: args.path.slice("runtime:".length),
			namespace: "runtime-text",
		}));
		build.onLoad({ filter: /.*/, namespace: "runtime-text" }, async (args) => {
			const result = await esbuild.build({
				entryPoints: [`src/runtime/${args.path}.ts`],
				bundle: true,
				write: false,
				format: "iife",
				target: "es2020",
				minify: prod,
				legalComments: "none",
			});
			return {
				contents: `export default ${JSON.stringify(result.outputFiles[0].text)};`,
				loader: "js",
				watchFiles: [`src/runtime/${args.path}.ts`, "src/protocol.ts"],
			};
		});
	},
};

const context = await esbuild.context({
	entryPoints: ["main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		...builtins,
	],
	plugins: [runtimeTextPlugin],
	format: "cjs",
	target: "es2020",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	minify: prod,
	outfile: "main.js",
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
