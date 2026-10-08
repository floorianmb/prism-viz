// Declarative charts: turns a small spec plus table rows into a Chart.js
// config. Used by prism.chart() and by ```viz chart blocks that contain YAML
// or JSON instead of HTML.


export interface ChartSpec {
	/** Chart.js type, plus "area" (filled line) and "hbar" (horizontal bars). */
	type?: string;
	/** "^block-id" or "table:<heading>" (table of this note), a data file path, or inline rows. */
	source?: string | Record<string, unknown>[];
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
const SPEC_KEYS = new Set(["type", "source", "rows", "x", "y", "series", "filter", "sort", "limit", "stacked", "title", "height", "options", "data"]);

/** Problems a spec author should hear about (unknown keys, missing columns). */
export function specWarnings(spec: ChartSpec, rows: Record<string, unknown>[] | null): string[] {
	const out: string[] = [];
	for (const key of Object.keys(spec)) if (!SPEC_KEYS.has(key)) out.push(`prism.chart: unknown key "${key}" (known: ${Array.from(SPEC_KEYS).join(", ")})`);
	if (rows && rows.length) {
		const cols = columnsOf(rows);
		const wanted = [spec.x, spec.series, ...toList(spec.y), ...Object.keys(spec.filter ?? {}), spec.sort?.replace(/^-/, "")].filter(Boolean) as string[];
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
		if (spec.filter) rows = rows.filter((r) => Object.entries(spec.filter as object).every(([k, v]) => (Array.isArray(v) ? v.includes(r[k]) : r[k] === v)));
		if (spec.sort) {
			const desc = spec.sort.startsWith("-");
			const col = spec.sort.replace(/^-/, "");
			rows.sort((a, b) => compare(a[col], b[col]) * (desc ? -1 : 1));
		}
		if (spec.limit) rows = rows.slice(0, spec.limit);
		const cols = columnsOf(input ?? []);
		const x = spec.x ?? cols[0];
		let ys = toList(spec.y);
		if (!ys.length) ys = cols.filter((c) => c !== x && c !== spec.series && rows.some((r) => typeof r[c] === "number"));
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

function unique(values: unknown[]): unknown[] {
	const out: unknown[] = [];
	for (const v of values) if (!out.includes(v)) out.push(v);
	return out;
}

function compare(a: unknown, b: unknown): number {
	if (typeof a === "number" && typeof b === "number") return a - b;
	return String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true });
}
