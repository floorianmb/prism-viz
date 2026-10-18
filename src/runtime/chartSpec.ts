// Declarative charts: turns a small spec plus table rows into a Chart.js
// config. Used by prism.chart() and by ```viz chart blocks that contain YAML
// or JSON instead of HTML.


import { toText } from "../util";
import { PERIODS, periodOf, periodRange } from "./periods";
import type { NoteMeta } from "../protocol";

export interface ChartSpec {
	/** Chart.js type, plus "area" (filled line), "hbar" (horizontal bars), "calendar" (heatmap of days) and "map" (GeoJSON regions). */
	type?: string;
	/** "^block-id" or "table:<heading>" (table of this note), "notes" (frontmatter of notes), "tasks" (tasks of notes), a data file path, or inline rows. */
	source?: string | Record<string, unknown>[];
	/** With `source: notes` / `tasks`: only notes in this folder (and below). */
	folder?: string;
	/** With `source: notes` / `tasks`: only notes with this tag (and its subtags). */
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
	/** Keep only rows whose columns equal these values; "$shared.key" uses the value of prism.shared (ignored while unset). */
	filter?: Record<string, unknown>;
	/** Name of a prism.shared key: clicking a label (bar, segment, day, region) sets it to that x value; clicking it again clears it. */
	select?: string;
	/** type: map – GeoJSON data file with the regions. */
	geo?: string;
	/** type: map – feature property that matches the x values (default: the property with the most matches). */
	geoKey?: string;
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
	/** Dates in x are grouped into periods: day | week | month | quarter | year. */
	group?: string;
	/** Reference lines: { y: 30, label: "Goal" } on the value axis, { x: "2026-10" } on the label axis. */
	lines?: ReferenceLine[];
	/** A goal: a reference line on charts, a progress bar on type: kpi. */
	goal?: number;
	/** New columns computed per row: { pace: "pages / days" } (see compute.ts). */
	compute?: Record<string, string>;
	/** type: timeline – start and end date columns. */
	start?: string;
	end?: string;
	/** type: graph / sankey – columns of the two ends of a link (default "from" and "to"). */
	from?: string;
	to?: string;
	/** type: kpi – number format (number | integer | percent | eur | usd), for all values or per column. */
	format?: string | Record<string, string>;
	/** type: kpi – fraction digits. */
	digits?: number;
}

export interface ReferenceLine {
	x?: string | number;
	y?: number;
	label?: string;
	color?: string;
	/** Set for the `goal` shorthand (gets a default label). */
	goal?: boolean;
}

const SEGMENTED = new Set(["pie", "doughnut", "polarArea"]);
const SPEC_KEYS = new Set(["type", "source", "folder", "tag", "rows", "x", "y", "series", "filter", "select", "aggregate", "sort", "limit", "stacked", "title", "height", "options", "data", "geo", "geoKey", "group", "lines", "goal", "compute", "start", "end", "from", "to", "format", "digits"]);
/** Chart types Prism draws itself as SVG (no Chart.js). */
export const SVG_TYPES = new Set(["calendar", "map", "kpi", "timeline", "graph", "sankey"]);
const AGGREGATES = ["count", "sum", "avg", "min", "max"];
/** Chart.js types with a value axis that reference lines can mark. */
const LINE_TYPES = new Set(["bar", "line", "scatter", "bubble"]);
const NO_GROUP = new Set(["calendar", "map", "graph", "sankey", "timeline"]);

