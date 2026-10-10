import {
	App,
	Component,
	Editor,
	FuzzySuggestModal,
	HoverPopover,
	MarkdownFileInfo,
	MarkdownPostProcessorContext,
	MarkdownView,
	Modal,
	Notice,
	ObsidianProtocolData,
	Platform,
	Plugin,
	Setting,
	TFile,
	editorInfoField,
	getAllTags,
	getLanguage,
	parseYaml,
} from "obsidian";
import { EditorView } from "@codemirror/view";
import PRELUDE from "runtime:prelude";
import { RULES_MARKER, agentRules } from "./src/agentRules";
import { buildDocument, chartSpecHtml, isChartSpec, isFullDocument, isPlainMath, isPlainMermaid, isTableSpec, plainMathHtml, tableSpecHtml } from "./src/document";
import { ErrorLog, PRISM_DIR } from "./src/errorLog";
import { BlockSpec, FrameResult, PrismFrame, sharedKey } from "./src/frame";
import { DATA_EXTENSIONS, MAX_DATA_BYTES, checkDataAccess, extensionOf, isInFolder, resolveDataPath } from "./src/data";
import { HTML_EXTENSIONS, HTML_VIEW_TYPE, PrismHtmlEmbed, PrismHtmlView, embedPostProcessor, specForFile } from "./src/htmlFile";
import { LIBRARIES, LibraryCache, SCREENSHOT_LIB } from "./src/libs";
import { VizOptions, emptyOptions, fenceOptions, inlineOptions, parseOptionString, vizBlockIndex } from "./src/options";
import type { DataFileInfo, DataFilePayload, DisplayMode, FrameConfig, NoteEdit, NoteInfo, NoteMeta, NotesQuery, ThemeSnapshot } from "./src/protocol";
import { applyLineEdit, lineEditFor, scanTables } from "./src/noteEdit";
import { EditorErrors } from "./src/editorErrors";
import { BAKED_ALT, bakedLine, bakedTarget, placeBaked, relativeLink, resolveLink } from "./src/bake";
import { noteHeadings, noteTables, noteTasks, parseTable } from "./src/noteInfo";
import { registerBasesView } from "./src/basesView";
import { GALLERY_VIEW_TYPE, PrismGalleryView } from "./src/gallery";
import { GUIDE_VIEW_TYPE, GuideSection, PrismGuideView } from "./src/guide";
import { DEFAULT_SETTINGS, PrismSettingTab, PrismSettings } from "./src/settings";
import { DEFAULT_ONLINE } from "./src/online/settings";
import { PrismWebBlock, webPlaceholderHtml } from "./src/online/web";
import { PerfMonitor } from "./src/perf/monitor";
import { CrashGuard, HeightCache, StateStore } from "./src/stores";
import { STARTERS, Starter } from "./src/templates";
import { collectTheme } from "./src/theme";
import { dataUrlToArrayBuffer, debounce, escapeHtml, hash, sanitizeFileName } from "./src/util";

interface PluginData {
	settings?: Partial<PrismSettings>;
	state?: Record<string, Record<string, unknown>>;
	/** Viz blocks of notes whose blocks without id= have state (see StateStore.realign). */
	blockPrints?: Record<string, string[]>;
	/** Blocks the reader allowed to edit their note (prism.edit): "<note path>#<source hash>". */
	editApprovals?: string[];
	/** Plugin version the guide and changelog were last opened for automatically. */
	guideVersion?: string;
}

/** CodeMirror user event of changes made by prism.edit. */
const PRISM_EDIT_EVENT = "input.prism";
const SNAPSHOT_DIR = `${PRISM_DIR}/snapshots`;
const SNAPSHOT_INDEX = `${SNAPSHOT_DIR}/index.json`;
const RENDER_DIR = `${PRISM_DIR}/renders`;
const MAX_RENDER_FILES = 30;
const PRINT_TIMEOUT = 12000;

interface RenderResult {
	$comment: string;
	id: string;
	notePath: string;
	status: "running" | "ok" | "warning" | "error" | "failed";
	message?: string;
	startedAt: string;
	finishedAt?: string;
	theme: "dark" | "light";
	width: number;
	blocks: FrameResult[];
}

/**
 * While Obsidian is in the background, Chromium stops rendering its window:
 * new block frames never get their size (they lay out at 0×0, so snapshots
 * come out empty) and animation frames do not run. Headless renders switch
 * that throttling off for their duration. Uses Electron's remote module when
 * Obsidian provides it; elsewhere a no-op.
 */
function keepRendering(): () => void {
	type WebContents = { setBackgroundThrottling(on: boolean): void; getBackgroundThrottling?: () => boolean; invalidate?: () => void };
	if (!Platform.isDesktopApp) return () => undefined;
	try {
		const electron = (window as Window & { require?: (id: string) => { remote?: { getCurrentWebContents(): WebContents } } }).require?.("electron");
		const contents = electron?.remote?.getCurrentWebContents();
		if (!contents) return () => undefined;
		const before = contents.getBackgroundThrottling?.() ?? true;
		contents.setBackgroundThrottling(false);
		contents.invalidate?.();
		return () => {
			try {
				contents.setBackgroundThrottling(before);
			} catch {
				/* window gone */
			}
		};
	} catch (err) {
		console.warn("Prism: could not keep rendering in the background", err);
		return () => undefined;
	}
}

export default class PrismPlugin extends Plugin {
	settings: PrismSettings = { ...DEFAULT_SETTINGS };
	readonly frames = new Set<PrismFrame>();
	errorLog!: ErrorLog;
	state!: StateStore;
	heights!: HeightCache;
	crashGuard!: CrashGuard;
	libs!: LibraryCache;
	perf!: PerfMonitor;
	editorErrors!: EditorErrors;
	themeVersion = 0;
	private theme: ThemeSnapshot | null = null;
	private stateData: Record<string, Record<string, unknown>> = {};
	private blockPrints: Record<string, string[]> = {};
	private editApprovals = new Set<string>();
	private guideVersion: string | undefined;
	private saveSoon = debounce(() => void this.persist(), 1000);
	private snapshotQueue: Promise<unknown> = Promise.resolve();
	private themeQueued = false;
	private renderQueue: Promise<unknown> = Promise.resolve();

