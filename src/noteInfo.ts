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

const SEPARATOR = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

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
export function noteTasks(text: string, cache: CachedMetadata | null): NoteTask[] {
	const items = (cache?.listItems ?? []).filter((i) => i.task !== undefined);
	if (!items.length) return [];
	const lines = text.split("\n");
	return items.map((item) => {
		const lineNo = item.position.start.line;
		const status = item.task ?? " ";
		let body = (lines[lineNo] ?? "").replace(/^\s*(?:[-*+]|\d+[.)])\s+\[.\]\s?/, "");
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
