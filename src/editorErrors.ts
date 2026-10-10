// Block errors in the editor: lines of a viz block that caused errors or
// warnings are underlined in Live Preview / source mode, with the message at
// the end of the line. Errors without a line in the block (libraries, Prism
// itself, timeouts) go on the block's opening fence.
//
// Errors are kept per block until the block renders again, because in Live
// Preview the rendered block (and its frame) is removed exactly when the
// cursor enters it to show the source.

import { RangeSetBuilder, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import { MarkdownView, editorInfoField, type App } from "obsidian";
import type { PrismFrame } from "./frame";
import { debounce } from "./util";

export interface LineError {
	/** 1-based note line. */
	line: number;
	message: string;
	warning: boolean;
}

const setErrors = StateEffect.define<LineError[]>();

class MessageWidget extends WidgetType {
	constructor(readonly text: string, readonly warning: boolean, readonly more: number) {
		super();
	}

	eq(other: MessageWidget) {
		return other.text === this.text && other.warning === this.warning && other.more === this.more;
	}

	toDOM() {
		const el = createSpan({ cls: `prism-cm-message${this.warning ? " is-warning" : ""}` });
		el.setText(this.more ? `${this.text} (+${this.more})` : this.text);
		return el;
	}

	ignoreEvent() {
		return true;
	}
}

function decorate(view: { state: EditorView["state"] }, errors: LineError[]): DecorationSet {
	const doc = view.state.doc;
	const byLine = new Map<number, LineError[]>();
	for (const e of errors) {
		if (e.line < 1 || e.line > doc.lines) continue;
		const list = byLine.get(e.line) ?? [];
		list.push(e);
		byLine.set(e.line, list);
	}
	const builder = new RangeSetBuilder<Decoration>();
	for (const n of Array.from(byLine.keys()).sort((a, b) => a - b)) {
		const list = byLine.get(n) as LineError[];
		// Errors before warnings: the line shows its worst problem.
		list.sort((a, b) => Number(a.warning) - Number(b.warning));
		const warning = list.every((e) => e.warning);
		const line = doc.line(n);
		const title = list.map((e) => `Prism ${e.warning ? "warning" : "error"}: ${e.message}`).join("\n");
		builder.add(line.from, line.from, Decoration.line({ class: `prism-cm-line${warning ? " is-warning" : ""}` }));
		const start = line.from + Math.max(0, line.text.search(/\S/));
		if (start < line.to) builder.add(start, line.to, Decoration.mark({ class: `prism-cm-error${warning ? " is-warning" : ""}`, attributes: { title } }));
		const first = list[0].message.split("\n")[0];
		builder.add(line.to, line.to, Decoration.widget({ widget: new MessageWidget(first.length > 140 ? first.slice(0, 139) + "…" : first, warning, list.length - 1), side: 1 }));
	}
	return builder.finish();
}

const errorField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(deco, tr) {
		deco = deco.map(tr.changes);
		for (const e of tr.effects) if (e.is(setErrors)) deco = decorate(tr, e.value);
		return deco;
	},
	provide: (f) => EditorView.decorations.from(f),
});

/** Block errors per note, from the frames that rendered them. */
export class EditorErrors {
	/** blockKey → errors of its last render. */
	private blocks = new Map<string, { path: string; errors: LineError[] }>();
	private dirty = new Set<string>();
	private flush = debounce(() => {
		const paths = Array.from(this.dirty);
		this.dirty.clear();
		paths.forEach((p) => this.refresh(p));
	}, 150);

	constructor(private app: App, private enabled: () => boolean) {}

	/** CodeMirror extension: the decorations, and the errors of the note when an editor opens it. */
	extension(): Extension {
		const errors = this;
		return [
			errorField,
			ViewPlugin.define((view) => {
				const path = view.state.field(editorInfoField, false)?.file?.path;
				if (path) window.setTimeout(() => view.dispatch({ effects: setErrors.of(errors.forPath(path)) }), 0);
				return {};
			}),
		];
	}

	/** Called whenever a frame's errors change. */
	update(frame: PrismFrame) {
		const spec = frame.spec;
		if (spec.kind !== "codeblock" || !spec.lines) return;
		const fence = spec.lines.start;
		const errors = frame.shownErrors.map((e) => ({ line: e.line ?? fence, message: e.message, warning: e.kind === "warning" }));
		const previous = this.blocks.get(spec.blockKey);
		if (!errors.length && !previous) return;
		if (errors.length) this.blocks.set(spec.blockKey, { path: spec.sourcePath, errors });
		else this.blocks.delete(spec.blockKey);
		this.dirty.add(spec.sourcePath);
		if (previous && previous.path !== spec.sourcePath) this.dirty.add(previous.path);
		this.flush();
	}

	/** Deleted or renamed note. */
	forget(path: string) {
		for (const [key, entry] of this.blocks) if (entry.path === path) this.blocks.delete(key);
		this.refresh(path);
	}

	forPath(path: string): LineError[] {
		if (!this.enabled()) return [];
		const out: LineError[] = [];
		for (const entry of this.blocks.values()) if (entry.path === path) out.push(...entry.errors);
		return out;
	}

	refreshAll() {
		const paths = new Set(Array.from(this.blocks.values(), (e) => e.path));
		this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
			if (leaf.view instanceof MarkdownView && leaf.view.file) paths.add(leaf.view.file.path);
		});
		paths.forEach((p) => this.refresh(p));
	}

	private refresh(path: string) {
		const errors = this.forPath(path);
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || view.file?.path !== path) continue;
			// Obsidian's Editor wraps a CodeMirror 6 EditorView (not part of the typed API).
			const cm = (view.editor as unknown as { cm?: EditorView }).cm;
			cm?.dispatch({ effects: setErrors.of(errors) });
		}
	}

	dispose() {
		this.flush.cancel();
	}
}
