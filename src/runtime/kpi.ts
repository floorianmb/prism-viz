// type: kpi – big-number tiles with optional trend (sparkline, change vs. the
// previous period) and goal bar. Drawn by Prism (see svgCharts.ts for the shared helpers).

import { toText } from "../util";
import { ChartSpec, aggregateRows } from "./chartSpec";
import { PERIODS, localToday, periodOf, periodRange } from "./periods";
import { SvgChartDeps, SvgResult, filtered, numeric, start } from "./svgCharts";
import { createDiv, createSvg } from "./dom";

type Row = Record<string, unknown>;

export interface KpiTile {
	label: string;
	/** The y column (null: row count). */
	y: string | null;
	/** Whole data without group, the current period with group (null: no value). */
	value: number | null;
	/** The period before the current one (null without group or value). */
	previous: number | null;
	/** One value per period (empty without group). */
	series: (number | null)[];
}

export interface KpiResult {
	tiles: KpiTile[];
	/** Period labels of `series` (empty without group). */
	periods: string[];
	group: string | null;
	warnings: string[];
}

const SPARK_POINTS = 24;

/** Aggregate of one set of rows for a y column (null y: row count). Empty set: 0 for count and sum, else null. */
function reduceRows(rows: Row[], y: string | null, how: string): number | null {
	if (!y || how === "count") return rows.length;
	if (!rows.length) return how === "sum" ? 0 : null;
	const typed = rows.map((r) => ({ ...r, [y]: numeric(r[y]) }));
	return (aggregateRows(typed, "__key", undefined, [y], how).rows[0]?.[y] as number | null) ?? null;
}

/** The tiles of a kpi spec; `today` is YYYY-MM-DD. Rows are already filtered. */
export function kpiValues(spec: ChartSpec, rows: Row[], today: string, locale = "en"): KpiResult {
	const de = locale.startsWith("de");
	const warnings: string[] = [];
	for (const k of ["select", "lines", "series", "stacked"] as const) if (spec[k]) warnings.push(`prism.chart: "${k}" does not apply to type kpi`);
	const ys = (Array.isArray(spec.y) ? spec.y : spec.y ? [spec.y] : []).map(String);
	const how = String(spec.aggregate ?? (ys.length ? "sum" : "count"));
	let group = spec.group && PERIODS.includes(String(spec.group)) ? String(spec.group) : null;
	const x = spec.x;
	if (group && !x) {
		warnings.push('prism.chart: type kpi needs "x" (a date column) for group');
		group = null;
	}
	const cols: (string | null)[] = ys.length ? ys : [null];
	const labelOf = (y: string | null) => y ?? (de ? "Anzahl" : "Count");
	if (!group || !x) {
		const tiles = cols.map((y) => ({ label: labelOf(y), y, value: rows.length ? reduceRows(rows, y, how) : null, previous: null, series: [] }));
		return { tiles, periods: [], group: null, warnings };
	}
	const buckets = new Map<string, Row[]>();
	for (const r of rows) {
		const p = periodOf(r[x], group);
		if (p === null) continue;
		const b = buckets.get(p);
		if (b) b.push(r);
		else buckets.set(p, [r]);
	}
	const labels = Array.from(buckets.keys()).sort();
	let periods: string[] = [];
	if (labels.length) {
		const now = periodOf(today, group) as string;
		periods = periodRange(labels[0], now > labels[labels.length - 1] ? now : labels[labels.length - 1], group);
	}
	const tiles = cols.map((y) => {
		const series = periods.map((p) => (buckets.has(p) ? reduceRows(buckets.get(p) as Row[], y, how) : how === "count" || how === "sum" ? 0 : null));
		const n = series.length;
		return { label: labelOf(y), y, value: n ? series[n - 1] : null, previous: n > 1 ? series[n - 2] : null, series };
	});
	return { tiles, periods, group, warnings };
}

/** Change to the previous period: a ratio when the previous value is non-zero, else the absolute difference; null without both values. */
export function kpiDelta(value: number | null, previous: number | null): { kind: "percent" | "abs"; amount: number } | null {
	if (value === null || previous === null) return null;
	return previous !== 0 ? { kind: "percent", amount: (value - previous) / Math.abs(previous) } : { kind: "abs", amount: value - previous };
}

/** Progress towards a goal: percent (unclamped, for the text) and whether it is reached. */
export function kpiGoal(value: number | null, goal: number): { percent: number; reached: boolean } | null {
	if (value === null || !Number.isFinite(goal) || goal === 0) return null;
	return { percent: (value / goal) * 100, reached: value >= goal };
}

/** Number formats of prelude's format() (number | integer | percent | eur | usd); null shows as "–". */
export function formatKpi(value: number | null, kind: string | undefined, digits: number | undefined, locale: string): string {
	if (value === null) return "–";
	const opts: Intl.NumberFormatOptions =
		kind === "percent" ? { style: "percent", maximumFractionDigits: digits ?? 1 }
		: kind === "eur" || kind === "usd" ? { style: "currency", currency: kind.toUpperCase(), maximumFractionDigits: digits ?? 0 }
		: kind === "integer" ? { maximumFractionDigits: 0 }
		: { minimumFractionDigits: digits ?? 0, maximumFractionDigits: digits ?? 2 };
	// Like format(): values above 100 % are taken as already multiplied by 100.
	return new Intl.NumberFormat(locale, opts).format(kind === "percent" && Math.abs(value) > 1 ? value / 100 : value);
}

const VS: Record<string, [string, string]> = {
	day: ["Vortag", "day"],
	week: ["Vorwoche", "week"],
	month: ["Vormonat", "month"],
	quarter: ["Vorquartal", "quarter"],
	year: ["Vorjahr", "year"],
};

