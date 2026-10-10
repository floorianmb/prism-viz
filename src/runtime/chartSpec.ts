// Declarative charts: turns a small spec plus table rows into a Chart.js
// config. Used by prism.chart() and by ```viz chart blocks that contain YAML
// or JSON instead of HTML.


import { toText } from "../util";
import type { NoteMeta } from "../protocol";

export interface ChartSpec {
	/** Chart.js type, plus "area" (filled line) and "hbar" (horizontal bars). */
	type?: string;
	/** "^block-id" or "table:<heading>" (table of this note), "notes" (frontmatter of notes), a data file path, or inline rows. */
	source?: string | Record<string, unknown>[];
	/** With `source: notes`: only notes in this folder (and below). */
	folder?: string;
	/** With `source: notes`: only notes with this tag (and its subtags). */
	tag?: string;
	/** Group rows by x (and series): "count" rows, or "sum" / "avg" / "min" / "max" of the y columns. */
	aggregate?: string;
	/** Inline rows (alias of an array `source`). */
	rows?: Record<string, unknown>[];
	/** Column for the labels / x axis. Default: first column. */
	x?: string;
	/** Value column(s). Default: every numeric column except x. */
	y?: string | string[];
	/** Long format: one dataset per distinct value of this column (values from the first y column). */
	series?: string;
	/** Keep only rows whose columns equal these values. */
	filter?: Record<string, unknown>;
	/** Sort rows by a column ("-col" descending) before charting. */
	sort?: string;
	/** Keep the first N rows (after sorting). */
	limit?: number;
	stacked?: boolean;
	title?: string;
	/** Plot height in px (declarative blocks). */
	height?: number;
	/** Merged into the Chart.js options. */
	options?: Record<string, unknown>;
	/** Raw Chart.js data ({ labels, datasets }); skips source/x/y. */
	data?: { labels?: unknown[]; datasets: unknown[] };
}

const SEGMENTED = new Set(["pie", "doughnut", "polarArea"]);
const SPEC_KEYS = new Set(["type", "source", "folder", "tag", "rows", "x", "y", "series", "filter", "aggregate", "sort", "limit", "stacked", "title", "height", "options", "data"]);
const AGGREGATES = ["count", "sum", "avg", "min", "max"];

/** Problems a spec author should hear about (unknown keys, missing columns). */
export function specWarnings(spec: ChartSpec, rows: Record<string, unknown>[] | null): string[] {
	const out: string[] = [];
	for (const key of Object.keys(spec)) if (!SPEC_KEYS.has(key)) out.push(`prism.chart: unknown key "${key}" (known: ${Array.from(SPEC_KEYS).join(", ")})`);
	if (spec.aggregate !== undefined && !AGGREGATES.includes(String(spec.aggregate))) {
		out.push(`prism.chart: aggregate must be one of ${AGGREGATES.join(", ")} (got "${String(spec.aggregate)}")`);
	}
	if ((spec.folder !== undefined || spec.tag !== undefined) && !isNotesSource(spec.source)) {
		out.push('prism.chart: "folder" and "tag" only apply to source: notes');
	}
	if (rows && rows.length) {
		const cols = columnsOf(rows);
		const counted = spec.aggregate === "count" ? ["count"] : [];
		const wanted = [spec.x, spec.series, ...toList(spec.y), ...Object.keys(spec.filter ?? {}), spec.sort?.replace(/^-/, "")]
			.filter(Boolean)
			.filter((c) => !counted.includes(c as string)) as string[];
		for (const c of wanted) if (!cols.includes(c)) out.push(`prism.chart: column "${c}" not found (columns: ${cols.join(", ")})`);
	}
	return out;
}

function toList(v: string | string[] | undefined): string[] {
	return v === undefined ? [] : Array.isArray(v) ? v.map(String) : [String(v)];
}

