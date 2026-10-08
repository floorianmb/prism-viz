// Installs the Prism agent skill for Codex and Claude Code:
//   ~/.codex/skills/prism, $CLAUDE_CONFIG_DIR/skills/prism (if set), ~/.claude-sso/skills/prism, ~/.claude/skills/prism
// Only into config folders that already exist. Re-run after updating the plugin.
//   node .obsidian/plugins/prism-viz/scripts/install-skill.mjs [--dry-run]
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const pluginDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const vaultRoot = path.resolve(pluginDir, "..", "..", "..");
const source = path.join(pluginDir, "skill");
const dryRun = process.argv.includes("--dry-run");
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
