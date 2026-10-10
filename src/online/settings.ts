// Settings section "Online access": two opt-in switches that let blocks reach
// the internet. Both are off by default; switching one on asks for consent.
// Everything that reaches the network lives in src/online/, so it can be
// reviewed (or removed) in one place.

import { App, Modal, Setting } from "obsidian";
import type PrismPlugin from "../../main";
import { reloadWebBlocks } from "./web";

export interface OnlineSettings {
	/** prism.http(): blocks may send HTTP requests through Obsidian (no CORS). */
	http: boolean;
	/** Hold each block's requests until the reader clicks "Run requests" (once per host, again after every reload). */
	httpConfirm: boolean;
	/** <iframe> in blocks and ```viz web blocks may show web pages. */
	web: boolean;
}

export const DEFAULT_ONLINE: OnlineSettings = { http: false, httpConfirm: true, web: false };

/** Opens Prism's settings tab (internal API; no-op if unavailable). */
export function openPrismSettings(app: App, pluginId: string) {
	const setting = (app as App & { setting?: { open(): void; openTabById(id: string): void } }).setting;
	setting?.open();
	setting?.openTabById(pluginId);
}

interface Feature {
	key: keyof OnlineSettings;
	name: string;
	desc: string;
	/** The value that loosens protection and therefore needs consent. */
	risky: boolean;
	consequences: string[];
}

const FEATURES: Feature[] = [
	{
		key: "http",
		name: "API requests",
		desc: "Blocks may call web APIs with prism.http(url, options) and show the results. Requests are sent by Obsidian itself, so the browser's CORS restrictions do not apply.",
		risky: true,
		consequences: [
			"Every viz block in every note can send requests to any server: the internet, your local network and this computer (localhost, routers, intranet services) – without the CORS protection a browser would apply.",
			"Blocks can send what they can read (note metadata, note tables, files in the data folders) to external servers. Only enable this if you trust every viz block in this vault, including blocks written by AI agents or copied from others.",
			"API keys written into a block are stored in plain text in the note, and travel with sync, backups and git.",
			"Requests may count against API quotas or cost money. Prism limits each block to 60 requests per minute.",
		],
	},
	{
		key: "httpConfirm",
		name: "Ask before sending requests",
		desc: "Requests of a block are held until you click \"Run requests\" below it – once per host the block calls, again after every reload. Command-line renders never send requests while this is on.",
		risky: false,
		consequences: [
			"API requests are sent as soon as a note with such a block is shown, also in Live Preview and in the gallery, without a click.",
			"Command-line renders by AI agents (prism-render.mjs) send the requests too.",
			"A block you have not looked at yet can contact servers in the background.",
		],
	},
	{
		key: "web",
		name: "Web pages",
		desc: "Blocks may embed web pages with <iframe>, and ```viz web blocks show a website inline (on desktop in a full browser view).",
		risky: true,
		consequences: [
			"Pages load as soon as a note with such a block is shown (also in Live Preview). The websites see your IP address and can set cookies and track visits.",
			"Websites run their own scripts. They are isolated from Obsidian and your vault, but can still show misleading or phishing pages – check the address before entering passwords.",
			"Logins inside ```viz web blocks last until Obsidian restarts. They use a separate session that is not shared with your browser.",
			"Many sites refuse to be embedded in an <iframe>. ```viz web blocks on desktop can show them anyway.",
		],
	},
];

export function renderOnlineSettings(containerEl: HTMLElement, plugin: PrismPlugin) {
	new Setting(containerEl).setName("Online access").setHeading();
	const intro = containerEl.createEl("p", { cls: "setting-item-description prism-online-intro" });
	intro.appendText("Blocks are offline by default. These switches let blocks reach the internet. They are independent of the network allowlist above and apply to all notes in this vault.");

	for (const feature of FEATURES) {
		new Setting(containerEl)
			.setName(feature.name)
			.setDesc(feature.desc)
			.addToggle((t) =>
				t.setValue(plugin.settings.online[feature.key]).onChange(async (on) => {
					if (on === feature.risky && !(await confirmOnline(plugin.app, feature))) {
						t.setValue(!on);
						return;
					}
					plugin.settings.online[feature.key] = on;
					await plugin.saveSettings();
					plugin.reloadAll();
					if (feature.key === "web") reloadWebBlocks();
				})
			);
	}
}

/** Explains the consequences of a feature; resolves true only on explicit consent. */
function confirmOnline(app: App, feature: Feature): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = new Modal(app);
		let accepted = false;
		const verb = feature.risky ? "Enable" : "Turn off";
		modal.titleEl.setText(`${verb} "${feature.name}"?`);
		const content = modal.contentEl.createDiv({ cls: "prism-online-consent" });
		content.createEl("p", { text: `Please read what this means before you ${feature.risky ? "switch it on" : "switch it off"}:` });
		const list = content.createEl("ul");
		for (const line of feature.consequences) list.createEl("li", { text: line });
		content.createEl("p", { cls: "mod-warning", text: "You can undo this at any time; it applies to all blocks immediately." });
		new Setting(modal.contentEl)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => modal.close()))
			.addButton((b) =>
				b
					.setButtonText(verb)
					.setWarning()
					.onClick(() => {
						accepted = true;
						modal.close();
					})
			);
		modal.onClose = () => resolve(accepted);
		modal.open();
	});
}