export function columnsOf(rows: Record<string, unknown>[] & { columns?: string[] }): string[] {
	if (Array.isArray(rows.columns)) return rows.columns;
	const cols: string[] = [];
	for (const r of rows.slice(0, 50)) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
	return cols;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return !!v && typeof v === "object" && !Array.isArray(v);
}

export function deepMerge(base: Record<string, unknown>, extra: Record<string, unknown> | undefined): Record<string, unknown> {
	if (!extra) return base;
	const out: Record<string, unknown> = { ...base };
	for (const [k, v] of Object.entries(extra)) out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
	return out;
}

/** Chart.js config for a spec and its (already loaded) rows. */
export function chartConfig(spec: ChartSpec, input: Record<string, unknown>[] | null): Record<string, unknown> {
	let type = spec.type || "bar";
	let options: Record<string, unknown> = { maintainAspectRatio: false, animation: { duration: 250 } };
	let fill = false;
	if (type === "area") {
		type = "line";
		fill = true;
	} else if (type === "hbar") {
		type = "bar";
		options.indexAxis = "y";
	}
	if (spec.title) options.plugins = { title: { display: true, text: spec.title } };
	if (spec.stacked && !SEGMENTED.has(type)) options.scales = { x: { stacked: true }, y: { stacked: true } };

	let data: { labels?: unknown[]; datasets: Record<string, unknown>[] };
	if (spec.data) {
		data = spec.data as typeof data;
	} else {
		let rows = (input ?? []).slice();
		if (spec.filter) rows = rows.filter((r) => Object.entries(spec.filter as object).every(([k, v]) => matches(r[k], v)));
		const cols = columnsOf(input ?? []);
		const x = spec.x ?? cols[0];
		let ys = toList(spec.y);
		if (!ys.length && spec.aggregate !== "count") ys = cols.filter((c) => c !== x && c !== spec.series && rows.some((r) => typeof r[c] === "number"));
		if (spec.aggregate) ({ rows, ys } = aggregateRows(rows, x, spec.series, ys, String(spec.aggregate)));
		if (spec.sort) {
			const desc = spec.sort.startsWith("-");
			const col = spec.sort.replace(/^-/, "");
			rows.sort((a, b) => compare(a[col], b[col]) * (desc ? -1 : 1));
		}
		if (spec.limit) rows = rows.slice(0, spec.limit);
		if (spec.series) {
			const labels = unique(rows.map((r) => r[x]));
			const groups = unique(rows.map((r) => r[spec.series as string]));
			const value = ys[0];
			data = {
				labels,
				datasets: groups.map((g) => ({
					label: String(g),
					data: labels.map((l) => {
						const hit = rows.find((r) => r[x] === l && r[spec.series as string] === g);
						return hit ? (hit[value] as number) ?? null : null;
					}),
				})),
			};
		} else if (SEGMENTED.has(type)) {
			data = { labels: rows.map((r) => r[x]), datasets: [{ label: ys[0], data: rows.map((r) => r[ys[0]]) }] };
		} else if (type === "scatter" || type === "bubble") {
			data = {
				datasets: [{ label: `${ys[0]} / ${x}`, data: rows.map((r) => ({ x: r[x], y: r[ys[0]], ...(ys[1] ? { r: r[ys[1]] } : {}) })) }],
			};
		} else {
			data = { labels: rows.map((r) => r[x]), datasets: ys.map((y) => ({ label: y, data: rows.map((r) => r[y] ?? null) })) };
		}
		if (fill) data.datasets.forEach((d) => (d.fill = spec.stacked ? "stack" : "origin"));
		if (data.datasets.length === 1 && !SEGMENTED.has(type)) options = deepMerge(options, { plugins: { legend: { display: false } } });
	}
	return { type, data, options: deepMerge(options, spec.options) };
}

