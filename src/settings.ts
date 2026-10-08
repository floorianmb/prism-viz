import { App, PluginSettingTab, Setting } from "obsidian";
import type PrismPlugin from "../main";
import { normalizeAllowlist } from "./document";

export interface PrismSettings {
	/** Height reserved for a block before it has measured itself. */
	defaultHeight: number;
	/** Upper bound for auto-height. */
	maxAutoHeight: number;
	/** Push theme changes into rendered blocks live. */
	themeSync: boolean;
	/** CSP host sources allowed for scripts, styles, images, fonts and fetch. */
	networkAllowlist: string[];
	/** Write a PNG of every successfully rendered block to .prism/snapshots. */
	snapshots: boolean;
	/** Render blocks only when they scroll into view. */
	lazyRender: boolean;
	/** Write errors to .prism/errors.json. */
	errorLog: boolean;
	/** Vault folders whose data files (csv, tsv, json, yaml, txt) blocks may read via prism.data(). */
	dataFolders: string[];
}

export const DEFAULT_SETTINGS: PrismSettings = {
	defaultHeight: 240,
	maxAutoHeight: 6000,
	themeSync: true,
	networkAllowlist: [],
	snapshots: false,
	lazyRender: true,
	errorLog: true,
	dataFolders: [],
};

export class PrismSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: PrismPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const s = this.plugin.settings;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Default height")
			.setDesc("Height in pixels reserved for a block before it reports its size. Blocks size themselves automatically unless they set height=….")
			.addText((t) =>
				t.setValue(String(s.defaultHeight)).onChange(async (v) => {
					const n = parseInt(v, 10);
					if (Number.isFinite(n) && n >= 40 && n <= 4000) {
						s.defaultHeight = n;
						await this.plugin.saveSettings();
					}
				})
			);

		new Setting(containerEl)
			.setName("Maximum auto height")
			.setDesc("Upper limit in pixels for automatically sized blocks.")
			.addText((t) =>
				t.setValue(String(s.maxAutoHeight)).onChange(async (v) => {
					const n = parseInt(v, 10);
					if (Number.isFinite(n) && n >= 200 && n <= 20000) {
						s.maxAutoHeight = n;
						await this.plugin.saveSettings();
					}
				})
			);

		new Setting(containerEl)
			.setName("Theme sync")
			.setDesc("Update rendered blocks live when the theme or light/dark mode changes. When off, blocks use the theme at render time.")
			.addToggle((t) =>
				t.setValue(s.themeSync).onChange(async (v) => {
					s.themeSync = v;
					await this.plugin.saveSettings();
					if (v) this.plugin.refreshTheme();
				})
			);

		new Setting(containerEl)
			.setName("Lazy rendering")
			.setDesc("Render blocks only when they scroll near the viewport. Keeps notes with many blocks fast.")
			.addToggle((t) =>
				t.setValue(s.lazyRender).onChange(async (v) => {
					s.lazyRender = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Error log")
			.setDesc("Write block errors with note path and line numbers to .prism/errors.json so that CLI agents can read and fix them.")
			.addToggle((t) =>
				t.setValue(s.errorLog).onChange(async (v) => {
					s.errorLog = v;
					this.plugin.errorLog.enabled = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Snapshots")
			.setDesc("After a block renders without errors, save a PNG to .prism/snapshots/<hash>.png (index in .prism/snapshots/index.json) so agents can see the result.")
			.addToggle((t) =>
				t.setValue(s.snapshots).onChange(async (v) => {
					s.snapshots = v;
					await this.plugin.saveSettings();
				})
			);

		const dataSetting = new Setting(containerEl).setName("Data folders").setDesc("");
		const dataDesc = dataSetting.descEl;
		dataDesc.appendText("Vault folders (one per line, e.g. ");
		dataDesc.createEl("code", { text: "Projects/data" });
		dataDesc.appendText(") whose files blocks may read with ");
		dataDesc.createEl("code", { text: "prism.data()" });
		dataDesc.appendText(". Read-only; only .csv, .tsv, .json, .geojson, .yaml, .yml and .txt; hidden files and notes are never readable. Empty = off.");
		const dataStatus = dataDesc.createDiv({ cls: "prism-setting-status" });
		const showDataStatus = (folders: string[]) => {
			const vault = this.app.vault;
			const missing = typeof vault.getFolderByPath === "function" ? folders.filter((f) => f !== "/" && !vault.getFolderByPath(f)) : [];
			dataStatus.setText(missing.length ? `Not found: ${missing.join(", ")}` : "");
		};
		showDataStatus(s.dataFolders);
		dataSetting.addTextArea((t) => {
			t.inputEl.rows = 3;
			t.inputEl.addClass("prism-allowlist");
			t.setPlaceholder("Projects/data").setValue(s.dataFolders.join("\n"));
			t.onChange(async (v) => {
				s.dataFolders = Array.from(
					new Set(
						v
							.split("\n")
							.map((l) => l.trim().replace(/^\/+|\/+$/g, "") || (l.trim() === "/" ? "/" : ""))
							.filter(Boolean)
					)
				);
				showDataStatus(s.dataFolders);
				await this.plugin.saveSettings();
			});
		});

		const allowSetting = new Setting(containerEl)
			.setName("Network allowlist")
			.setDesc("");
		const desc = allowSetting.descEl;
		desc.appendText("Network access from blocks is off by default. Domains listed here (one per line, e.g. ");
		desc.createEl("code", { text: "cdn.jsdelivr.net" });
		desc.appendText(" or ");
		desc.createEl("code", { text: "*.example.com" });
		desc.appendText(") are added to the Content-Security-Policy for scripts, styles, images, fonts and fetch. HTTPS is assumed unless http:// is given.");
		const status = desc.createDiv({ cls: "prism-setting-status" });
		const showStatus = (invalid: string[]) => {
			status.setText(invalid.length ? `Ignored (invalid): ${invalid.join(", ")}` : "");
		};
		allowSetting.addTextArea((t) => {
			t.inputEl.rows = 4;
			t.inputEl.addClass("prism-allowlist");
			t.setPlaceholder("cdn.jsdelivr.net").setValue(s.networkAllowlist.join("\n"));
			t.onChange(async (v) => {
				const { valid, invalid } = normalizeAllowlist(v.split(/[\n,]/));
				showStatus(invalid);
				s.networkAllowlist = valid;
				await this.plugin.saveSettings();
			});
		});
		allowSetting.addExtraButton((b) =>
			b
				.setIcon("refresh-cw")
				.setTooltip("Reload all blocks to apply")
				.onClick(() => this.plugin.reloadAll())
		);
	}
}
