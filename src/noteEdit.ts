// prism.edit: a block changes its own note through a few fixed operations
// (check off a task, set a table cell, append a table row, set a property).
// The text operations are pure functions over the note text; main.ts applies
// the result through the editor (undoable) or the vault. Each block asks the
// reader once before its first edit (EditApproval).

import type { NoteEdit, NoteTable } from "./protocol";
import { SEPARATOR, parseTable } from "./noteInfo";

/** One changed line: `insert` adds `text` as a new line after `line`, otherwise `text` replaces `line` (0-based). */
export interface LineEdit {
	line: number;
	text: string;
	insert?: boolean;
}

const TASK = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)(.)(\].*)$/;

/** Words of a text, for matching a task text from prism.note() (dates, priorities and ids removed) against its line. */
function words(text: string): string[] {
	return text.toLowerCase().split(/[^\p{L}\p{N}#_/-]+/u).filter(Boolean);
}

/** Checks a task off (or on, or toggles it when `done` is undefined). `ref.line` is 1-based; `ref.text` finds the task if lines moved. */
export function setTask(text: string, ref: { line?: number; text?: string }, done: boolean | undefined): LineEdit {
	const lines = text.split("\n");
	const wanted = typeof ref.text === "string" ? ref.text.trim() : "";
	const want = words(wanted);
	const fits = (i: number) => {
		const m = TASK.exec(lines[i] ?? "");
		if (!m) return false;
		const have = new Set(words(m[3]));
		return want.every((w) => have.has(w));
	};
	let index = typeof ref.line === "number" ? ref.line - 1 : -1;
	if (!(index >= 0 && fits(index))) {
		if (!wanted) throw new Error(`prism.edit.setTask: line ${ref.line} is not a task`);
		const hits = lines.map((_, i) => i).filter(fits);
		if (hits.length !== 1) {
			throw new Error(`prism.edit.setTask: ${hits.length ? "several tasks" : "no task"} with the text "${wanted}" in this note`);
		}
		index = hits[0];
	}
	const m = TASK.exec(lines[index]) as RegExpExecArray;
	const isDone = m[2] !== " ";
	const next = (done ?? !isDone) ? "x" : " ";
	return { line: index, text: `${m[1]}${next}${m[3]}` };
}

/** Cells of a table row with their positions, ignoring escaped pipes and pipes in code spans. */
function cellRanges(line: string): { from: number; to: number }[] {
	const pipes: number[] = [];
	let code = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === "\\") i++;
		else if (ch === "`") code = !code;
		else if (ch === "|" && !code) pipes.push(i);
	}
	const first = line.search(/\S/);
	const last = line.trimEnd().length - 1;
	const bounds = [...pipes];
	if (bounds[0] !== first) bounds.unshift(first - 1);
	if (bounds[bounds.length - 1] !== last) bounds.push(last + 1);
	const out: { from: number; to: number }[] = [];
	for (let i = 0; i + 1 < bounds.length; i++) out.push({ from: bounds[i] + 1, to: bounds[i + 1] });
	return out;
}