/** Filter test: a list value (e.g. tags) matches when it contains the wanted value. */
function matches(cell: unknown, wanted: unknown): boolean {
	const one = (w: unknown) => (Array.isArray(cell) ? cell.includes(w) : cell === w);
	return Array.isArray(wanted) ? wanted.some(one) : one(wanted);
}

/**
 * Groups rows by x (and series) and reduces each group to one row: `count`
 * gives a "count" column; sum/avg/min/max reduce every y column. A list value
 * in x or series (e.g. tags) counts once for each of its items.
 */
/** Group label of rows without a value (aggregate). */
export const NONE = "(none)";

export function aggregateRows(rows: Record<string, unknown>[], x: string, series: string | undefined, ys: string[], how: string): { rows: Record<string, unknown>[]; ys: string[] } {
	const groups = new Map<string, { row: Record<string, unknown>; n: number; values: number[][] }>();
	// Empty values form their own group, labeled like a missing value in the legend.
	const items = (v: unknown): unknown[] => (Array.isArray(v) ? (v.length ? v : [NONE]) : [v === null || v === undefined || v === "" ? NONE : v]);
	for (const r of rows) {
		for (const xv of items(r[x])) {
			for (const sv of series ? items(r[series]) : [undefined]) {
				const key = JSON.stringify([xv, sv]);
				let g = groups.get(key);
				if (!g) {
					const row: Record<string, unknown> = { [x]: xv };
					if (series) row[series] = sv;
					groups.set(key, (g = { row, n: 0, values: ys.map(() => []) }));
				}
				g.n++;
				const values = g.values;
				ys.forEach((y, i) => {
					const v = r[y];
					if (typeof v === "number" && Number.isFinite(v)) values[i].push(v);
				});
			}
		}
	}
	const reduce = (vs: number[]): number | null => {
		if (!vs.length) return null;
		if (how === "sum") return vs.reduce((a, b) => a + b, 0);
		if (how === "avg") return vs.reduce((a, b) => a + b, 0) / vs.length;
		if (how === "min") return Math.min(...vs);
		if (how === "max") return Math.max(...vs);
		return vs.length;
	};
	const out = Array.from(groups.values()).map((g) => {
		if (how === "count") return { ...g.row, count: g.n };
		const row = { ...g.row };
		ys.forEach((y, i) => (row[y] = reduce(g.values[i])));
		return row;
	});
	return { rows: out, ys: how === "count" ? ["count"] : ys };
}

export function isNotesSource(source: unknown): boolean {
	return typeof source === "string" && /^\s*notes\s*$/i.test(source);
}

/**
 * One row per note for `source: notes`: title first (the default x), then the
 * frontmatter properties, then folder, path, modified (YYYY-MM-DD) and tags.
 */
export function noteRows(notes: NoteMeta[]): Record<string, unknown>[] & { columns: string[] } {
	// These columns come from the note itself (title: frontmatter title or file name).
	const reserved = ["title", "folder", "path", "modified", "tags", "position"];
	const props: string[] = [];
	for (const n of notes) for (const k of Object.keys(n.frontmatter ?? {})) if (!props.includes(k) && !reserved.includes(k)) props.push(k);
	const rows = notes.map((n) => {
		const row: Record<string, unknown> = { title: n.title };
		for (const k of props) row[k] = n.frontmatter?.[k] ?? null;
		row.folder = n.folder;
		row.path = n.path;
		row.modified = new Date(n.mtime).toISOString().slice(0, 10);
		row.tags = n.tags.slice();
		return row;
	}) as Record<string, unknown>[] & { columns: string[] };
	rows.columns = ["title", ...props, "folder", "path", "modified", "tags"];
	return rows;
}

function unique(values: unknown[]): unknown[] {
	const out: unknown[] = [];
	for (const v of values) if (!out.includes(v)) out.push(v);
	return out;
}

function compare(a: unknown, b: unknown): number {
	if (typeof a === "number" && typeof b === "number") return a - b;
	return toText(a).localeCompare(toText(b), undefined, { numeric: true });
}
