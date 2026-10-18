// Offline check of the viz blocks in a note, for AI agents without a running
// Obsidian (scripts/prism-lint.mjs, `prism-render.mjs --lint`). Pure: no fs,
// no obsidian. It finds the same blocks as the render command and runs the
// static checks only: YAML errors, spec warnings, missing tables/columns and
// syntax errors in inline scripts. Nothing is executed.

import { parse as parseJs } from "acorn";
import { load as loadYaml } from "js-yaml";
import { isChartSpec, isTableSpec } from "./document";
import { lookupTable, parseTable, SEPARATOR } from "./noteInfo";
import { VizOptions, emptyOptions, fenceOptions, parseOptionString } from "./options";
import { compileExpression } from "./runtime/compute";
import { isLinksSource, isNotesSource, isTasksSource, linkRows, specWarnings, taskRows } from "./runtime/chartSpec";
import { tableWarnings } from "./runtime/table";

export interface LintError {
	kind: "error" | "warning";
	/** 1-based note line. */
	line: number;
	message: string;
}

export interface LintBlock {
	/** `<note path>#<id or 0-based index>`, like the render command. */
	block: string;
	/** 1-based note lines of the fence (start, end). */
	lines: [number, number];
	status: "ok" | "warning" | "error";
	errors: LintError[];
}

export interface LintResult {
	status: "ok" | "warning" | "error";
	blocks: LintBlock[];
}

export interface LintFiles {
	/** Text of a vault file (path relative to the vault root) or null. */
	readText(path: string): string | null;
}

interface Table {
	index: number;
	id?: string;
	heading?: string;
	lines: { start: number; end: number };
	header: string[];
}

const FENCE = /^\s*(`{3,}|~{3,})(.*)$/;

/** Markdown tables outside code fences (the logic of noteTables without the metadata cache). */
function scanTables(lines: string[]): Table[] {
	const tables: Table[] = [];
	let fence: { char: string; len: number } | null = null;
	let heading: string | undefined;
	for (let i = 0; i < lines.length; i++) {
		const f = FENCE.exec(lines[i]);
		if (f) {
			if (!fence) fence = { char: f[1][0], len: f[1].length };
			else if (f[1][0] === fence.char && f[1].length >= fence.len && f[2].trim() === "") fence = null;
			continue;
		}
		if (fence) continue;
		const h = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(lines[i]);
		if (h) heading = h[1];
		if (!lines[i].includes("|") || !SEPARATOR.test(lines[i + 1] ?? "") || !(lines[i + 1] ?? "").includes("-")) continue;
		let end = i + 1;
		while (end + 1 < lines.length && lines[end + 1].trim() !== "" && lines[end + 1].includes("|")) end++;
		const body = lines.slice(i, end + 1);
		let id: string | undefined;
		const trailing = /\s\^([\w-]+)\s*$/.exec(body[body.length - 1]);
		if (trailing) {
			id = trailing[1];
			body[body.length - 1] = body[body.length - 1].slice(0, trailing.index);
		} else {
			const after = (lines[end + 1] ?? "").trim() === "" ? lines[end + 2] : lines[end + 1];
			id = /^\s*\^([\w-]+)\s*$/.exec(after ?? "")?.[1];
		}
		const parsed = parseTable(body);
		if (parsed) tables.push({ index: tables.length, id, heading, lines: { start: i + 1, end: end + 1 }, header: parsed.header });
		i = end;
	}
	return tables;
}

/** Column names of a CSV/TSV header line. */
function dataColumns(text: string, file: string): string[] {
	const first = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0];
	const sep = /\.tsv$/i.test(file) ? "\t" : first.split(";").length > first.split(",").length ? ";" : ",";
	return first.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
}

const toRow = (columns: string[]): Record<string, unknown>[] => [Object.fromEntries(columns.map((c) => [c, null]))];

const JS_TYPES = /^\s*$|^\s*(text|application)\/(javascript|ecmascript)\s*$/i;
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;

/** Syntax errors in the inline classic scripts of an HTML block; `first` = note line of the first body line. */
function scriptErrors(source: string, first: number): LintError[] {
	const out: LintError[] = [];
	for (const m of source.matchAll(SCRIPT)) {
		const attrs = m[1];
		if (/\bsrc\s*=/i.test(attrs)) continue;
		const type = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i.exec(attrs);
		const t = type ? type[1] ?? type[2] ?? type[3] : "";
		if (!JS_TYPES.test(t)) continue; // modules, JSON, templates
		const codeStart = (m.index ?? 0) + m[0].indexOf(">") + 1;
		const base = first + (source.slice(0, codeStart).match(/\n/g)?.length ?? 0);
		try {
			parseJs(m[2], { ecmaVersion: "latest", sourceType: "script", allowHashBang: true });
		} catch (err) {
			const e = err as { message: string; loc?: { line: number } };
			out.push({ kind: "error", line: base + (e.loc?.line ?? 1) - 1, message: `SyntaxError: ${e.message.replace(/\s*\(\d+:\d+\)$/, "")}` });
		}
	}
	return out;
}

/** Parses a spec body; returns the object or an error (same texts as parseSpec in main.ts). */
function parseSpecBody(source: string, kind: "chart" | "table", first: number): { spec: Record<string, unknown> } | { error: LintError } {
	let spec: unknown;
	try {
		spec = loadYaml(source);
	} catch (err) {
		const e = err as { reason?: string; message: string; mark?: { line: number } };
		return { error: { kind: "error", line: first + (e.mark?.line ?? 0), message: `The ${kind} spec is not valid YAML/JSON: ${e.reason ?? e.message.split("\n")[0]}` } };
	}
	if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
		return {
			error: {
				kind: "error",
				line: first,
				message:
					kind === "chart"
						? "A ```viz chart block without HTML must contain a YAML/JSON object, e.g. type: bar, source: ^table-id, x: …, y: …"
						: "A ```viz table block must contain a YAML/JSON object, e.g. source: folder/data.csv, columns: [a, b], sort: -b",
			},
		};
	}
	return { spec: spec as Record<string, unknown> };
}