/** Markdown text for a table cell value. */
export function cellText(value: unknown): string {
	const text = Array.isArray(value) ? value.map(scalarText).join(", ") : scalarText(value);
	return text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

/** Text of one value: strings, numbers and booleans as written, objects as JSON. */
function scalarText(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
	return JSON.stringify(value) ?? "";
}

/** The table `ref` points to: "^id", "id", heading text or index (as in prism.note().table()). */
export function findTable(tables: NoteTable[], ref: string | number | undefined): NoteTable {
	let hit: NoteTable | undefined;
	if (ref === undefined || typeof ref === "number") hit = tables[ref ?? 0];
	else {
		const r = String(ref).trim();
		const id = r.replace(/^\^/, "");
		hit =
			tables.find((t) => t.id === id) ||
			tables.find((t) => (t.heading || "").toLowerCase() === r.toLowerCase()) ||
			tables.find((t) => (t.heading || "").toLowerCase().includes(r.toLowerCase()));
	}
	if (!hit) throw new Error(`prism.edit: no table ${JSON.stringify(ref)} in this note`);
	return hit;
}

function columnIndex(table: NoteTable, column: string | number): number {
	if (typeof column === "number") {
		if (column >= 0 && column < table.header.length) return column;
	} else {
		const c = String(column).trim().toLowerCase();
		const i = table.header.findIndex((h) => h.trim().toLowerCase() === c);
		if (i !== -1) return i;
	}
	throw new Error(`prism.edit: no column ${JSON.stringify(column)} (columns: ${table.header.join(", ")})`);
}

/** Sets one cell; `row` is the 0-based body row (as in prism.note().table() rows). */
export function setCell(text: string, table: NoteTable, row: number, column: string | number, value: unknown): LineEdit {
	if (!Number.isInteger(row) || row < 0 || row >= table.rows.length) {
		throw new Error(`prism.edit.setCell: row ${row} does not exist (the table has ${table.rows.length} rows)`);
	}
	const col = columnIndex(table, column);
	const index = table.lines.start - 1 + 2 + row;
	let line = text.split("\n")[index] ?? "";
	// A block id may end the last row; keep it.
	const id = /\s\^[\w-]+\s*$/.exec(line);
	const suffix = id ? line.slice(id.index) : "";
	if (id) line = line.slice(0, id.index);
	const cells = cellRanges(line);
	const value_ = ` ${cellText(value)} `;
	if (col < cells.length) {
		const { from, to } = cells[col];
		line = line.slice(0, from) + value_ + line.slice(to);
	} else {
		// Short row: pad it with empty cells.
		let out = line.trimEnd();
		if (!out.endsWith("|")) out += " |";
		for (let i = cells.length; i < col; i++) out += "  |";
		line = `${out}${value_}|`;
	}
	return { line: index, text: suffix ? line.trimEnd() + suffix : line };
}

/** Appends a row after the table's last row; `values` by column name or in column order. */
export function addRow(table: NoteTable, values: Record<string, unknown> | unknown[]): LineEdit {
	const cells = table.header.map((h, i) => {
		if (Array.isArray(values)) return cellText(values[i]);
		const key = Object.keys(values).find((k) => k.trim().toLowerCase() === h.trim().toLowerCase());
		return key === undefined ? "" : cellText(values[key]);
	});
	if (!Array.isArray(values)) {
		const unknown = Object.keys(values).filter((k) => !table.header.some((h) => h.trim().toLowerCase() === k.trim().toLowerCase()));
		if (unknown.length) throw new Error(`prism.edit.addRow: no column ${unknown.map((k) => JSON.stringify(k)).join(", ")} (columns: ${table.header.join(", ")})`);
	}
	return { line: table.lines.end - 1, text: `| ${cells.join(" | ")} |`, insert: true };
}

/**
 * Markdown tables of a note, found in its text (not the metadata cache, which
 * lags behind unsaved editor changes). Same shape and order as noteTables().
 */
export function scanTables(text: string): NoteTable[] {
	const lines = text.split("\n");
	const tables: NoteTable[] = [];
	let heading: string | undefined;
	let fence: string | null = null;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const f = /^\s*(`{3,}|~{3,})/.exec(line);
		if (f) {
			if (!fence) fence = f[1];
			else if (f[1][0] === fence[0] && f[1].length >= fence.length && line.trim() === f[1]) fence = null;
			continue;
		}
		if (fence) continue;
		const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
		if (h) {
			heading = h[2];
			continue;
		}
		if (!line.includes("|") || !SEPARATOR.test(lines[i + 1] ?? "")) continue;
		let end = i + 1;
		while (end + 1 < lines.length && lines[end + 1].trim() !== "" && lines[end + 1].includes("|")) end++;
		const body = lines.slice(i, end + 1);
		const trailing = /\s\^([\w-]+)\s*$/.exec(body[body.length - 1]);
		if (trailing) body[body.length - 1] = body[body.length - 1].slice(0, trailing.index);
		const parsed = parseTable(body);
		if (parsed) {
			let id = trailing?.[1];
			if (!id) {
				const after = (lines[end + 1] ?? "").trim() === "" ? lines[end + 2] : lines[end + 1];
				id = /^\s*\^([\w-]+)\s*$/.exec(after ?? "")?.[1];
			}
			tables.push({ index: tables.length, id, heading, lines: { start: i + 1, end: end + 1 }, ...parsed });
		}
		i = end;
	}
	return tables;
}

/** Checks the shape of an edit sent by a block. */
export function validateEdit(raw: unknown): NoteEdit {
	if (!raw || typeof raw !== "object") throw new Error("prism.edit: invalid edit");
	const op = raw as Record<string, unknown>;
	const ref = (v: unknown): string | number => (typeof v === "number" || typeof v === "string" ? v : String(v));
	const optionalRef = (v: unknown): string | number | undefined => (v === undefined ? undefined : ref(v));
	switch (op.kind) {
		case "task": {
			const line = op.line === undefined ? undefined : Number(op.line);
			const text = typeof op.text === "string" || typeof op.text === "number" ? String(op.text) : undefined;
			if ((line === undefined || !Number.isInteger(line)) && !text) throw new Error("prism.edit.setTask: pass a line number or a task from prism.note().tasks");
			return { kind: "task", line, text, done: typeof op.done === "boolean" ? op.done : undefined };
		}
		case "cell":
			return { kind: "cell", table: optionalRef(op.table), row: Number(op.row), column: ref(op.column), value: op.value };
		case "row":
			if (!op.values || typeof op.values !== "object") throw new Error("prism.edit.addRow: values must be an object or an array");
			return { kind: "row", table: optionalRef(op.table), values: op.values as Record<string, unknown> | unknown[] };
		case "property": {
			const key = typeof op.key === "string" ? op.key.trim() : "";
			if (!key || key === "position") throw new Error("prism.edit.setProperty: invalid property name");
			return { kind: "property", key, value: op.value === undefined ? null : op.value };
		}
		default:
			throw new Error("prism.edit: unknown edit");
	}
}

/** The line edit for a task, cell or row edit on the current note text. */
export function lineEditFor(text: string, op: Exclude<NoteEdit, { kind: "property" }>): LineEdit {
	if (op.kind === "task") return setTask(text, op, op.done);
	const table = findTable(scanTables(text), op.table);
	return op.kind === "cell" ? setCell(text, table, op.row, op.column, op.value) : addRow(table, op.values);
}

/** Applies a line edit to the note text. */
export function applyLineEdit(text: string, edit: LineEdit): string {
	const lines = text.split("\n");
	if (edit.insert) lines.splice(edit.line + 1, 0, edit.text);
	else lines[edit.line] = edit.text;
	return lines.join("\n");
}

/** Short description of an edit for the approval bar. */
export function describeEdit(op: NoteEdit): string {
	switch (op.kind) {
		case "task":
			return op.done === false ? "uncheck a task" : op.done === true ? "check off a task" : "check or uncheck a task";
		case "cell":
			return "change a table cell";
		case "row":
			return "add a table row";
		case "property":
			return `set the property "${op.key}"`;
	}
}

/**
 * Holds a block's note edits until the reader allows them. "Allow" is
 * remembered for this block and its current code (an edited block asks
 * again); "Don't allow" rejects the edits of this render.
 */
export class EditApproval {
	private denied = false;
	private waiting: { op: NoteEdit; resolve: () => void; reject: (e: Error) => void }[] = [];
	private bar: HTMLElement | null = null;

	constructor(
		private anchor: () => HTMLElement | null,
		private interactive: boolean,
		private isAllowed: () => boolean,
		private allow: () => void
	) {}

	wait(op: NoteEdit): Promise<void> {
		if (this.isAllowed()) return Promise.resolve();
		if (this.denied) return Promise.reject(new Error("prism.edit: the reader did not allow this block to change the note"));
		if (!this.interactive || !this.anchor()) return Promise.reject(new Error("prism.edit: notes are never changed in command-line renders or exports"));
		return new Promise((resolve, reject) => {
			this.waiting.push({ op, resolve, reject });
			this.show();
		});
	}

	/** New render or unload: pending edits are dropped, a denial ends. */
	reset() {
		this.denied = false;
		this.waiting.forEach((w) => w.reject(new Error("prism.edit: the block was reloaded")));
		this.waiting = [];
		this.bar?.remove();
		this.bar = null;
	}

	private settle(allowed: boolean) {
		const waiting = this.waiting;
		this.waiting = [];
		this.bar?.remove();
		this.bar = null;
		if (allowed) {
			this.allow();
			waiting.forEach((w) => w.resolve());
		} else {
			this.denied = true;
			waiting.forEach((w) => w.reject(new Error("prism.edit: the reader did not allow this block to change the note")));
		}
	}

	private show() {
		const anchor = this.anchor();
		if (!anchor) return;
		if (!this.bar) {
			this.bar = createDiv({ cls: "prism-http-bar prism-edit-bar" });
			anchor.after(this.bar);
		}
		this.bar.empty();
		const what = Array.from(new Set(this.waiting.map((w) => describeEdit(w.op))));
		const text = this.bar.createSpan({ cls: "prism-http-text" });
		text.appendText("This block wants to change this note: ");
		text.createEl("b", { text: what.join(", ") });
		text.appendText(".");
		const allow = this.bar.createEl("button", { cls: "mod-cta", text: "Allow edits" });
		allow.addEventListener("click", (e) => {
			e.stopPropagation();
			this.settle(true);
		});
		const deny = this.bar.createEl("button", { text: "Don't allow" });
		deny.addEventListener("click", (e) => {
			e.stopPropagation();
			this.settle(false);
		});
	}
}