	async onload() {
		const data = ((await this.loadData()) ?? {}) as PluginData;
		this.settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
		this.settings.online = { ...DEFAULT_ONLINE, ...(data.settings?.online ?? {}) };
		this.stateData = data.state && typeof data.state === "object" ? data.state : {};
		this.blockPrints = data.blockPrints && typeof data.blockPrints === "object" ? data.blockPrints : {};
		this.editApprovals = new Set(Array.isArray(data.editApprovals) ? data.editApprovals.filter((k) => typeof k === "string") : []);
		this.guideVersion = data.guideVersion;
		this.state = new StateStore(this.stateData, this.blockPrints, () => this.saveSoon(), (path) => void this.realignState(path));
		this.heights = new HeightCache(this.app);
		this.crashGuard = new CrashGuard(this.app);
		this.libs = new LibraryCache();
		this.perf = new PerfMonitor(this);
		this.register(() => this.perf.dispose());
		this.errorLog = new ErrorLog(this.app.vault.adapter);
		this.errorLog.enabled = this.settings.errorLog;
		await this.errorLog.load();

		this.editorErrors = new EditorErrors(this.app, () => this.settings.editorErrors);
		this.register(() => this.editorErrors.dispose());
		this.registerEditorExtension(this.editorErrors.extension());
		// Blocks follow edits of their note as they are typed, not only after Obsidian saved and indexed it.
		const typedNotes = new Set<string>();
		const notifyTyped = debounce(() => {
			const paths = new Set(typedNotes);
			typedNotes.clear();
			this.frames.forEach((f) => {
				const note = f.notePath;
				if (note && paths.has(note)) f.notifyNoteChanged();
			});
		}, 250);
		this.register(() => notifyTyped.cancel());
		this.registerEditorExtension(
			EditorView.updateListener.of((update) => {
				if (!update.docChanged) return;
				// Edits by prism.edit notify the blocks themselves, without the delay.
				if (update.transactions.every((tr) => !tr.docChanged || tr.isUserEvent(PRISM_EDIT_EVENT))) return;
				const path = update.state.field(editorInfoField, false)?.file?.path;
				if (!path) return;
				typedNotes.add(path);
				notifyTyped();
			})
		);
		this.registerMarkdownCodeBlockProcessor("viz", (source, el, ctx) => this.processBlock(source, el, ctx));
		// Baked images (src/bake.ts) are hidden by styles.css; hide their paragraph too, so it leaves no gap.
		this.registerMarkdownPostProcessor((el) => {
			el.querySelectorAll(`img[alt^="${BAKED_ALT}"], .internal-embed[alt^="${BAKED_ALT}"]`).forEach((img) => {
				const p = img.closest("p");
				if (p && p.textContent?.trim() === "" && p.querySelectorAll("img, .internal-embed").length <= 2) p.addClass("prism-baked");
			});
		});
		// Note links inside blocks show Obsidian's page preview on hover.
		this.registerHoverLinkSource("prism", { display: "Prism", defaultMod: false });
		this.patchHoverDetection();
		this.registerHtmlFiles();
		registerBasesView(this);
		this.registerView(GALLERY_VIEW_TYPE, (leaf) => new PrismGalleryView(leaf, this));
		this.registerView(GUIDE_VIEW_TYPE, (leaf) => new PrismGuideView(leaf));
		this.addRibbonIcon("layout-grid", "Prism gallery", () => void this.openGallery());
		this.registerCommands();
		this.addSettingTab(new PrismSettingTab(this.app, this));

		this.registerEvent(this.app.workspace.on("css-change", () => this.refreshTheme()));
		const notesChanged = debounce(() => this.frames.forEach((f) => f.notifyNotesChanged()), 800);
		const changedNotes = new Set<string>();
		const noteChanged = debounce(() => {
			const paths = new Set(changedNotes);
			changedNotes.clear();
			this.frames.forEach((f) => {
				const note = f.notePath;
				if (note && paths.has(note)) f.notifyNoteChanged();
			});
		}, 300);
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				changedNotes.add(file.path);
				noteChanged();
				notesChanged();
			})
		);
		this.register(() => noteChanged.cancel());
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				this.state.removeFile(file.path);
				this.errorLog.removeFile(file.path);
				this.forgetEdits(file.path, null);
				this.editorErrors.forget(file.path);
				notesChanged();
			})
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				this.state.rename(oldPath, file.path);
				this.errorLog.rename(oldPath, file.path);
				this.forgetEdits(oldPath, file.path);
				this.editorErrors.forget(oldPath);
				notesChanged();
			})
		);
		this.register(() => notesChanged.cancel());
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && DATA_EXTENSIONS.includes(file.extension.toLowerCase())) {
					this.frames.forEach((f) => f.notifyDataChanged(file.path));
				}
				if (file instanceof TFile && this.state.tracks(file.path)) void this.realignState(file.path);
			})
		);
		this.registerObsidianProtocolHandler("prism", (params) => this.handleUri(params));
		this.app.workspace.onLayoutReady(() => {
			this.errorLog.prune((path) => !!this.app.vault.getAbstractFileByPath(path));
			for (const path of this.state.untracked()) void this.realignState(path);
			void this.showGuideAfterUpdate();
		});
	}

	/** Opens the skill guide and changelog once after Prism is installed or updated. */
	private async showGuideAfterUpdate() {
		if (this.guideVersion === this.manifest.version) return;
		this.guideVersion = this.manifest.version;
		await this.persist();
		if (this.settings.showGuideAfterUpdate) await this.openGuide("skill");
	}

	/**
	 * Obsidian's page preview re-checks every 500 ms which element is under the
	 * last mouse position it saw in the main window and closes when that is
	 * neither the link nor the preview. While the pointer is inside a block's
	 * frame that element is the iframe, so previews of links in blocks closed
	 * (or never opened) although the pointer was on the link. For Prism's
	 * stand-in targets, the frame's own report counts instead. Internal API:
	 * without `detect`, nothing is patched.
	 */
	private patchHoverDetection() {
		type Detecting = { detect?: (el: Element | null) => void; targetEl?: HTMLElement | null; onTarget?: boolean };
		const proto = HoverPopover.prototype as unknown as Detecting;
		const original = proto.detect;
		if (typeof original !== "function") return;
		proto.detect = function (this: Detecting, el: Element | null) {
			original.call(this, el);
			const target = this.targetEl;
			if (target?.classList.contains("prism-hover-target")) this.onTarget = target.dataset.prismPointer === "on";
		};
		this.register(() => {
			proto.detect = original;
		});
	}

	onunload() {
		for (const frame of Array.from(this.frames)) {
			frame.unload();
			frame.containerEl.empty();
		}
		this.frames.clear();
		this.saveSoon.flush();
		this.heights.flush();
		void this.errorLog.flush();
		this.errorLog.dispose();
	}

	private async persist() {
		await this.saveData({
			settings: this.settings,
			state: this.stateData,
			blockPrints: this.blockPrints,
			editApprovals: Array.from(this.editApprovals),
			guideVersion: this.guideVersion,
		} satisfies PluginData);
	}

	async saveSettings() {
		await this.persist();
	}

	/* ---------------------------------------------------------- code blocks */

	private async processBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		// PDF export renders the note into a ".print" container and waits for
		// ctx.promises; register before the first await so the export waits for
		// the static image of this block.
		const print = !!el.closest(".print");
		let printed: (done: Promise<unknown>) => void = () => undefined;
		if (print) {
			const promises = (ctx as MarkdownPostProcessorContext & { promises?: Promise<unknown>[] }).promises;
			promises?.push(new Promise((resolve) => (printed = (done) => void done.then(resolve, resolve))));
		}
		let section = ctx.getSectionInfo(el);
		if (!section) section = await this.findSection(ctx.sourcePath, source);
		const spec = this.specFromSection(source, ctx.sourcePath, section);
		if (spec.options.web && !print) {
			// Web pages are rendered by src/online/web.ts, not in a sandboxed block frame.
			ctx.addChild(new PrismWebBlock(this, el, spec));
			return;
		}
		const frame = new PrismFrame(this, el, spec, print ? { print: true } : {});
		ctx.addChild(frame);
		printed(frame.whenPrinted(PRINT_TIMEOUT));
	}

	/** Block spec from the block source and its position in the note text. */
	specFromSection(source: string, notePath: string, section: { text: string; lineStart: number; lineEnd: number } | null): BlockSpec {
		const options = parseOptionString(inlineOptions(source), emptyOptions());
		let blockIndex: number | undefined;
		let lines: BlockSpec["lines"];
		let contentStartLine = 1;
		if (section) {
			const fenceLine = section.text.split("\n", section.lineStart + 1)[section.lineStart] ?? "";
			const fence = fenceOptions(fenceLine);
			if (fence) parseOptionString(fence, options);
			blockIndex = vizBlockIndex(section.text, section.lineStart);
			lines = { start: section.lineStart + 1, end: section.lineEnd + 1 };
			contentStartLine = section.lineStart + 2;
		} else {
			options.warnings.push("Prism could not locate this block in the note; options on the ```viz line were ignored. Use <!-- prism: … --> inside the block instead.");
		}
		const blockKey = options.id
			? `${notePath}#${options.id}`
			: blockIndex !== undefined
			? `${notePath}#${blockIndex}`
			: `${notePath}#h${hash(source).slice(0, 10)}`;
		return { kind: "codeblock", source, options, sourcePath: notePath, blockKey, blockIndex, lines, contentStartLine };
	}

	/** Fallback when getSectionInfo is unavailable: find the block in the editor or file text. */
	private async findSection(path: string, source: string): Promise<{ text: string; lineStart: number; lineEnd: number } | null> {
		let text: string | null = null;
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (text === null && leaf.view instanceof MarkdownView && leaf.view.file?.path === path) text = leaf.view.editor.getValue();
		});
		if (text === null) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) text = await this.app.vault.cachedRead(file);
		}
		if (text === null) return null;
		const content: string = text;
		const lines = content.split("\n");
		const body = source.split("\n");
		for (let i = 0; i < lines.length; i++) {
			if (fenceOptions(lines[i]) === null) continue;
			const end = i + body.length + 1;
			if (lines.slice(i + 1, end).join("\n") === source && /^\s*(`{3,}|~{3,})\s*$/.test(lines[end] ?? "")) {
				return { text: content, lineStart: i, lineEnd: end };
			}
		}
		return null;
	}

	/** Builds the srcdoc for a block. */
	async buildFrameDocument(
		spec: BlockSpec,
		token: string,
		autoHeight: boolean,
		theme: ThemeSnapshot = this.getTheme(),
		flags: { displayMode?: DisplayMode; headless?: boolean } = {}
	) {
		const libs: [string, string][] = [];
		for (const name of spec.options.libs) libs.push([name, await this.libs.load(LIBRARIES[name].file)]);
		const config: FrameConfig = {
			token,
			blockId: spec.blockKey,
			sourcePath: spec.sourcePath,
			theme,
			state: this.state.get(spec.blockKey),
			shared: this.state.get(sharedKey(spec)),
			locale: uiLocale(),
			autoHeight,
			libs: spec.options.libs.slice(),
			displayMode: flags.displayMode ?? "inline",
			headless: flags.headless,
			online: { http: this.settings.online.http, confirm: this.settings.online.http && this.settings.online.httpConfirm, web: this.settings.online.web },
		};
		const chartSpec = isChartSpec(spec.source, spec.options) ? parseSpec(spec.source, "chart") : undefined;
		const tableSpec = isTableSpec(spec.source, spec.options) ? parseSpec(spec.source, "table") : undefined;
		const monitorSpec = spec.options.monitor ? (spec.source.trim() ? parseSpec(spec.source, "monitor") : {}) : undefined;
		// ```viz web outside a live note (command-line render, PDF, gallery): a static stand-in.
		const source = spec.options.web ? webPlaceholderHtml(spec.source) : spec.source;
		const frames = this.settings.online.web;
		return buildDocument({ source, options: spec.options, config, allowlist: this.settings.networkAllowlist, frames, prelude: PRELUDE, libs, screenshotLib: await this.libs.load(SCREENSHOT_LIB), chartSpec, tableSpec, monitorSpec });
	}

	/* ---------------------------------------------------------------- theme */

	/** Theme of the main window (cached), or of another window such as the PDF export window. */
	getTheme(doc?: Document): ThemeSnapshot {
		if (doc && doc !== document) return collectTheme(doc);
		if (!this.theme) this.theme = collectTheme(document);
		return this.theme;
	}

	/** Re-reads the theme and pushes it into rendered blocks (once per frame). */
	refreshTheme() {
		this.theme = null;
		this.themeVersion++;
		if (!this.settings.themeSync || this.themeQueued) return;
		this.themeQueued = true;
		window.requestAnimationFrame(() => {
			this.themeQueued = false;
			this.frames.forEach((f) => f.pushTheme());
		});
	}

	/** Adds a data folder (after the user clicked "Allow") and re-renders blocks that read data. */
	async allowDataFolder(folder: string) {
		if (!this.settings.dataFolders.includes(folder)) this.settings.dataFolders.push(folder);
		await this.saveSettings();
		this.frames.forEach((f) => f.reload());
	}

	reloadAll() {
		this.theme = null;
		this.themeVersion++;
		this.frames.forEach((f) => f.reload());
	}

	/** Pushes the note's shared state to every other block of the same note. */
	broadcastShared(source: PrismFrame, key: string) {
		const id = sharedKey(source.spec);
		const shared = this.state.get(id);
		this.frames.forEach((f) => {
			if (f !== source && sharedKey(f.spec) === id) f.sendShared(shared, key);
		});
	}

	/**
	 * Blocks without id= keep their prism.state by position. When blocks of the
	 * note are inserted, removed or edited, the state moves along with them, and
	 * open blocks of the note switch to their new key.
	 */
	private async realignState(path: string) {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile) || file.extension !== "md") return;
		const specs = this.collectVizBlocks(await this.app.vault.cachedRead(file), path);
		const blocks = specs.map((spec) => ({ print: spec.options.id ? `id:${spec.options.id}` : hash(spec.source), key: spec.blockKey }));
		if (!this.state.realign(path, blocks)) return;
		this.frames.forEach((f) => {
			if (f.spec.kind !== "codeblock" || f.spec.sourcePath !== path || f.spec.options.id) return;
			const print = hash(f.spec.source);
			const at = blocks.map((b, i) => (b.print === print ? i : -1)).filter((i) => i >= 0);
			if (at.length !== 1 || blocks[at[0]].key === f.spec.blockKey) return;
			f.spec = { ...f.spec, blockKey: blocks[at[0]].key, blockIndex: at[0] };
			f.sendState(this.state.get(f.spec.blockKey));
		});
	}

	broadcastState(source: PrismFrame) {
		const state = this.state.get(source.spec.blockKey);
		this.frames.forEach((f) => {
			if (f !== source && f.spec.blockKey === source.spec.blockKey) f.sendState(state);
		});
	}

	/* ---------------------------------------------------------------- notes */

	/** Read-only note metadata for prism.notes(). Never returns note contents. */
	async queryNotes(query: NotesQuery): Promise<NoteMeta[]> {
		const folder = typeof query.folder === "string" ? query.folder.trim().replace(/^\/+|\/+$/g, "") : "";
		const tag = typeof query.tag === "string" && query.tag.trim() ? query.tag.trim().replace(/^#/, "").toLowerCase() : null;
		const limit = Math.max(1, Math.min(5000, Math.floor(Number(query.limit) || 1000)));
		const out: NoteMeta[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (folder && !file.path.startsWith(folder + "/")) continue;
			const meta = this.noteMeta(file);
			if (tag && !meta.tags.some((t) => t.toLowerCase() === tag || t.toLowerCase().startsWith(tag + "/"))) continue;
			out.push(meta);
		}
		const order = query.order === "asc" ? 1 : -1;
		const sort = query.sort === "path" || query.sort === "title" ? query.sort : "mtime";
		out.sort((a, b) => {
			if (sort === "mtime") return (a.mtime - b.mtime) * order;
			return a[sort].localeCompare(b[sort]) * order;
		});
		const result = out.slice(0, limit);
		const include = new Set(Array.isArray(query.include) ? query.include : []);
		if (include.size) await this.addNoteExtras(result, include);
		return result;
	}

	/** Fills the optional NoteMeta fields requested with `include`. */
	private async addNoteExtras(notes: NoteMeta[], include: Set<string>) {
		const cache = this.app.metadataCache;
		let backlinks: Map<string, string[]> | null = null;
		if (include.has("backlinks")) {
			const wanted = new Set(notes.map((n) => n.path));
			backlinks = new Map();
			for (const [source, targets] of Object.entries(cache.resolvedLinks)) {
				for (const target of Object.keys(targets)) {
					if (target === source || !wanted.has(target)) continue;
					const list = backlinks.get(target) ?? [];
					list.push(source);
					backlinks.set(target, list);
				}
			}
		}
		for (const note of notes) {
			const file = this.app.vault.getAbstractFileByPath(note.path);
			if (!(file instanceof TFile)) continue;
			const meta = cache.getFileCache(file);
			if (include.has("links")) note.links = this.linksOf(file.path);
			if (backlinks) note.backlinks = (backlinks.get(note.path) ?? []).sort();
			if (include.has("headings")) note.headings = noteHeadings(meta);
			if (include.has("tasks")) {
				const hasTasks = (meta?.listItems ?? []).some((i) => i.task !== undefined);
				note.tasks = hasTasks ? noteTasks(await this.app.vault.cachedRead(file), meta) : [];
			}
		}
	}

	private linksOf(path: string): string[] {
		const links = new Set<string>(Object.keys(this.app.metadataCache.resolvedLinks[path] ?? {}));
		for (const target of Object.keys(this.app.metadataCache.unresolvedLinks[path] ?? {})) links.add(target);
		return Array.from(links).sort();
	}

	private noteMeta(file: TFile): NoteMeta {
		const cache = this.app.metadataCache.getFileCache(file);
		const tags = cache ? Array.from(new Set((getAllTags(cache) ?? []).map((t) => t.replace(/^#/, "")))) : [];
		let frontmatter: Record<string, unknown> = {};
		if (cache?.frontmatter) {
			try {
				frontmatter = JSON.parse(JSON.stringify(cache.frontmatter)) as Record<string, unknown>;
			} catch {
				frontmatter = {};
			}
			delete frontmatter.position;
		}
		const title = typeof frontmatter.title === "string" && frontmatter.title.trim() ? frontmatter.title : file.basename;
		const parent = file.parent?.path ?? "";
		return { path: file.path, name: file.basename, folder: parent === "/" ? "" : parent, title, tags, frontmatter, mtime: file.stat.mtime };
	}

	/** The block's own note for prism.note(): metadata, headings, links and tables. Read-only. */
	async noteInfo(path: string | null): Promise<NoteInfo> {
		if (!path) throw new Error("prism.note: this block is not part of a note (opened as an .html file)");
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile) || file.extension !== "md") throw new Error(`prism.note: ${path} is not a note`);
		const cache = this.app.metadataCache.getFileCache(file);
		const saved = await this.app.vault.cachedRead(file);
		// Unsaved editor changes (e.g. a task checked off a moment ago) are newer than the
		// metadata cache: read tasks and tables from the editor text itself.
		const live = this.editorText(file);
		const fresh = live !== null && live !== saved;
		const text = fresh ? live : saved;
		const resolved = this.app.metadataCache.resolvedLinks;
		const backlinks: string[] = [];
		for (const [source, targets] of Object.entries(resolved)) {
			if (source !== file.path && targets[file.path]) backlinks.push(source);
		}
		return {
			...this.noteMeta(file),
			headings: noteHeadings(cache),
			links: this.linksOf(file.path),
			backlinks: backlinks.sort(),
			tasks: noteTasks(text, fresh ? null : cache),
			tables: fresh ? scanTables(text) : noteTables(text, cache),
		};
	}

	/* ------------------------------------------------------------ note edits */

	private editKey(frame: PrismFrame): string {
		return `${frame.spec.sourcePath}#${frame.sourceHash}`;
	}

	/** The reader allowed this block (with its current code) to edit its note. */
	editAllowed(frame: PrismFrame): boolean {
		return this.editApprovals.has(this.editKey(frame));
	}

	allowEdits(frame: PrismFrame) {
		this.editApprovals.add(this.editKey(frame));
		this.saveSoon();
	}

	/** Drops (or moves, on rename) the edit approvals of a note. */
	private forgetEdits(path: string, renamed: string | null) {
		let changed = false;
		for (const key of Array.from(this.editApprovals)) {
			if (!key.startsWith(path + "#")) continue;
			this.editApprovals.delete(key);
			if (renamed) this.editApprovals.add(renamed + key.slice(path.length));
			changed = true;
		}
		if (changed) this.saveSoon();
	}

	/**
	 * prism.edit: applies one edit of a block to its own note. Task, cell and
	 * row edits go through the editor when the note is open there, so Undo
	 * reverts them; properties go through Obsidian's frontmatter API.
	 */
	async editNote(path: string, op: NoteEdit): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile) || file.extension !== "md") throw new Error(`prism.edit: ${path} is not a note`);
		if (op.kind === "property") {
			await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
				if (op.value === null) delete fm[op.key];
				else fm[op.key] = op.value;
			});
			return;
		}
		const editor = this.sourceEditor(file);
		// Obsidian's Editor wraps a CodeMirror 6 EditorView (not part of the typed API).
		const cm = editor ? (editor as unknown as { cm?: EditorView }).cm : undefined;
		if (cm) {
			const edit = lineEditFor(cm.state.doc.toString(), op);
			const line = cm.state.doc.line(edit.line + 1);
			// Dispatched directly: Editor.replaceRange scrolls the cursor into view, which made
			// the note jump to wherever the cursor was. The change stays in the undo history.
			cm.dispatch({
				changes: edit.insert ? { from: line.to, insert: "\n" + edit.text } : { from: line.from, to: line.to, insert: edit.text },
				userEvent: PRISM_EDIT_EVENT,
			});
			// The blocks of the note hear about it at once (typing is debounced, see onload).
			this.notifyNote(path);
			return;
		}
		if (editor) {
			const edit = lineEditFor(editor.getValue(), op);
			const end = (line: number) => ({ line, ch: editor.getLine(line).length });
			if (edit.insert) editor.replaceRange("\n" + edit.text, end(edit.line));
			else editor.replaceRange(edit.text, { line: edit.line, ch: 0 }, end(edit.line));
			return;
		}
		await this.app.vault.process(file, (text) => applyLineEdit(text, lineEditFor(text, op)));
	}

	/** Tells the blocks of a note that it changed. */
	private notifyNote(path: string) {
		this.frames.forEach((f) => {
			if (f.notePath === path) f.notifyNoteChanged();
		});
	}

	/** Current text of the note in an open editor (may include unsaved changes), or null. */
	private editorText(file: TFile): string | null {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file?.path === file.path) return view.editor.getValue();
		}
		return null;
	}

	/** Editor of a tab that shows the note in Live Preview or source mode. */
	private sourceEditor(file: TFile): Editor | null {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file?.path === file.path && view.getMode() === "source") return view.editor;
		}
		return null;
	}

	/* ----------------------------------------------------------- data files */

	/** Raw content of an allowlisted data file for prism.data(). */
	async readDataFile(raw: string, sourcePath: string): Promise<DataFilePayload> {
		const path = resolveDataPath(raw, sourcePath);
		checkDataAccess(path, this.settings.dataFolders);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error(`prism.data: file not found: ${path}`);
		if (file.stat.size > MAX_DATA_BYTES) throw new Error(`prism.data: ${path} is larger than ${MAX_DATA_BYTES / 1024 / 1024} MB`);
		const ext = extensionOf(path);
		const text = await this.app.vault.cachedRead(file);
		const payload: DataFilePayload = { path, ext, size: file.stat.size, mtime: file.stat.mtime };
		if (ext === "yaml" || ext === "yml") {
			try {
				payload.data = JSON.parse(JSON.stringify(parseYaml(text) ?? null));
			} catch (err) {
				throw new Error(`prism.data: ${path} is not valid YAML (${err instanceof Error ? err.message : String(err)})`);
			}
		} else payload.text = text;
		return payload;
	}

	/** Data files readable by prism.data(), optionally below `folder`. */
	listDataFiles(folder?: string): DataFileInfo[] {
		const below = folder ? resolveDataPath(folder, "") : "";
		const out: DataFileInfo[] = [];
		for (const file of this.app.vault.getFiles()) {
			const ext = file.extension.toLowerCase();
			if (!DATA_EXTENSIONS.includes(ext)) continue;
			if (below && !isInFolder(file.path, below)) continue;
			try {
				checkDataAccess(file.path, this.settings.dataFolders);
			} catch {
				continue;
			}
			const parent = file.parent?.path ?? "";
			out.push({ path: file.path, name: file.name, folder: parent === "/" ? "" : parent, ext, size: file.stat.size, mtime: file.stat.mtime });
		}
		return out.sort((a, b) => a.path.localeCompare(b.path));
	}

	/* -------------------------------------------------------------- gallery */

	async openGallery() {
		const existing = this.app.workspace.getLeavesOfType(GALLERY_VIEW_TYPE)[0];
		const leaf = existing ?? this.app.workspace.getLeaf("tab");
		if (!existing) await leaf.setViewState({ type: GALLERY_VIEW_TYPE, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	async openGuide(section: GuideSection) {
		const existing = this.app.workspace.getLeavesOfType(GUIDE_VIEW_TYPE)[0];
		const leaf = existing ?? this.app.workspace.getLeaf("tab");
		if (!existing) await leaf.setViewState({ type: GUIDE_VIEW_TYPE, active: true });
		await this.app.workspace.revealLeaf(leaf);
		if (leaf.view instanceof PrismGuideView) await leaf.view.show(section);
	}

	/** Every viz block of every note, in path order. */
	async vizBlocks(): Promise<BlockSpec[]> {
		const out: BlockSpec[] = [];
		const files = this.app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path));
		for (const file of files) {
			const text = await this.app.vault.cachedRead(file);
			if (!/^\s*(`{3,}|~{3,})\s*viz\b/m.test(text)) continue;
			out.push(...this.collectVizBlocks(text, file.path));
		}
		return out;
	}

	/** Latest snapshot per block key (written by renders with snapshots). */
	async snapshotIndex(): Promise<Record<string, { file: string; time?: string }>> {
		try {
			const adapter = this.app.vault.adapter;
			if (!(await adapter.exists(SNAPSHOT_INDEX))) return {};
			return JSON.parse(await adapter.read(SNAPSHOT_INDEX)) as Record<string, { file: string; time?: string }>;
		} catch {
			return {};
		}
	}

	/* ------------------------------------------------------ headless render */

	/**
	 * obsidian://prism?render=<path>[&id=…][&snapshot=0][&width=720][&timeout=60]
	 * Renders all viz blocks of a note (or an HTML file) without opening it and
	 * writes the outcome to .prism/renders/<id>.json (and latest.json).
	 */
	private handleUri(params: ObsidianProtocolData) {
		const path = params.render;
		if (!path) {
			new Notice("Prism: obsidian://prism needs a render=<note path> parameter");
			return;
		}
		const id = (params.id || "").replace(/[^\w.-]/g, "").slice(0, 80) || `uri-${Date.now().toString(36)}`;
		const width = Math.max(320, Math.min(2000, parseInt(params.width ?? "", 10) || 720));
		const timeout = Math.max(5, Math.min(300, parseInt(params.timeout ?? "", 10) || 60)) * 1000;
		const snapshot = params.snapshot !== "0" && params.snapshot !== "false";
		const job = this.renderQueue.then(() => this.renderHeadless(path, { id, width, timeout, snapshot }));
		this.renderQueue = job.catch(() => undefined);
	}

	private resolveRenderTarget(path: string): TFile | null {
		const clean = path.replace(/^\/+/, "");
		for (const candidate of [clean, `${clean}.md`]) {
			const f = this.app.vault.getAbstractFileByPath(candidate);
			if (f instanceof TFile) return f;
		}
		const linked = this.app.metadataCache.getFirstLinkpathDest(clean.replace(/\.md$/i, ""), "");
		return linked instanceof TFile ? linked : null;
	}

	/** All viz blocks of a note, located the same way the code block processor does. */
	private collectVizBlocks(text: string, notePath: string): BlockSpec[] {
		const lines = text.split("\n");
		const specs: BlockSpec[] = [];
		let open: { char: string; len: number; start: number; viz: boolean } | null = null;
		for (let i = 0; i < lines.length; i++) {
			const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(lines[i]);
			if (!fence) continue;
			const char = fence[1][0];
			const len = fence[1].length;
			if (!open) {
				open = { char, len, start: i, viz: fenceOptions(lines[i]) !== null };
			} else if (char === open.char && len >= open.len && fence[2].trim() === "") {
				if (open.viz) {
					const source = lines.slice(open.start + 1, i).join("\n");
					specs.push(this.specFromSection(source, notePath, { text, lineStart: open.start, lineEnd: i }));
				}
				open = null;
			}
		}
		return specs;
	}

	async renderHeadless(path: string, opts: { id: string; width: number; timeout: number; snapshot: boolean }): Promise<RenderResult> {
		const result: RenderResult = {
			$comment: "Written by Prism for obsidian://prism?render=… . status: running → ok | warning | error | failed. Line numbers are 1-based note lines.",
			id: opts.id,
			notePath: path,
			status: "running",
			startedAt: new Date().toISOString(),
			theme: this.getTheme().dark ? "dark" : "light",
			width: opts.width,
			blocks: [],
		};
		await this.writeRenderResult(result);
		const restoreThrottling = keepRendering();
		const component = new Component();
		const container = document.body.createDiv({ cls: "prism-headless" });
		container.style.width = `${opts.width}px`;
		try {
			const file = this.resolveRenderTarget(path);
			if (!file) throw new Error(`File not found: ${path}`);
			result.notePath = file.path;
			const text = await this.app.vault.read(file);
			const specs =
				file.extension === "md"
					? this.collectVizBlocks(text, file.path)
					: HTML_EXTENSIONS.includes(file.extension)
					? [specForFile(file, text, {})]
					: [];
			if (!specs.length) {
				result.message = file.extension === "md" ? "The note contains no viz blocks." : `Unsupported file type .${file.extension}`;
			}
			component.load();
			const frames = specs.map((spec) => {
				spec.options.eager = true;
				const slot = container.createDiv({ cls: "prism-headless-slot" });
				return component.addChild(new PrismFrame(this, slot, spec, { snapshot: opts.snapshot, headless: true }));
			});
			result.blocks = await Promise.all(frames.map((f) => f.whenSettled(opts.timeout)));
			const statuses = result.blocks.map((b) => b.status);
			result.status = !specs.length
				? "failed"
				: statuses.some((s) => s === "error" || s === "timeout" || s === "skipped")
				? "error"
				: statuses.includes("warning")
				? "warning"
				: "ok";
		} catch (err) {
			result.status = "failed";
			result.message = err instanceof Error ? err.message : String(err);
		} finally {
			component.unload();
			container.remove();
			restoreThrottling();
		}
		result.finishedAt = new Date().toISOString();
		await this.writeRenderResult(result);
		await this.errorLog.flush();
		return result;
	}

	private async writeRenderResult(result: RenderResult) {
		const adapter = this.app.vault.adapter;
		try {
			if (!(await adapter.exists(PRISM_DIR))) await adapter.mkdir(PRISM_DIR);
			if (!(await adapter.exists(RENDER_DIR))) await adapter.mkdir(RENDER_DIR);
			const json = JSON.stringify(result, null, 2);
			await adapter.write(`${RENDER_DIR}/${result.id}.json`, json);
			await adapter.write(`${RENDER_DIR}/latest.json`, json);
			if (result.status === "running") return;
			const listing = await adapter.list(RENDER_DIR);
			const files = listing.files.filter((f) => f.endsWith(".json") && !f.endsWith("/latest.json"));
			if (files.length > MAX_RENDER_FILES) {
				const stats = await Promise.all(files.map(async (f) => ({ f, t: (await adapter.stat(f))?.mtime ?? 0 })));
				stats.sort((a, b) => a.t - b.t);
				for (const { f } of stats.slice(0, files.length - MAX_RENDER_FILES)) await adapter.remove(f).catch(() => undefined);
			}
		} catch (err) {
			console.warn("Prism: could not write render result", err);
		}
	}

	/* ---------------------------------------------------------------- bake */

	/**
	 * Renders every viz block of a note offscreen and links a PNG of it right
	 * below the block (src/bake.ts). Baking again replaces the images.
	 */
	async bakeNote(file: TFile) {
		const notice = new Notice("Prism: baking blocks …", 0);
		try {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view?.file?.path === file.path) await view.save();
			const text = await this.app.vault.read(file);
			const specs = this.collectVizBlocks(text, file.path);
			if (!specs.length) {
				new Notice("Prism: this note has no viz blocks.");
				return;
			}
			const images = await this.renderImages(specs);
			const lines = text.split("\n");
			const base = file.basename;
			const failed: string[] = [];
			const placed: { after: number; line: string }[] = [];
			for (let i = 0; i < specs.length; i++) {
				const spec = specs[i];
				const data = images[i];
				const label = spec.options.title || spec.options.id || `viz ${i + 1}`;
				if (!data || !spec.lines) {
					failed.push(label);
					continue;
				}
				const after = spec.lines.end - 1;
				const existing = bakedTarget(lines[after + 1] ?? "");
				const old = existing ? this.app.vault.getAbstractFileByPath(resolveLink(file.path, existing)) : null;
				let target: string;
				if (old instanceof TFile && old.extension === "png") {
					await this.app.vault.modifyBinary(old, dataUrlToArrayBuffer(data));
					target = old.path;
				} else {
					target = await this.availablePath(`${sanitizeFileName(`${base} – ${label}`)}.png`, file.path);
					await this.app.vault.createBinary(target, dataUrlToArrayBuffer(data));
				}
				placed.push({ after, line: bakedLine(label, relativeLink(file.path, target)) });
			}
			let changed = true;
			await this.app.vault.process(file, (current) => {
				if (current !== text) {
					changed = false;
					return current;
				}
				const out = current.split("\n");
				for (const p of placed.sort((a, b) => b.after - a.after)) placeBaked(out, p.after, p.line);
				return out.join("\n");
			});
			if (!changed) new Notice("Prism: the note changed while baking. The images are saved; bake again to link them.");
			else if (failed.length) new Notice(`Prism: baked ${placed.length} block(s). Not baked (errors or no image): ${failed.join(", ")}`);
			else new Notice(`Prism: baked ${placed.length} block(s). The images show wherever Prism does not run.`);
		} catch (err) {
			new Notice(`Prism: baking failed (${err instanceof Error ? err.message : String(err)})`);
		} finally {
			notice.hide();
		}
	}

	/** Removes the baked image lines of a note and moves their files to the trash. */
	async unbakeNote(file: TFile) {
		const targets: string[] = [];
		await this.app.vault.process(file, (text) =>
			text
				.split("\n")
				.filter((line) => {
					const link = bakedTarget(line);
					if (link) targets.push(resolveLink(file.path, link));
					return link === null;
				})
				.join("\n")
		);
		for (const path of targets) {
			const f = this.app.vault.getAbstractFileByPath(path);
			if (f instanceof TFile) await this.app.fileManager.trashFile(f);
		}
		new Notice(targets.length ? `Prism: removed ${targets.length} baked image(s).` : "Prism: this note has no baked images.");
	}

	/** PNGs (data URLs) of blocks rendered offscreen in the current theme; null where a block failed. */
	private async renderImages(specs: BlockSpec[]): Promise<(string | null)[]> {
		const restoreThrottling = keepRendering();
		const component = new Component();
		const container = document.body.createDiv({ cls: "prism-headless" });
		container.setCssStyles({ width: "720px" });
		try {
			component.load();
			const frames = specs.map((spec) => {
				spec.options.eager = true;
				return component.addChild(new PrismFrame(this, container.createDiv({ cls: "prism-headless-slot" }), spec, { snapshot: false, headless: true }));
			});
			const results = await Promise.all(frames.map((f) => f.whenSettled(60000)));
			const images: (string | null)[] = [];
			for (let i = 0; i < frames.length; i++) {
				const ok = results[i].status === "ok" || results[i].status === "warning";
				images.push(ok ? await frames[i].exportPng(2).catch(() => null) : null);
			}
			return images;
		} finally {
			component.unload();
			container.remove();
			restoreThrottling();
		}
	}

	/* ------------------------------------------------------------ html files */

	private registerHtmlFiles() {
		this.registerView(HTML_VIEW_TYPE, (leaf) => new PrismHtmlView(leaf, this));
		try {
			this.registerExtensions(HTML_EXTENSIONS, HTML_VIEW_TYPE);
		} catch (err) {
			console.warn("Prism: .html files are already handled by another plugin", err);
		}

		type EmbedRegistry = {
			registerExtension?: (ext: string, creator: (ctx: { containerEl: HTMLElement; sourcePath?: string }, file: TFile) => unknown) => void;
			unregisterExtension?: (ext: string) => void;
			isExtensionRegistered?: (ext: string) => boolean;
		};
		const registry = (this.app as App & { embedRegistry?: EmbedRegistry }).embedRegistry;
		const registered: string[] = [];
		if (registry?.registerExtension) {
			for (const ext of HTML_EXTENSIONS) {
				try {
					if (registry.isExtensionRegistered?.(ext)) continue;
					registry.registerExtension(ext, (ctx, file) => new PrismHtmlEmbed(this, ctx, file));
					registered.push(ext);
				} catch (err) {
					console.warn(`Prism: could not register .${ext} embeds`, err);
				}
			}
			this.register(() => registered.forEach((ext) => registry.unregisterExtension?.(ext)));
		}
		// Reading-view fallback if the (internal) embed registry is unavailable.
		if (!registered.length) this.registerMarkdownPostProcessor(embedPostProcessor(this));
	}

	/* -------------------------------------------------------------- exports */

	private exportBaseName(spec: BlockSpec): string {
		const note = spec.sourcePath.split("/").pop()?.replace(/\.(md|html?)$/i, "") ?? "viz";
		const suffix = spec.blockIndex !== undefined ? ` viz ${spec.blockIndex + 1}` : "";
		return sanitizeFileName(spec.options.title || note + suffix);
	}

	private async availablePath(fileName: string, sourcePath: string): Promise<string> {
		const fm = this.app.fileManager as typeof this.app.fileManager & {
			getAvailablePathForAttachment?: (name: string, source?: string) => Promise<string>;
		};
		if (fm.getAvailablePathForAttachment) return fm.getAvailablePathForAttachment(fileName, sourcePath);
		return this.uniquePath(this.folderOf(sourcePath), fileName);
	}

	private folderOf(path: string): string {
		const i = path.lastIndexOf("/");
		return i === -1 ? "" : path.slice(0, i);
	}

	private uniquePath(folder: string, fileName: string): string {
		const dot = fileName.lastIndexOf(".");
		const stem = fileName.slice(0, dot);
		const ext = fileName.slice(dot);
		const prefix = folder ? `${folder}/` : "";
		let candidate = `${prefix}${fileName}`;
		for (let n = 2; this.app.vault.getAbstractFileByPath(candidate); n++) candidate = `${prefix}${stem} ${n}${ext}`;
		return candidate;
	}

	async saveExport(spec: BlockSpec, format: "png" | "svg" | "webm", data: string): Promise<string> {
		const path = await this.availablePath(`${this.exportBaseName(spec)}.${format}`, spec.embeddedIn ?? spec.sourcePath);
		if (format !== "svg") await this.app.vault.createBinary(path, dataUrlToArrayBuffer(data));
		else await this.app.vault.create(path, data);
		return path;
	}

	async saveSnapshot(frame: PrismFrame, dataUrl: string): Promise<string> {
		const job = this.snapshotQueue.then(async () => {
			const adapter = this.app.vault.adapter;
			const spec = frame.spec;
			const dark = this.getTheme().dark;
			const file = `${SNAPSHOT_DIR}/${hash(`${spec.blockKey}\n${frame.sourceHash}\n${dark ? "dark" : "light"}`)}.png`;
			if (!(await adapter.exists(PRISM_DIR))) await adapter.mkdir(PRISM_DIR);
			if (!(await adapter.exists(SNAPSHOT_DIR))) await adapter.mkdir(SNAPSHOT_DIR);
			await adapter.writeBinary(file, dataUrlToArrayBuffer(dataUrl));
			let index: Record<string, { file: string }> = {};
			try {
				if (await adapter.exists(SNAPSHOT_INDEX)) index = JSON.parse(await adapter.read(SNAPSHOT_INDEX)) as Record<string, { file: string }>;
			} catch {
				index = {};
			}
			const previous = index[spec.blockKey]?.file;
			if (previous && previous !== file && !Object.values(index).some((e) => e !== index[spec.blockKey] && e.file === previous)) {
				await adapter.remove(previous).catch(() => undefined);
			}
			index[spec.blockKey] = {
				file,
				notePath: spec.sourcePath,
				blockIndex: spec.blockIndex,
				lines: spec.lines,
				theme: dark ? "dark" : "light",
				time: new Date().toISOString(),
			} as { file: string };
			await adapter.write(SNAPSHOT_INDEX, JSON.stringify(index, null, 2));
			this.errorLog.setSnapshot(spec.blockKey, file);
			return file;
		});
		this.snapshotQueue = job.catch(() => undefined);
		return job;
	}

	async saveAsHtml(spec: BlockSpec) {
		const opts = serializeOptions(spec.options);
		const title = spec.options.title || this.exportBaseName(spec);
		let html: string;
		if (isFullDocument(spec.source)) {
			html = spec.source;
			if (opts && !/<meta\s+[^>]*name\s*=\s*["']prism["']/i.test(html)) {
				const meta = `<meta name="prism" content="${escapeHtml(opts)}">`;
				const head = /<head(?:\s[^>]*)?>/i.exec(html);
				html = head ? html.slice(0, head.index + head[0].length) + meta + html.slice(head.index + head[0].length) : meta + html;
			}
		} else {
			const body = isTableSpec(spec.source, spec.options)
				? tableSpecHtml(parseSpec(spec.source, "table"))
				: isChartSpec(spec.source, spec.options)
				? chartSpecHtml(parseSpec(spec.source, "chart"))
				: isPlainMath(spec.source, spec.options)
				? plainMathHtml(spec.source)
				: spec.options.libs.includes("mermaid") && isPlainMermaid(spec.source)
				? `<pre class="mermaid">${escapeHtml(spec.source)}</pre>`
				: spec.source;
			html = [
				"<!DOCTYPE html>",
				'<html lang="en">',
				"<head>",
				'<meta charset="utf-8">',
				opts ? `<meta name="prism" content="${escapeHtml(opts)}">` : "",
				`<title>${escapeHtml(title)}</title>`,
				"</head>",
				"<body>",
				body,
				"</body>",
				"</html>",
				"",
			]
				.filter((l, i) => l !== "" || i > 0)
				.join("\n");
		}
		const folder = spec.kind === "codeblock" ? this.folderOf(spec.sourcePath) : this.folderOf(spec.embeddedIn ?? spec.sourcePath);
		const path = this.uniquePath(folder, `${sanitizeFileName(title)}.html`);
		await this.app.vault.create(path, html);
		const name = path.split("/").pop() ?? path;
		try {
			await navigator.clipboard.writeText(`![[${name}]]`);
			new Notice(`Saved ${path}. Embed link copied: ![[${name}]]`);
		} catch {
			new Notice(`Saved ${path}. Embed with ![[${name}]]`);
		}
	}

	/* ------------------------------------------------------------- commands */

	private registerCommands() {
		this.addCommand({
			id: "insert-starter",
			name: "Insert starter",
			editorCallback: (editor: Editor) => {
				new StarterModal(this.app, (starter) => {
					const cursor = editor.getCursor();
					const atLineStart = editor.getLine(cursor.line).slice(0, cursor.ch).trim() === "";
					editor.replaceSelection(`${atLineStart ? "" : "\n"}${starter.body}\n`);
				}).open();
			},
		});
		this.addCommand({
			id: "chart-from-table",
			name: "Insert chart for the table under the cursor",
			editorCheckCallback: (checking: boolean, editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
				const file = ctx.file;
				const table = file ? this.tableAt(file, editor.getCursor().line) : null;
				if (checking) return !!table;
				if (table && file) this.insertTableChart(editor, file, table);
				return true;
			},
		});
		this.addCommand({
			id: "open-gallery",
			name: "Open gallery",
			callback: () => void this.openGallery(),
		});
		this.addCommand({
			id: "install-agent-skill",
			name: "Install agent skill",
			callback: () => void this.openGuide("skill"),
		});
		this.addCommand({
			id: "show-changelog",
			name: "Show changelog",
			callback: () => void this.openGuide("changelog"),
		});
		this.addCommand({
			id: "generate-agent-rules",
			name: "Generate agent rules",
			callback: () => void this.writeAgentRules(),
		});
		this.addCommand({
			id: "bake-blocks",
			name: "Bake blocks as images",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) void this.bakeNote(file);
				return true;
			},
		});
		this.addCommand({
			id: "unbake-blocks",
			name: "Remove baked images",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) void this.unbakeNote(file);
				return true;
			},
		});
		this.addCommand({
			id: "reload-all",
			name: "Reload all blocks",
			callback: () => {
				this.reloadAll();
				new Notice(`Prism: reloaded ${this.frames.size} block(s)`);
			},
		});
		this.addCommand({
			id: "clear-error-log",
			name: "Clear error log",
			callback: () => {
				this.errorLog.clear();
				new Notice("Prism: error log cleared");
			},
		});
	}

	/** The Markdown table section containing `line` (0-based), from the metadata cache. */
	private tableAt(file: TFile, line: number): { start: number; end: number } | null {
		const sections = this.app.metadataCache.getFileCache(file)?.sections ?? [];
		const hit = sections.find((s) => s.type === "table" && s.position.start.line <= line && line <= s.position.end.line);
		return hit ? { start: hit.position.start.line, end: hit.position.end.line } : null;
	}

	/** Gives the table a block id if needed and inserts a declarative chart block after it. */
	private insertTableChart(editor: Editor, file: TFile, table: { start: number; end: number }) {
		const lines = editor.getValue().split("\n");
		const body = lines.slice(table.start, table.end + 1);
		body[body.length - 1] = body[body.length - 1].replace(/\s\^[\w-]+\s*$/, "");
		const parsed = parseTable(body);
		if (!parsed || !parsed.header.length) {
			new Notice("Prism: this does not look like a Markdown table");
			return;
		}
		// Insert after the table, or after its "^id" line (directly below or after one blank line).
		let after = table.end;
		const idLine = (lines[after + 1] ?? "").trim() === "" ? after + 2 : after + 1;
		const ownLine = /^\s*\^([\w-]+)\s*$/.exec(lines[idLine] ?? "");
		const inRow = /\s\^([\w-]+)\s*$/.exec(lines[table.end] ?? "");
		let id = ownLine?.[1] ?? inRow?.[1];
		let prefix = "";
		if (ownLine) after = idLine;
		if (!id) {
			const taken = new Set(Object.keys(this.app.metadataCache.getFileCache(file)?.blocks ?? {}));
			let n = 1;
			do id = `table-${n++}`;
			while (taken.has(id));
			prefix = `\n\n^${id}`;
		}
		// Value columns: those whose cells look numeric (German formats and units allowed).
		const numeric = (v: string) => /^-?[\d.,\s]+(\s*(€|%|\$))?$/.test(v.trim()) && /\d/.test(v);
		const ys = parsed.header.filter((_, i) => i > 0 && parsed.rows.some((r) => numeric(r[i] ?? "")) && parsed.rows.every((r) => !r[i] || numeric(r[i]) || /^(–|—|-)$/.test(r[i].trim())));
		const yaml = [
			"```viz chart",
			"type: bar",
			`source: ^${id}`,
			`x: ${yamlScalar(parsed.header[0])}`,
			ys.length ? `y: [${ys.map(yamlScalar).join(", ")}]` : "# y: [column] – no numeric column found",
			"```",
		].join("\n");
		editor.replaceRange(`${prefix}\n\n${yaml}`, { line: after, ch: (lines[after] ?? "").length });
		new Notice(`Prism: chart inserted for table ^${id}`);
	}

	private async writeAgentRules() {
		const path = "PRISM.md";
		const content = agentRules();
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			const old = await this.app.vault.read(existing);
			if (!old.includes(RULES_MARKER)) {
				const ok = await confirm(this.app, "PRISM.md exists", "PRISM.md exists and was not generated by Prism. Replace it?");
				if (!ok) return;
				await this.app.vault.modify(existing, content);
			} else {
				// Keep the existing frontmatter (it may have been curated), replace the body.
				const fm = /^---\n[\s\S]*?\n---\n/.exec(old);
				const body = content.replace(/^---\n[\s\S]*?\n---\n/, "");
				await this.app.vault.modify(existing, fm ? fm[0] + body : content);
				if (fm) {
					await this.app.fileManager.processFrontMatter(existing, (data: Record<string, unknown>) => {
						const generated = (data.generated && typeof data.generated === "object" ? data.generated : {}) as Record<string, unknown>;
						data.generated = { ...generated, by: `plugin:prism-viz/${this.manifest.version}`, at: new Date().toISOString().replace(/\.\d+Z$/, "Z") };
					});
				}
			}
		} else {
			await this.app.vault.create(path, content);
		}
		new Notice("Prism: PRISM.md written to the vault root");
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) await this.app.workspace.getLeaf("tab").openFile(file);
	}
}

