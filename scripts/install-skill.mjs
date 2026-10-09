// Installs the Prism agent skill for Codex and Claude Code:
//   ~/.codex/skills/prism, $CLAUDE_CONFIG_DIR/skills/prism (if set), ~/.claude-sso/skills/prism, ~/.claude/skills/prism
// Only into config folders that already exist. Re-run after updating the plugin.
//   node scripts/install-skill.mjs [--vault <path>] [--dry-run]
// --vault: the vault the skill falls back to (default: three folders above this repo,
// i.e. the vault when run from .obsidian/plugins/prism-viz). Also copies prism-render.mjs
// into that vault's plugin folder, because the community plugin download only contains
// main.js, manifest.json and styles.css.
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const args = process.argv.slice(2);
const option = (name) => {
	const i = args.indexOf(name);
	return i !== -1 && args[i + 1] ? args[i + 1] : undefined;
};
const pluginDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const vaultRoot = path.resolve(option("--vault") ?? path.join(pluginDir, "..", "..", ".."));
const source = path.join(pluginDir, "skill");
const dryRun = args.includes("--dry-run");
const home = os.homedir();

const configDirs = [
	path.join(home, ".codex"),
	process.env.CLAUDE_CONFIG_DIR,
	path.join(home, ".claude-sso"),
	path.join(home, ".claude"),
].filter((d, i, all) => d && all.indexOf(d) === i && fs.existsSync(d));

if (!fs.existsSync(path.join(source, "reference.md"))) {
	console.error("skill/reference.md is missing – run `npm run build` in the plugin folder first.");
	process.exit(1);
}

for (const dir of configDirs) {
	const target = path.join(dir, "skills", "prism");
	console.log(`${dryRun ? "[dry-run] " : ""}${target}`);
	if (dryRun) continue;
	fs.mkdirSync(target, { recursive: true });
	for (const file of fs.readdirSync(source)) {
		let text = fs.readFileSync(path.join(source, file), "utf8");
		text = text.replaceAll("{{VAULT}}", vaultRoot);
		fs.writeFileSync(path.join(target, file), text);
	}
}
if (!configDirs.length) console.error("No ~/.codex or ~/.claude config folder found.");

// The skill renders notes with <vault>/.obsidian/plugins/prism-viz/scripts/prism-render.mjs.
const vaultPlugin = path.join(vaultRoot, ".obsidian", "plugins", "prism-viz");
const renderScript = path.join(vaultPlugin, "scripts", "prism-render.mjs");
const ownScript = path.join(pluginDir, "scripts", "prism-render.mjs");
if (path.resolve(renderScript) !== path.resolve(ownScript)) {
	if (fs.existsSync(vaultPlugin)) {
		console.log(`${dryRun ? "[dry-run] " : ""}${renderScript}`);
		if (!dryRun) {
			fs.mkdirSync(path.dirname(renderScript), { recursive: true });
			fs.copyFileSync(ownScript, renderScript);
		}
	} else if (option("--vault")) {
		console.error(`Prism is not installed in ${vaultRoot} (no .obsidian/plugins/prism-viz) – render script not copied.`);
	}
}