/** Problems a spec author should hear about (unknown keys, missing columns). */
export function specWarnings(spec: ChartSpec, rows: Record<string, unknown>[] | null): string[] {
	const out: string[] = [];
	for (const key of Object.keys(spec)) if (!SPEC_KEYS.has(key)) out.push(`prism.chart: unknown key "${key}" (known: ${Array.from(SPEC_KEYS).join(", ")})`);
	if (spec.aggregate !== undefined && !AGGREGATES.includes(String(spec.aggregate))) {
		out.push(`prism.chart: aggregate must be one of ${AGGREGATES.join(", ")} (got "${String(spec.aggregate)}")`);
	}
	if ((spec.folder !== undefined || spec.tag !== undefined) && !isNotesSource(spec.source) && !isTasksSource(spec.source) && !isLinksSource(spec.source)) {
		out.push('prism.chart: "folder" and "tag" only apply to source: notes, tasks and links');
	}
	if (spec.type === "map" && !spec.geo) out.push('prism.chart: type map needs "geo": a GeoJSON data file with the regions');
	if ((spec.geo !== undefined || spec.geoKey !== undefined) && spec.type !== "map") out.push('prism.chart: "geo" and "geoKey" only apply to type: map');
	if (spec.type && SVG_TYPES.has(spec.type)) {
		// A timeline colors its bars by series.
		for (const key of ["series", "stacked", "options", "data"] as const) if (spec[key] !== undefined && !(key === "series" && spec.type === "timeline")) out.push(`prism.chart: "${key}" does not apply to type: ${spec.type}`);
	}
	if (spec.group !== undefined) {
		if (!PERIODS.includes(String(spec.group))) out.push(`prism.chart: group must be one of ${PERIODS.join(", ")} (got "${String(spec.group)}")`);
		else if (spec.type && NO_GROUP.has(spec.type)) out.push(`prism.chart: "group" does not apply to type: ${spec.type}`);
	}
	if (spec.lines !== undefined && (!Array.isArray(spec.lines) || !spec.lines.every((l) => isPlainObject(l) && (typeof l.y === "number" || (l.x !== undefined && l.x !== null))))) {
		out.push('prism.chart: lines must be a list of objects with a numeric "y" or an "x", e.g. [{ y: 30, label: "Goal" }]');
	}
	if ((spec.lines !== undefined || spec.goal !== undefined) && spec.type && spec.type !== "kpi" && !LINE_TYPES.has(spec.type) && spec.type !== "area" && spec.type !== "hbar") {
		out.push(`prism.chart: "lines" and "goal" do not apply to type: ${spec.type}`);
	}
	if (rows && rows.length) {
		const cols = columnsOf(rows);
		if (PERIODS.includes(String(spec.group)) && !(spec.type && NO_GROUP.has(spec.type))) {
			const gx = spec.x ?? cols[0];
			const bad = rows.filter((r) => r[gx] !== null && r[gx] !== undefined && r[gx] !== "" && periodOf(r[gx], String(spec.group)) === null).length;
			if (bad) out.push(`prism.chart: ${bad} rows have no date in "${gx}" and are left out (group: ${spec.group})`);
		}
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
		const group = PERIODS.includes(String(spec.group)) && !SVG_TYPES.has(type) ? String(spec.group) : null;
		if (group) {
			rows = rows.flatMap((r) => {
				const label = periodOf(r[x], group);
				return label ? [{ ...r, [x]: label }] : [];
			});
		}
		const how = spec.aggregate ?? (group ? (spec.y !== undefined ? "sum" : "count") : undefined);
		let ys = toList(spec.y);
		if (!ys.length && how !== "count") ys = cols.filter((c) => c !== x && c !== spec.series && rows.some((r) => typeof r[c] === "number"));
		if (how) ({ rows, ys } = aggregateRows(rows, x, spec.series, ys, String(how)));
		// shortcut: with `series` the periods without rows stay missing, upgrade when stacked series need a shared axis
		if (group && !spec.series && rows.length) {
			const labels = rows.map((r) => String(r[x])).sort();
			const have = new Set(labels);
			const empty = how === "count" || how === "sum" ? 0 : null;
			for (const label of periodRange(labels[0], labels[labels.length - 1], group)) {
				if (!have.has(label)) rows.push({ [x]: label, ...Object.fromEntries(ys.map((y) => [y, empty])) });
			}
		}
		if (group && !spec.sort) rows.sort((a, b) => compare(a[x], b[x]));
		if (spec.sort) {
			const desc = spec.sort.startsWith("-");
			const col = spec.sort.replace(/^-/, "");
			rows.sort((a, b) => compare(a[col], b[col]) * (desc ? -1 : 1));
		}
		if (spec.limit) rows = group && !spec.sort ? rows.slice(-spec.limit) : rows.slice(0, spec.limit);
		if (spec.series) {
			const labels = unique(rows.map((r) => r[x]));
			const groups = unique(rows.map((r) => r[spec.series as string]));
			const value = ys[0];
			// x -> series -> first row; NaN never matches (like ===), so it is not indexed
			const bySeries = new Map<unknown, Map<unknown, Record<string, unknown>>>();
			for (const r of rows) {
				const xv = r[x];
				const sv = r[spec.series];
				if (Number.isNaN(xv) || Number.isNaN(sv)) continue;
				let m = bySeries.get(xv);
				if (!m) bySeries.set(xv, (m = new Map<unknown, Record<string, unknown>>()));
				if (!m.has(sv)) m.set(sv, r);
			}
			data = {
				labels,
				datasets: groups.map((g) => ({
					label: String(g),
					data: labels.map((l) => {
						const hit = bySeries.get(l)?.get(g);
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
	const lines = referenceLines(spec);
	if (lines.length && LINE_TYPES.has(type)) {
		const values = lines.flatMap((l) => (typeof l.y === "number" ? [l.y] : []));
		const scale: Record<string, number> = {};
		if (values.length) scale.suggestedMax = Math.max(...values);
		if (values.length && Math.min(...values) < 0) scale.suggestedMin = Math.min(...values);
		options = deepMerge(options, { plugins: { prismLines: { lines } }, scales: { [options.indexAxis === "y" ? "x" : "y"]: scale } });
	}
	return { type, data, options: deepMerge(options, spec.options) };
}

/** The valid reference lines of a spec (`lines` plus the `goal` shorthand). */
function referenceLines(spec: ChartSpec): ReferenceLine[] {
	const lines = (Array.isArray(spec.lines) ? spec.lines : []).filter((l) => isPlainObject(l) && (typeof l.y === "number" || (l.x !== undefined && l.x !== null)));
	return typeof spec.goal === "number" ? [...lines, { y: spec.goal, goal: true }] : lines;
}

/** Filter test: a list value (e.g. tags) matches when it contains the wanted value. */
export function matches(cell: unknown, wanted: unknown): boolean {
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
		const d = new Date(n.mtime); // local day, not UTC
		row.modified = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
		row.tags = n.tags.slice();
		return row;
	}) as Record<string, unknown>[] & { columns: string[] };
	rows.columns = ["title", ...props, "folder", "path", "modified", "tags"];
	return rows;
}

export function isTasksSource(source: unknown): boolean {
	return typeof source === "string" && /^\s*tasks\s*$/i.test(source);
}

/**
 * One row per task for `source: tasks`: text, done, status, the Tasks-plugin
 * dates and priority, tags, and the note it is in (note title, path, folder, line).
 */
export function taskRows(notes: NoteMeta[]): Record<string, unknown>[] & { columns: string[] } {
	const rows = [] as unknown as Record<string, unknown>[] & { columns: string[] };
	for (const n of notes) {
		for (const t of n.tasks ?? []) {
			rows.push({
				text: t.text,
				done: t.done,
				status: t.status,
				due: t.due ?? null,
				scheduled: t.scheduled ?? null,
				start: t.start ?? null,
				doneDate: t.doneDate ?? null,
				priority: t.priority ?? null,
				tags: t.tags.slice(),
				note: n.title,
				path: n.path,
				folder: n.folder,
				line: t.line,
			});
		}
	}
	rows.columns = ["text", "done", "status", "due", "scheduled", "start", "doneDate", "priority", "tags", "note", "path", "folder", "line"];
	return rows;
}

export function isLinksSource(source: unknown): boolean {
	return typeof source === "string" && /^\s*links\s*$/i.test(source);
}

/**
 * One row per link for `source: links` (notes queried with include: ["links"]):
 * from/to as note titles, their paths (toPath null when unresolved), and the
 * folder and tags of the linking note.
 * shortcut: resolved links are told apart by a file extension (the host sends paths
 * or link text in one list), so an unresolved [[v2.final]] counts as resolved; send a flag if that bites.
 */
export function linkRows(notes: NoteMeta[]): Record<string, unknown>[] & { columns: string[] } {
	const titles = new Map(notes.map((n) => [n.path, n.title]));
	const rows = [] as unknown as Record<string, unknown>[] & { columns: string[] };
	for (const n of notes) {
		for (const link of new Set(n.links ?? [])) {
			const resolved = /\.[a-z][a-z0-9]{0,5}$/i.test(link);
			// Notes only, like Obsidian's graph: links to images, PDFs and other attachments are left out.
			if (resolved && !/\.(md|canvas)$/i.test(link)) continue;
			rows.push({
				from: n.title,
				to: resolved ? titles.get(link) ?? link.replace(/^.*\//, "").replace(/\.[^.]+$/, "") : link,
				fromPath: n.path,
				toPath: resolved ? link : null,
				folder: n.folder,
				tags: n.tags.slice(),
			});
		}
	}
	rows.columns = ["from", "to", "fromPath", "toPath", "folder", "tags"];
	return rows;
}

const SHARED_REF = /^\$shared\.(.+)$/;

/** prism.shared keys a spec reads (`filter` values "$shared.key") or writes (`select`). */
export function sharedKeys(spec: { filter?: Record<string, unknown>; select?: unknown }): string[] {
	const keys = Object.values(spec.filter ?? {}).flatMap((v) => {
		const m = typeof v === "string" ? SHARED_REF.exec(v) : null;
		return m ? [m[1]] : [];
	});
	if (typeof spec.select === "string" && spec.select) keys.push(spec.select);
	return keys;
}

/**
 * The filter with "$shared.key" values replaced by prism.shared values. A
 * condition whose key is unset is dropped (nothing selected: show all rows),
 * and the "(none)" group of an aggregate matches empty cells.
 */
export function resolveFilter(filter: Record<string, unknown> | undefined, shared: (key: string) => unknown): Record<string, unknown> | undefined {
	if (!filter) return filter;
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(filter)) {
		const m = typeof v === "string" ? SHARED_REF.exec(v) : null;
		if (!m) {
			out[k] = v;
			continue;
		}
		const value = shared(m[1]);
		if (value === undefined || value === null) continue;
		out[k] = value === NONE ? [null, undefined, ""] : value;
	}
	return out;
}

/** The numbers a Chart.js config shows, as columns and rows (CSV export). */
export function chartTable(config: { data?: unknown }, labelColumn = "label"): { columns: string[]; rows: unknown[][] } {
	const data = (config.data ?? { datasets: [] }) as { labels?: unknown[]; datasets?: { label?: unknown; data?: unknown[] }[] };
	const datasets = data.datasets ?? [];
	const point = (p: unknown) => (p && typeof p === "object" ? (p as Record<string, unknown>) : null);
	// Scatter and bubble data are points without labels.
	if (!data.labels && datasets.some((d) => (d.data ?? []).some((p) => point(p)))) {
		const keys = ["x", "y", "r"].filter((k) => datasets.some((d) => (d.data ?? []).some((p) => point(p)?.[k] !== undefined)));
		const columns = datasets.length > 1 ? ["series", ...keys] : keys;
		const rows = datasets.flatMap((d) => (d.data ?? []).map((p) => [...(datasets.length > 1 ? [toText(d.label)] : []), ...keys.map((k) => point(p)?.[k] ?? null)]));
		return { columns, rows };
	}
	const labels = data.labels ?? (datasets[0]?.data ?? []).map((_, i) => i + 1);
	return {
		columns: [labelColumn, ...datasets.map((d, i) => toText(d.label) || `series ${i + 1}`)],
		rows: labels.map((l, i) => [l, ...datasets.map((d) => d.data?.[i] ?? null)]),
	};
}

function unique(values: unknown[]): unknown[] {
	const out: unknown[] = [];
	for (const v of values) if (!out.includes(v)) out.push(v);
	return out;
}

export function compare(a: unknown, b: unknown): number {
	if (typeof a === "number" && typeof b === "number") return a - b;
	return toText(a).localeCompare(toText(b), undefined, { numeric: true });
}