/** Columns of the spec's data, `null` when unknown (skip the column checks), or an error for a missing table. */
function sourceColumns(spec: Record<string, unknown>, tables: Table[], files: LintFiles | undefined): { columns: string[] | null; error?: string } {
	if (spec.data) return { columns: null };
	const src = spec.rows ?? spec.source;
	if (Array.isArray(src)) return { columns: Object.keys((src[0] ?? {}) as object) };
	if (typeof src !== "string" || !src.trim()) return { columns: null };
	const s = src.trim();
	if (isTasksSource(s)) return { columns: taskRows([]).columns };
	if (isLinksSource(s)) return { columns: linkRows([]).columns };
	if (isNotesSource(s)) return { columns: null };
	if (s.startsWith("^") || /^table:/i.test(s) || /^#\d+$/.test(s)) {
		const ref = s.startsWith("^") ? s : s.startsWith("#") ? Number(s.slice(1)) : s.slice(6).trim();
		const hit = lookupTable(tables, ref);
		if (hit) return { columns: hit.header };
		const known = tables.map((t) => `#${t.index}${t.id ? ` ^${t.id}` : ""}${t.heading ? ` under "${t.heading}"` : ""} (line ${t.lines.start})`);
		return { columns: null, error: `prism.note().table(${JSON.stringify(ref)}): no such table. ${known.length ? "Tables: " + known.join(", ") : "The note has no Markdown tables."}` };
	}
	if (/\.(csv|tsv)$/i.test(s)) {
		const text = files?.readText(s.replace(/^\/+/, ""));
		if (text) return { columns: dataColumns(text, s) };
	}
	return { columns: null };
}

/** Checks all viz blocks of a note text. `notePath` only labels the block keys. */
export function lintNote(text: string, files?: LintFiles, notePath = ""): LintResult {
	const lines = text.split("\n");
	const tables = scanTables(lines);
	const blocks: LintBlock[] = [];
	let open: { char: string; len: number; start: number; viz: boolean } | null = null;
	for (let i = 0; i < lines.length; i++) {
		const fence = FENCE.exec(lines[i]);
		if (!fence) continue;
		const char = fence[1][0];
		const len = fence[1].length;
		if (!open) {
			open = { char, len, start: i, viz: fenceOptions(lines[i]) !== null };
			continue;
		}
		if (char !== open.char || len < open.len || fence[2].trim() !== "") continue;
		if (open.viz) {
			const source = lines.slice(open.start + 1, i).join("\n");
			const options = parseOptionString(fenceOptions(lines[open.start]) ?? "", emptyOptions());
			const first = open.start + 2; // note line of the first body line
			const errors = lintBlock(source, options, first, open.start + 1, tables, files);
			blocks.push({
				block: `${notePath}#${options.id ?? blocks.length}`,
				lines: [open.start + 1, i + 1],
				status: errors.some((e) => e.kind === "error") ? "error" : errors.length ? "warning" : "ok",
				errors,
			});
		}
		open = null;
	}
	return { status: blocks.some((b) => b.status === "error") ? "error" : blocks.some((b) => b.status === "warning") ? "warning" : "ok", blocks };
}

function lintBlock(source: string, options: VizOptions, first: number, fenceLine: number, tables: Table[], files: LintFiles | undefined): LintError[] {
	const errors: LintError[] = options.warnings.map((message) => ({ kind: "warning" as const, line: fenceLine, message }));
	if (options.web || options.monitor) return errors;
	const kind = isTableSpec(source, options) ? "table" : isChartSpec(source, options) ? "chart" : null;
	if (!kind) return [...errors, ...scriptErrors(source, first)];
	const parsed = parseSpecBody(source, kind, first);
	if ("error" in parsed) return [...errors, parsed.error];
	const spec = parsed.spec;
	const bodyLines = source.split("\n");
	// The line of the key or column a message names, else the first body line.
	const lineOf = (message: string) => {
		const name = /"([^"]+)"/.exec(message.replace(/^[^"]*\(\w+\) /, ""))?.[1];
		const at = name ? bodyLines.findIndex((l) => new RegExp(`(^|[^\\w])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\w]|$)`).test(l)) : -1;
		return first + Math.max(at, 0);
	};
	const { columns: loaded, error } = sourceColumns(spec, tables, files);
	if (error) errors.push({ kind: "error", line: lineOf(String(spec.rows ?? spec.source)), message: error });
	const compute = spec.compute && typeof spec.compute === "object" ? (spec.compute as Record<string, unknown>) : {};
	for (const [name, expr] of Object.entries(compute)) {
		try {
			if (typeof expr === "string") compileExpression(expr);
		} catch (e) {
			errors.push({ kind: "error", line: lineOf(`"${name}"`), message: `compute "${name}": ${(e as Error).message}` });
		}
	}
	const columns = loaded && [...loaded, ...Object.keys(compute)];
	const messages = kind === "chart" ? specWarnings(spec as never, columns && toRow(columns)) : tableWarnings(spec as never, columns ?? []);
	for (const message of messages) errors.push({ kind: "warning", line: lineOf(message), message });
	return errors;
}
