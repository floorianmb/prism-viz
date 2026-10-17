// Runs the unit tests: bundles test/*.test.ts with esbuild (the same way the
// plugin is built, so `import … from "../src/…"` and JSON imports work) and
// runs them with Node's built-in test runner. Only pure modules are tested;
// nothing here needs Obsidian.
//   node scripts/test.mjs [test/one.test.ts …]   (default: every test file)
// TEST_OUTDIR picks the bundle folder, so several runs can happen at once.
import esbuild from "esbuild";
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";

const outdir = process.env.TEST_OUTDIR || ".test-build";
const picked = process.argv.slice(2);
const entryPoints = picked.length
	? picked
	: readdirSync("test")
			.filter((f) => f.endsWith(".test.ts"))
			.map((f) => `test/${f}`);
// Bundled libraries (src/libs.ts) only exist after a build and no test needs them.
const noLibs = {
	name: "no-libs",
	setup(build) {
		build.onResolve({ filter: /^libtext:/ }, (args) => ({ path: args.path, namespace: "no-libs" }));
		build.onLoad({ filter: /.*/, namespace: "no-libs" }, () => ({ contents: 'export default "";', loader: "js" }));
	},
};
rmSync(outdir, { recursive: true, force: true });
await esbuild.build({ entryPoints, outdir, bundle: true, platform: "node", format: "cjs", target: "node20", logLevel: "error", external: ["obsidian"], plugins: [noLibs] });
const files = entryPoints.map((f) => `${outdir}/${f.replace(/^.*\//, "").replace(/\.ts$/, ".js")}`);
const run = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(run.status ?? 1);
