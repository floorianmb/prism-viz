// "Prism: agent skill and changelog": how to install the agent skill for this
// vault, followed by CHANGELOG.md. Opens once after Prism is installed or
// updated, and with the commands "Install agent skill" / "Show changelog".

import { FileSystemAdapter, ItemView, MarkdownRenderer, Platform, WorkspaceLeaf } from "obsidian";
import CHANGELOG from "../CHANGELOG.md";

export const GUIDE_VIEW_TYPE = "prism-guide";

export type GuideSection = "skill" | "changelog";

const REPO = "https://github.com/floorianmb/prism-viz.git";

/** Installation steps for the agent skill, with the commands filled in for this vault. */
function skillGuide(vaultPath: string | null): string {
	const vault = vaultPath ?? "<path to your vault>";
	const shell = Platform.isWin
		? [
				"```powershell",
				`$d = Join-Path $env:TEMP "prism-viz-$(Get-Random)"; git clone --depth 1 ${REPO} $d; node "$d\\scripts\\install-skill.mjs" --vault '${vault.replace(/'/g, "''")}'; Remove-Item -Recurse -Force $d`,
				"```",
			]
		: [
				"```bash",
				`d="$(mktemp -d)" && git clone --depth 1 ${REPO} "$d" && node "$d/scripts/install-skill.mjs" --vault '${vault.replace(/'/g, "'\\''")}' && rm -rf "$d"`,
				"```",
			];
	return [
		"# Install the agent skill",
		"",
		"The skill teaches Claude Code and Codex to write viz blocks, render the note from the command line, read the errors and fix them until the result is clean. Install it on the computer your agent runs on, and again after Prism updates.",
		"",
		vaultPath
			? "Needs [Node.js](https://nodejs.org) and git. Run this in a terminal:"
			: "Agents run on a computer: open this page in Obsidian on your desktop to get the command with this vault's path filled in. Needs [Node.js](https://nodejs.org) and git:",
		"",
		...shell,
		"",
		"It copies the skill to `~/.claude/skills/prism` and `~/.codex/skills/prism` (wherever those folders exist) and puts the render script `prism-render.mjs` into this vault's plugin folder.",
		"",
		"**Or let your agent do it.** Paste this into Claude Code or Codex:",
		"",
		"```text",
		`Install the Prism agent skill: clone ${REPO} into a temporary folder, run \`node scripts/install-skill.mjs --vault "${vault}"\` in it and delete the folder afterwards.`,
		"```",
		"",
		"**Other agents** (Cursor, Copilot, …): run the command above for the render script, then *Prism: Generate agent rules*. It writes `PRISM.md` to the vault root and a snippet for your `AGENTS.md` / `CLAUDE.md`.",
		"",
		"Open this page again with the command *Prism: Install agent skill*.",
	].join("\n");
}

export class PrismGuideView extends ItemView {
	private sections: Partial<Record<GuideSection, HTMLElement>> = {};
	private ready: Promise<void> | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType() {
		return GUIDE_VIEW_TYPE;
	}

	getDisplayText() {
		return "Prism: agent skill and changelog";
	}

	getIcon() {
		return "bot";
	}

	async onOpen() {
		this.ready ??= this.draw();
		await this.ready;
	}

	private async draw() {
		const adapter = this.app.vault.adapter;
		const vaultPath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : null;
		const el = this.contentEl;
		el.empty();
		el.addClass("prism-guide");
		const page = el.createDiv({ cls: "prism-guide-page markdown-rendered" });
		this.sections.skill = page.createDiv();
		page.createEl("hr");
		this.sections.changelog = page.createDiv();
		await MarkdownRenderer.render(this.app, skillGuide(vaultPath), this.sections.skill, "", this);
		await MarkdownRenderer.render(this.app, CHANGELOG, this.sections.changelog, "", this);
	}

	/** Scrolls to the start of `section` once the page is rendered. */
	async show(section: GuideSection) {
		this.ready ??= this.draw();
		await this.ready;
		if (section === "skill") this.contentEl.scrollTop = 0;
		else this.sections[section]?.scrollIntoView({ block: "start" });
	}
}
