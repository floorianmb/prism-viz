// HTML files in the vault: a file view for opening `.html` files and an embed
// handler for `![[file.html]]`, both using the Prism renderer.

import { FileView, MarkdownPostProcessorContext, MarkdownRenderChild, TFile, WorkspaceLeaf } from "obsidian";
import type PrismPlugin from "../main";
import { emptyOptions, inlineOptions, parseOptionString } from "./options";
import { BlockSpec, PrismFrame } from "./frame";

export const HTML_VIEW_TYPE = "prism-html";
export const HTML_EXTENSIONS = ["html", "htm"];

export function specForFile(file: TFile, source: string, extra: { fill?: boolean; alt?: string; embeddedIn?: string }): BlockSpec {
	const options = parseOptionString(inlineOptions(source), emptyOptions());
	// Embed alt text, e.g. ![[chart.html|height=300]].
	if (extra.alt && /[=]|^\s*(raw|eager|notoolbar|chart|d3|mermaid|three)\b/i.test(extra.alt)) parseOptionString(extra.alt, options);
	if (extra.fill) {
		options.fill = true;
		options.height = null;
	}
	return {
		kind: extra.fill ? "file" : "embed",
		source,
		options,
		sourcePath: file.path,
		blockKey: `file:${file.path}`,
		contentStartLine: 1,
		embeddedIn: extra.embeddedIn,
	};
}

/** Full-pane view for .html files. */
export class PrismHtmlView extends FileView {
	private frame: PrismFrame | null = null;
	allowNoFile = false;

	constructor(leaf: WorkspaceLeaf, private plugin: PrismPlugin) {
		super(leaf);
	}

	getViewType() {
		return HTML_VIEW_TYPE;
	}

	getIcon() {
		return "file-code";
	}

	getDisplayText() {
		return this.file?.basename ?? "HTML";
	}

	canAcceptExtension(extension: string) {
		return HTML_EXTENSIONS.includes(extension);
	}

	async onOpen() {
		this.contentEl.addClass("prism-html-view");
		this.registerEvent(
			this.app.vault.on("modify", (f) => {
				if (this.file && f.path === this.file.path) void this.renderFile(this.file);
			})
		);
	}

	async onLoadFile(file: TFile) {
		await this.renderFile(file);
	}

	async onUnloadFile() {
		this.clear();
	}

	private clear() {
		if (this.frame) this.removeChild(this.frame);
		this.frame = null;
		this.contentEl.empty();
	}

	private async renderFile(file: TFile) {
		const source = await this.app.vault.read(file);
		this.clear();
		const el = this.contentEl.createDiv({ cls: "prism-html-container" });
		this.frame = this.addChild(new PrismFrame(this.plugin, el, specForFile(file, source, { fill: true })));
	}
}

interface EmbedContext {
	containerEl: HTMLElement;
	sourcePath?: string;
}

/** Embed component registered through Obsidian's embed registry. */
export class PrismHtmlEmbed extends MarkdownRenderChild {
	private frame: PrismFrame | null = null;

	constructor(private plugin: PrismPlugin, private ctx: EmbedContext, private file: TFile) {
		super(ctx.containerEl);
	}

	onload() {
		this.registerEvent(
			this.plugin.app.vault.on("modify", (f) => {
				if (f.path === this.file.path) void this.loadFile();
			})
		);
	}

	async loadFile() {
		if (!this._loaded()) this.load();
		const source = await this.plugin.app.vault.cachedRead(this.file);
		if (this.frame) this.removeChild(this.frame);
		this.containerEl.empty();
		this.containerEl.addClass("prism-embed");
		const alt = this.containerEl.getAttribute("alt") ?? undefined;
		const spec = specForFile(this.file, source, { alt, embeddedIn: this.ctx.sourcePath });
		this.frame = this.addChild(new PrismFrame(this.plugin, this.containerEl.createDiv(), spec));
	}

	private _loaded(): boolean {
		return (this as unknown as { _loaded?: boolean })._loaded === true;
	}
}

/** Reading-view fallback when the embed registry is not available. */
export function embedPostProcessor(plugin: PrismPlugin) {
	return (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
		const embeds = el.querySelectorAll<HTMLElement>(".internal-embed[src]");
		embeds.forEach((embed) => {
			const src = embed.getAttribute("src") ?? "";
			if (!/\.html?(#.*)?$/i.test(src)) return;
			const file = plugin.app.metadataCache.getFirstLinkpathDest(src.replace(/#.*$/, ""), ctx.sourcePath);
			if (!(file instanceof TFile)) return;
			const child = new PrismHtmlEmbed(plugin, { containerEl: embed, sourcePath: ctx.sourcePath }, file);
			ctx.addChild(child);
			void child.loadFile();
		});
	};
}
