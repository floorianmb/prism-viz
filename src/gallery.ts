// "Prism gallery": every viz block of the vault as a card with its latest
// snapshot and render status. Clicking a card opens the note at the block.

import { ItemView, Notice, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type PrismPlugin from "../main";
import type { BlockSpec } from "./frame";

export const GALLERY_VIEW_TYPE = "prism-gallery";

type Filter = "all" | "problems";

export class PrismGalleryView extends ItemView {
	private filter: Filter = "all";
	private busy = false;

	constructor(leaf: WorkspaceLeaf, private plugin: PrismPlugin) {
		super(leaf);
	}

	getViewType() {
		return GALLERY_VIEW_TYPE;
	}

	getDisplayText() {
		return "Prism gallery";
	}

	getIcon() {
		return "layout-grid";
	}

	async onOpen() {
		this.contentEl.addClass("prism-gallery");
		await this.draw();
	}

	async draw() {
		const blocks = await this.plugin.vizBlocks();
		const snapshots = await this.plugin.snapshotIndex();
		const el = this.contentEl;
		el.empty();

		const status = (spec: BlockSpec) => this.plugin.errorLog.statusOf(spec.blockKey)?.status;
		const problems = blocks.filter((b) => status(b) === "error" || status(b) === "warning");
		const unrendered = blocks.filter((b) => !snapshots[b.blockKey]);

		const head = el.createDiv({ cls: "prism-gallery-head" });
		const titles = head.createDiv();
		titles.createEl("h2", { text: "Prism gallery" });
		const parts = [`${blocks.length} visualizations`];
		if (problems.length) parts.push(`${problems.length} with problems`);
		if (unrendered.length) parts.push(`${unrendered.length} without preview`);
		titles.createDiv({ cls: "prism-gallery-sub", text: parts.join(" · ") });

		const actions = head.createDiv({ cls: "prism-gallery-actions" });
		const seg = actions.createDiv({ cls: "prism-gallery-filter" });
		for (const [value, label] of [
			["all", "All"],
			["problems", "Problems"],
		] as [Filter, string][]) {
			const b = seg.createEl("button", { text: label, attr: { "aria-pressed": String(this.filter === value) } });
			b.addEventListener("click", () => {
				this.filter = value;
				void this.draw();
			});
		}
		const render = actions.createEl("button", { cls: "mod-cta", text: this.busy ? "Rendering…" : "Render previews" });
		render.disabled = this.busy;
		render.addEventListener("click", () => void this.renderPreviews(blocks));
		const refresh = actions.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "Refresh" } });
		setIcon(refresh, "refresh-cw");
		refresh.addEventListener("click", () => void this.draw());

		const shown = this.filter === "problems" ? problems : blocks;
		if (!shown.length) {
			el.createDiv({
				cls: "prism-gallery-empty",
				text: this.filter === "problems" ? "No problems in the last renders." : "No viz blocks in this vault yet.",
			});
			return;
		}

		const grid = el.createDiv({ cls: "prism-gallery-grid" });
		for (const spec of shown) {
			const card = grid.createDiv({ cls: "prism-gallery-card", attr: { tabindex: "0", role: "link" } });
			const thumb = card.createDiv({ cls: "prism-gallery-thumb" });
			const snap = snapshots[spec.blockKey];
			if (snap) {
				const img = thumb.createEl("img", { attr: { alt: spec.options.title || spec.sourcePath, loading: "lazy" } });
				const url = this.app.vault.adapter.getResourcePath(snap.file);
				// The file name stays the same when a block is re-rendered; bust the image cache.
				img.src = snap.time ? `${url}${url.includes("?") ? "&" : "?"}t=${encodeURIComponent(snap.time)}` : url;
			} else {
				setIcon(thumb.createDiv({ cls: "prism-gallery-placeholder" }), "image-off");
			}
			const s = status(spec);
			if (s && s !== "ok") card.createDiv({ cls: `prism-gallery-status is-${s}`, text: s });
			const meta = card.createDiv({ cls: "prism-gallery-meta" });
			const note = spec.sourcePath.split("/").pop()?.replace(/\.md$/i, "") ?? spec.sourcePath;
			meta.createDiv({ cls: "prism-gallery-title", text: spec.options.title || `${note} · viz ${(spec.blockIndex ?? 0) + 1}` });
			meta.createDiv({ cls: "prism-gallery-path", text: spec.sourcePath });
			const open = () => void this.openBlock(spec);
			card.addEventListener("click", open);
			card.addEventListener("keydown", (e) => e.key === "Enter" && open());
		}
	}

	private async openBlock(spec: BlockSpec) {
		const file = this.app.vault.getAbstractFileByPath(spec.sourcePath);
		if (!(file instanceof TFile)) return;
		const line = Math.max(0, (spec.lines?.start ?? 1) - 1);
		await this.app.workspace.getLeaf(false).openFile(file, { eState: { line } });
	}

	/** Renders every note with viz blocks headlessly, which writes fresh snapshots. */
	private async renderPreviews(blocks: BlockSpec[]) {
		if (this.busy) return;
		this.busy = true;
		const notes = Array.from(new Set(blocks.map((b) => b.sourcePath)));
		const notice = new Notice(`Prism: rendering ${notes.length} notes…`, 0);
		try {
			for (const [i, path] of notes.entries()) {
				notice.setMessage(`Prism: rendering ${i + 1}/${notes.length} – ${path}`);
				await this.plugin.renderHeadless(path, { id: `gallery-${i}`, width: 720, timeout: 60, snapshot: true });
			}
		} finally {
			notice.hide();
			this.busy = false;
			await this.draw();
		}
	}
}