/** A YAML scalar for a column name (quoted when YAML would misread it). */
function yamlScalar(value: string): string {
	return /^[\p{L}\p{N}_][\p{L}\p{N}_ ()./-]*$/u.test(value) && !/^(true|false|null|yes|no|on|off|\d+)$/i.test(value) ? value : JSON.stringify(value);
}

/** Parses the YAML/JSON body of a declarative ```viz chart / ```viz table block. */
function parseSpec(source: string, kind: "chart" | "table" | "monitor"): Record<string, unknown> {
	let spec: unknown;
	try {
		spec = parseYaml(source);
	} catch (err) {
		throw new Error(`The ${kind} spec is not valid YAML/JSON: ${err instanceof Error ? err.message : String(err)}`);
	}
	if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
		throw new Error(
			kind === "chart"
				? "A ```viz chart block without HTML must contain a YAML/JSON object, e.g. type: bar, source: ^table-id, x: …, y: …"
				: kind === "monitor"
				? "A ```viz monitor block has no options; leave its body empty"
				: "A ```viz table block must contain a YAML/JSON object, e.g. source: folder/data.csv, columns: [a, b], sort: -b"
		);
	}
	return JSON.parse(JSON.stringify(spec)) as Record<string, unknown>;
}

/** Obsidian's UI language as a BCP 47 tag ("de", "en", "zh-TW"). */
function uiLocale(): string {
	try {
		return (typeof getLanguage === "function" && getLanguage()) || navigator.language || "en";
	} catch {
		return navigator.language || "en";
	}
}

