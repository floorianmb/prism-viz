// From a clicked chart label back to the rows behind it, and from those rows
// to a place in the vault: the note of a task or note row, or the row of a
// Markdown table in the block's own note.

import { toText } from "../util";
import { ChartSpec, NONE, columnsOf, matches } from "./chartSpec";
import { PERIODS, periodOf } from "./periods";

type Row = Record<string, unknown>;

const isEmpty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length);
/** A cell equals a label (list cells: one of their items), compared as text like chart labels. */
const same = (cell: unknown, label: unknown) => (Array.isArray(cell) ? cell.some((c) => toText(c) === toText(label)) : toText(cell) === toText(label));

/** The rows (after `filter`) that a label – and, with `series`, the clicked dataset – of a chart stand for. */
export function rowsAt(spec: ChartSpec, rows: Row[], label: unknown, series?: unknown): Row[] {
	const x = spec.x ?? columnsOf(rows)[0];
	const group = typeof spec.group === "string" && PERIODS.includes(spec.group) ? spec.group : null;
	const hit = (cell: unknown, wanted: unknown) => (wanted === NONE && isEmpty(cell)) || same(cell, wanted);
	return rows.filter(
		(r) =>
			Object.entries(spec.filter ?? {}).every(([k, v]) => matches(r[k], v)) &&
			hit(group ? periodOf(r[x], group) : r[x], label) &&
			(series === undefined || !spec.series || hit(r[spec.series], series))
	);
}

export interface RowTarget {
	path: string;
	/** 1-based line to scroll to. */
	line?: number;
	/** Show the page preview on hover (not for rows of the block's own note). */
	preview: boolean;
}

/**
 * Where a click on these rows leads: the first row's line in the block's own
 * note when they come from one of its tables (`tableLine`), else their note
 * when they all share one `path` – at the task's line for a single task row.
 */
export function rowTarget(rows: Row[], ownPath: string, tableLine: (r: Row) => number | undefined, taskRows: boolean): RowTarget | null {
	if (!rows.length) return null;
	const line = tableLine(rows[0]);
	if (line) return { path: ownPath, line, preview: false };
	const paths = new Set(rows.map((r) => r.path));
	const [path] = paths;
	if (paths.size !== 1 || typeof path !== "string" || !path) return null;
	const taskLine = taskRows && rows.length === 1 && typeof rows[0].line === "number" ? rows[0].line : undefined;
	return { path, line: taskLine, preview: true };
}