const SPARK_W = 120;
const SPARK_H = 32;
const SPARK_PAD = 3;

function sparkline(tile: KpiTile, periods: string[], fmt: (n: number | null) => string, color: string): SVGSVGElement {
	const from = Math.max(0, tile.series.length - SPARK_POINTS);
	const values = tile.series.slice(from);
	const names = periods.slice(from);
	const nums = values.filter((v): v is number => v !== null);
	const lo = Math.min(...nums);
	const hi = Math.max(...nums);
	const px = (i: number) => (values.length > 1 ? SPARK_PAD + (i * (SPARK_W - 2 * SPARK_PAD)) / (values.length - 1) : SPARK_W / 2);
	const py = (v: number) => (hi === lo ? SPARK_H / 2 : SPARK_H - SPARK_PAD - ((v - lo) / (hi - lo)) * (SPARK_H - 2 * SPARK_PAD));
	const svg = createSvg("svg");
	svg.setAttribute("viewBox", `0 0 ${SPARK_W} ${SPARK_H}`);
	svg.setAttribute("class", "prism-kpi-spark");
	svg.setAttribute("role", "img");
	svg.setAttribute("aria-label", tile.label);
	let run: string[] = [];
	const flush = () => {
		if (run.length > 1) {
			const line = svg.appendChild(createSvg("polyline"));
			line.setAttribute("points", run.join(" "));
			line.setAttribute("fill", "none");
			line.setAttribute("stroke", color);
			line.setAttribute("stroke-width", "1.5");
			line.setAttribute("stroke-linejoin", "round");
			line.setAttribute("stroke-linecap", "round");
			line.setAttribute("vector-effect", "non-scaling-stroke");
		}
		run = [];
	};
	values.forEach((v, i) => {
		if (v === null) return flush();
		run.push(`${px(i).toFixed(1)},${py(v).toFixed(1)}`);
		if (values[i + 1] === undefined || values[i + 1] === null) flush();
	});
	values.forEach((v, i) => {
		if (v === null) return;
		const last = i === values.length - 1;
		const dot = svg.appendChild(createSvg("circle"));
		dot.setAttribute("cx", px(i).toFixed(1));
		dot.setAttribute("cy", py(v).toFixed(1));
		dot.setAttribute("r", last ? "2.5" : "4");
		dot.setAttribute("fill", last ? color : "transparent");
		dot.appendChild(createSvg("title")).textContent = `${names[i]}: ${fmt(v)}`;
	});
	return svg;
}

export function renderKpi(container: HTMLElement, spec: ChartSpec, rows: Row[], deps: SvgChartDeps): SvgResult {
	const de = deps.locale.startsWith("de");
	const result = kpiValues(spec, filtered(spec, rows), localToday(), deps.locale);
	const digits = typeof spec.digits === "number" ? spec.digits : undefined;
	const kindOf = (t: KpiTile) => (typeof spec.format === "object" && spec.format ? spec.format[t.label] : spec.format) as string | undefined;
	const color = deps.colors.palette[0];
	const frame = start(container, spec, "prism-kpi");
	const grid = frame.root.appendChild(createDiv("prism-kpi-grid"));
	const percent = new Intl.NumberFormat(deps.locale, { style: "percent", maximumFractionDigits: 0 });
	const goal = typeof spec.goal === "number" ? spec.goal : Number(spec.goal);
	for (const tile of result.tiles) {
		const fmt = (n: number | null) => formatKpi(n, kindOf(tile), digits, deps.locale);
		const el = grid.appendChild(createDiv("prism-kpi-tile"));
		el.appendChild(createDiv("prism-kpi-label")).textContent = tile.label;
		el.appendChild(createDiv("prism-kpi-value")).textContent = fmt(tile.value);
		const delta = kpiDelta(tile.value, tile.previous);
		if (delta && result.group) {
			const row = el.appendChild(createDiv(`prism-kpi-delta ${delta.amount > 0 ? "is-up" : delta.amount < 0 ? "is-down" : ""}`));
			const sign = delta.amount > 0 ? "▲ " : delta.amount < 0 ? "▼ " : "";
			const amount = delta.kind === "percent" ? percent.format(Math.abs(delta.amount)).replace(/\s/g, " ") : new Intl.NumberFormat(deps.locale, { signDisplay: "exceptZero", maximumFractionDigits: 2 }).format(delta.amount);
			const [d, e] = VS[result.group];
			row.textContent = `${delta.kind === "percent" ? sign : ""}${amount} ${de ? `ggü. ${d}` : `vs. previous ${e}`}`;
		}
		if (result.group && tile.series.some((v) => v !== null)) el.appendChild(sparkline(tile, result.periods, fmt, color));
		const g = Number.isFinite(goal) ? kpiGoal(tile.value, goal) : null;
		if (g) {
			const bar = el.appendChild(createDiv("prism-kpi-goal"));
			const fill = bar.appendChild(createDiv("prism-kpi-goal-fill"));
			fill.style.setProperty("width", `${Math.max(0, Math.min(100, g.percent))}%`);
			fill.style.setProperty("background", color);
			const pct = percent.format(g.percent / 100).replace(/\s/g, " ");
			el.appendChild(createDiv("prism-kpi-goal-text")).textContent = g.reached ? `✓ ${pct} ${de ? "von" : "of"} ${fmt(goal)}` : `${pct} ${de ? "von" : "of"} ${fmt(goal)}`;
		}
	}
	const labels = result.tiles.map((t) => t.label);
	const table = result.group
		? { columns: [toText(spec.x), ...labels], rows: result.periods.map((p, i) => [p, ...result.tiles.map((t) => t.series[i])]) }
		: { columns: labels, rows: [result.tiles.map((t) => t.value)] };
	return { table, warnings: result.warnings.length ? result.warnings : undefined };
}