/** Inverse of parseOptionString for the options worth keeping in a saved file. */
function serializeOptions(options: VizOptions): string {
	const parts = [...options.libs];
	if (options.height !== null) parts.push(`height=${options.height}`);
	if (options.title) parts.push(`title="${options.title.replace(/"/g, '\\"')}"`);
	if (options.raw) parts.push("raw");
	return parts.join(" ");
}

class StarterModal extends FuzzySuggestModal<Starter> {
	constructor(app: App, private onChoose: (s: Starter) => void) {
		super(app);
		this.setPlaceholder("Insert a Prism starter…");
	}
	getItems() {
		return STARTERS;
	}
	getItemText(item: Starter) {
		return `${item.name} – ${item.description}`;
	}
	onChooseItem(item: Starter) {
		this.onChoose(item);
	}
}

function confirm(app: App, title: string, message: string): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = new Modal(app);
		let answered = false;
		modal.titleEl.setText(title);
		modal.contentEl.createEl("p", { text: message });
		new Setting(modal.contentEl)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => modal.close()))
			.addButton((b) =>
				b
					.setButtonText("Replace")
					.setWarning()
					.onClick(() => {
						answered = true;
						modal.close();
					})
			);
		modal.onClose = () => resolve(answered);
		modal.open();
	});
}
