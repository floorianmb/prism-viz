// Read-only view of a block's own note for prism.note(): headings, links and
// Markdown tables. Tables are located through Obsidian's section cache, so
// pipes in code blocks or frontmatter are never mistaken for tables.

import type { CachedMetadata } from "obsidian";
import type { NoteHeading, NoteTable, NoteTask } from "./protocol";

/** Splits a table row on unescaped pipes; `\|` stays a literal pipe. */
export function splitRow(line: string): string[] {
	let text = line.trim();
	if (text.startsWith("|")) text = text.slice(1);
	if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1);
	const cells: string[] = [];
	let cell = "";
	let code = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch === "\\" && text[i + 1] === "|") {
			cell += "|";
			i++;
		} else if (ch === "`") {
			code = !code;
			cell += ch;
		} else if (ch === "|" && !code) {
			cells.push(cell);
			cell = "";
		} else cell += ch;
	}
	cells.push(cell);
	return cells.map((c) => c.trim());
}

export const SEPARATOR = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

/** Plain text of a table cell: links reduced to their label, emphasis and code markers removed. */
export function plainCell(cell: string): string {
	return cell
		.replace(/!?\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
		.replace(/!?\[\[([^\]]+)\]\]/g, (_, target: string) => target.replace(/#.*$/, "").split("/").pop() ?? target)
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/(\*\*|__|~~|==)(.+?)\1/g, "$2")
		.replace(/(^|[^\w*])[*_]([^*_]+)[*_](?=$|[^\w*])/g, "$1$2")
		.replace(/`([^`]*)`/g, "$1")
		.replace(/<br\s*\/?>/gi, "\n")
		.trim();
}

export function parseTable(lines: string[]): { header: string[]; rows: string[][] } | null {
	if (lines.length < 2 || !SEPARATOR.test(lines[1])) return null;
	const header = splitRow(lines[0]).map(plainCell);
	const rows = lines
		.slice(2)
		.filter((l) => l.trim() !== "")
		.map((l) => {
			const cells = splitRow(l).map(plainCell);
			while (cells.length < header.length) cells.push("");
			return cells.slice(0, header.length);
		});
	return { header, rows };
}

export function noteHeadings(cache: CachedMetadata | null): NoteHeading[] {
	return (cache?.headings ?? []).map((h) => ({ level: h.level, text: h.heading, line: h.position.start.line + 1 }));
}

export function noteTables(text: string, cache: CachedMetadata | null): NoteTable[] {
	const lines = text.split("\n");
	const headings = cache?.headings ?? [];
	const tables: NoteTable[] = [];
	for (const section of cache?.sections ?? []) {
		if (section.type !== "table") continue;
		const start = section.position.start.line;
		const end = section.position.end.line;
		const body = lines.slice(start, end + 1);
		// A block id may sit on its own line right after the table, or end the last row.
		let id = section.id;
		const last = body[body.length - 1] ?? "";
		const trailing = /\s\^([\w-]+)\s*$/.exec(last);
		if (trailing) {
			id = id ?? trailing[1];
			body[body.length - 1] = last.slice(0, trailing.index);
		}
		const parsed = parseTable(body);
		if (!parsed) continue;
		if (!id) {
			// Obsidian wants the id of a table on its own line, usually after a blank line.
			const after = (lines[end + 1] ?? "").trim() === "" ? lines[end + 2] : lines[end + 1];
			const next = /^\s*\^([\w-]+)\s*$/.exec(after ?? "");
			if (next) id = next[1];
		}
		let heading: string | undefined;
		for (const h of headings) {
			if (h.position.start.line < start) heading = h.heading;
			else break;
		}
		tables.push({ index: tables.length, id, heading, lines: { start: start + 1, end: end + 1 }, ...parsed });
	}
	return tables;
}

const DATE = "(\\d{4}-\\d{2}-\\d{2})";
const TASK_FIELDS: [keyof NoteTask, RegExp][] = [
	["due", new RegExp(`(?:📅|📆|🗓️?)\\s*${DATE}`, "u")],
	["scheduled", new RegExp(`(?:⏳|⌛)\\s*${DATE}`, "u")],
	["start", new RegExp(`🛫\\s*${DATE}`, "u")],
	["doneDate", new RegExp(`✅\\s*${DATE}`, "u")],
];
const PRIORITIES: [string, NoteTask["priority"]][] = [
	["🔺", "highest"],
	["⏫", "high"],
	["🔼", "medium"],
	["🔽", "low"],
	["⏬", "lowest"],
];

/** Tasks of a note, from the list item cache plus the line text. */
/**
 * Task lines found in the text itself, outside code blocks. Used for text
 * that is newer than the metadata cache (unsaved changes in the editor).
 */
export function scanTaskLines(text: string): { line: number; status: string }[] {
	const out: { line: number; status: string }[] = [];
	let fence: string | null = null;
	text.split("\n").forEach((line, i) => {
		const f = /^\s*(`{3,}|~{3,})/.exec(line);
		if (f) {
			if (!fence) fence = f[1];
			else if (f[1][0] === fence[0] && f[1].length >= fence.length && line.trim() === f[1]) fence = null;
			return;
		}
		if (fence) return;
		const m = /^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[(.)\]/.exec(line);
		if (m) out.push({ line: i, status: m[1] });
	});
	return out;
}

/** Tasks of a note: positions from the metadata cache, or with `cache: null` found in the text (see scanTaskLines). */
export function noteTasks(text: string, cache: CachedMetadata | null): NoteTask[] {
	const items = cache
		? (cache.listItems ?? []).filter((i) => i.task !== undefined).map((i) => ({ line: i.position.start.line, status: i.task ?? " " }))
		: scanTaskLines(text);
	if (!items.length) return [];
	const lines = text.split("\n");
	return items.map((item) => {
		const lineNo = item.line;
		const status = item.status;
		let body = (lines[lineNo] ?? "").replace(/^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[.\]\s?/, "");
		const task: NoteTask = { text: "", status, done: status.toLowerCase() === "x", line: lineNo + 1, tags: [] };
		for (const [field, re] of TASK_FIELDS) {
			const m = re.exec(body);
			if (m) {
				(task as unknown as Record<string, string>)[field] = m[1];
				body = body.replace(m[0], "");
			}
		}
		for (const [emoji, priority] of PRIORITIES) {
			if (body.includes(emoji)) {
				task.priority = priority;
				body = body.replace(emoji, "");
				break;
			}
		}
		task.tags = Array.from(body.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu), (m) => m[1]);
		body = body.replace(/\s\^[\w-]+\s*$/, "");
		task.text = body.replace(/\s{2,}/g, " ").trim();
		return task;
	});
}
