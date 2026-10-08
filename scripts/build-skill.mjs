// Generates skill/reference.md from the same source as PRISM.md (src/agentRules.ts),
// so the agent skill and the in-vault reference never drift apart.
import esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { libTextPlugin } from "./lib-text-plugin.mjs";

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const out = await esbuild.build({
	entryPoints: [path.join(root, "src/agentRules.ts")],
	bundle: true,
	write: false,
	format: "esm",
	platform: "neutral",
	logLevel: "error",
	plugins: [libTextPlugin],
});
const mod = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
const text = mod
	.agentRules()
	.replace(/^---\n[\s\S]*?\n---\n/, "") // frontmatter belongs to PRISM.md only
	.replace(/\n## Text for CLAUDE\.md \/ AGENTS\.md[\s\S]*$/, "\n") // the skill replaces that snippet
	.replace(/^<!-- prism:agent-rules -->\n/m, "")
	.replace(/ Regenerate this file with the command "Prism: Generate agent rules"\./, "");
fs.writeFileSync(path.join(root, "skill", "reference.md"), text);
console.log("skill/reference.md written");
