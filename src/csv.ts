// CSV export of a block's chart or table data (block menu → Export CSV). The
// block only sends JSON; the file text is built here, so a block cannot write
// anything but cells into the file.

import { toText } from "./util";

export interface DataTable {
	columns: string[];
	rows: unknown[][];
}

const MAX_ROWS = 100000;
const MAX_COLUMNS = 500;

/** Parses and checks the JSON a block answered with; throws when it is not a table. */
export function parseDataReply(text: string): DataTable {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Error("the block sent no table data");
	}
	const t = value as Partial<DataTable> | null;
	if (!t || !Array.isArray(t.columns) || !Array.isArray(t.rows)) throw new Error("the block sent no table data");
	if (t.columns.length > MAX_COLUMNS || t.rows.length > MAX_ROWS) throw new Error("the table is too large to export");
	if (!t.rows.every((r) => Array.isArray(r) && r.length <= MAX_COLUMNS)) throw new Error("the block sent no table data");
	return { columns: t.columns.map((c) => toText(c)), rows: t.rows };
}

/**
 * CSV text for Excel and other spreadsheets in the reader's language: with a
 * decimal comma (German and most of Europe) the separator is ";" and numbers
 * use the comma, otherwise "," and ".". Starts with a byte order mark so
 * Excel reads umlauts correctly. Lists (e.g. tags) are joined with ", ".
 */
export function toCsv(table: DataTable, locale: string): string {
	const comma = new Intl.NumberFormat(locale).format(1.5).includes(",");
	const sep = comma ? ";" : ",";
	const cell = (v: unknown): string => {
		let s: string;
		if (typeof v === "number") s = Number.isFinite(v) ? (comma ? String(v).replace(".", ",") : String(v)) : "";
		else if (Array.isArray(v)) s = v.map((x) => toText(x)).join(", ");
		else s = v === null || v === undefined ? "" : toText(v);
		// Spreadsheets run cells that start with = + @ (or - before a non-number) as formulas.
		if (typeof v !== "number" && (/^[=+@\t\r]/.test(s) || /^-(?![\d.,])/.test(s))) s = `'${s}`;
		return /["\n\r]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	const lines = [table.columns, ...table.rows].map((r) => r.map(cell).join(sep));
	return "﻿" + lines.join("\r\n") + "\r\n";
}
