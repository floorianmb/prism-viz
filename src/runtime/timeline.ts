// type: timeline – drawn by Prism as SVG (see svgCharts.ts for the shared helpers).
// A Gantt chart: one row per task/note, a bar from start to end (end day
// inclusive), a diamond when only one date is known.

import { toText } from "../util";
import { ChartSpec, columnsOf, compare } from "./chartSpec";
import { isoDay, localToday } from "./periods";
import { createDiv, createEl, createSpan, createSvg } from "./dom";
import { Cell, SvgChartDeps, SvgResult, filtered, interact, start, text } from "./svgCharts";

type Row = Record<string, unknown>;

const WIDTH = 760;
const ROW = 24;
const BAR = 14;
const TOP = 30;
const MAX_ROWS = 200;
const MAX_LABEL = 34;
const DAY = 86400000;

export interface TimelineItem {
	row: Row;
	label: string;
	/** Row index in the drawn order. */
	index: number;
	kind: "bar" | "milestone";
	/** Pixels: x1 = x2 for a milestone (its center). */
	x1: number;
	x2: number;
	start: string | null;
	end: string | null;
	series: string | null;
	done: boolean;
}

export interface TimelineLayout {
	items: TimelineItem[];
	ticks: { x: number; label: string }[];
	todayX: number | null;
	/** Rows without any date. */
	hidden: number;
	/** Rows with dates beyond the row cap. */
	more: number;
	/** Rows whose end lies before their start (drawn as milestones). */
	reversed: number;
	/** Distinct series values in order of appearance. */
	series: string[];
	warnings: string[];
	labelWidth: number;
	height: number;
}

const dayNum = (s: string) => Date.parse(s) / DAY;

/** The pure layout of a timeline: positions in px of a 760 wide viewBox. */
export function timelineLayout(spec: ChartSpec, rows: Row[], today: string, locale: string): TimelineLayout {
	const cols = columnsOf(rows);
	const first = (names: string[]) => names.find((c) => cols.includes(c));
	const warnings: string[] = [];
	const col = (given: string | undefined, fallback: string[], what: string) => {
		if (given === undefined) return first(fallback);
		if (!cols.includes(given) && rows.length) warnings.push(`prism.chart: ${what} column "${given}" not found`);
		return given;
	};
	const x = spec.x ?? first(["text", "title"]) ?? cols[0];
	const startCol = col(spec.start, ["start", "scheduled", "date"], "start");
	const endCol = col(spec.end, ["end", "due"], "end");
	for (const key of ["stacked", "lines", "goal", "group"] as const) if (spec[key] !== undefined) warnings.push(`prism.chart: "${key}" does not apply to type: timeline`);

	interface Draft { row: Row; label: string; s: string | null; e: string | null; kind: "bar" | "milestone"; a: number; b: number }
	const drafts: Draft[] = [];
	let hidden = 0;
	let reversed = 0;
	for (const row of filtered(spec, rows)) {
		const s = startCol ? isoDay(row[startCol]) : null;
		const e = endCol ? isoDay(row[endCol]) : null;
		if (!s && !e) {
			hidden++;
			continue;
		}
		const label = x ? toText(row[x]) : "";
		if (s && e && dayNum(e) >= dayNum(s)) drafts.push({ row, label, s, e, kind: "bar", a: dayNum(s), b: dayNum(e) + 1 });
		else {
			if (s && e) reversed++;
			const d = dayNum((s ?? e) as string);
			drafts.push({ row, label, s, e, kind: "milestone", a: d + 0.5, b: d + 0.5 });
		}
	}
	if (reversed) warnings.push(`prism.chart: ${reversed} row${reversed === 1 ? "" : "s"} with end before start drawn as milestone${reversed === 1 ? "" : "s"}`);

	if (spec.sort) {
		const desc = spec.sort.startsWith("-");
		const c = spec.sort.replace(/^-/, "");
		drafts.sort((p, q) => compare(p.row[c], q.row[c]) * (desc ? -1 : 1));
	} else drafts.sort((p, q) => p.a - q.a || (p.e ? dayNum(p.e) : p.a) - (q.e ? dayNum(q.e) : q.a) || compare(p.label, q.label));
	const cap = spec.limit ? spec.limit : MAX_ROWS;
	const shown = drafts.slice(0, cap);
	const more = spec.limit ? 0 : drafts.length - shown.length;

	const labelWidth = Math.round(Math.max(140, Math.min(240, WIDTH * 0.3)));
	const left = labelWidth + 8;
	const right = WIDTH - 10;
	const height = TOP + shown.length * ROW + 6;
	const empty = { ticks: [], todayX: null, series: [] as string[], warnings, labelWidth, height, hidden, more, reversed };
	if (!shown.length) return { items: [], ...empty };

	const lo0 = Math.min(...shown.map((d) => d.a));
	const hi0 = Math.max(...shown.map((d) => d.b));
	const pad = Math.max((hi0 - lo0) * 0.02, 0.5);
	const lo = lo0 - pad;
	const hi = hi0 + pad;
	const px = (d: number) => left + ((d - lo) / (hi - lo)) * (right - left);

	const seriesCol = spec.series;
	const series: string[] = [];
	const items = shown.map((d, index): TimelineItem => {
		let s: string | null = null;
		if (seriesCol) {
			s = toText(d.row[seriesCol]);
			if (!series.includes(s)) series.push(s);
		}
		return { row: d.row, label: d.label, index, kind: d.kind, x1: px(d.a), x2: px(d.b), start: d.s, end: d.e, series: s, done: d.row.done === true };
	});

	// Tick unit by span: days, Monday weeks, months, years (dates are UTC days).
	const span = hi - lo;
	const unit = span <= 21 ? "day" : span <= 120 ? "week" : span <= 1096 ? "month" : "year";
	const fmt = new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...(unit === "year" ? { year: "numeric" } : unit === "month" ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" }) });
	const t0 = new Date(Math.floor(lo) * DAY);
	let t = unit === "day" ? t0.getTime() : unit === "week" ? t0.getTime() - ((t0.getUTCDay() + 6) % 7) * DAY : Date.UTC(t0.getUTCFullYear(), unit === "month" ? t0.getUTCMonth() : 0, 1);
	const ticks: { x: number; label: string }[] = [];
	while (t / DAY <= hi && ticks.length < 1000) {
		if (t / DAY >= lo) ticks.push({ x: px(t / DAY), label: fmt.format(t) });
		const d = new Date(t);
		t = unit === "day" ? t + DAY : unit === "week" ? t + 7 * DAY : unit === "month" ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) : Date.UTC(d.getUTCFullYear() + 1, 0, 1);
	}
	// Keep labels apart: grid lines stay, every n-th label is shown.
	const gap = ticks.length > 1 ? ticks[1].x - ticks[0].x : right - left;
	const stride = Math.max(1, Math.ceil(52 / gap));
	ticks.forEach((k, i) => {
		if (i % stride) k.label = "";
	});

	const td = isoDay(today);
	const todayN = td ? dayNum(td) + 0.5 : NaN;
	const todayX = todayN >= lo && todayN <= hi ? px(todayN) : null;
	return { items, ticks, todayX, hidden, more, reversed, series, warnings, labelWidth, height };
}

const trunc = (s: string) => (s.length > MAX_LABEL ? s.slice(0, MAX_LABEL - 1) + "…" : s);

export function renderTimeline(container: HTMLElement, spec: ChartSpec, rows: Row[], deps: SvgChartDeps): SvgResult {
	const de = deps.locale.startsWith("de");
	const L = timelineLayout(spec, rows, localToday(), deps.locale);
	const frame = start(container, spec, "prism-timeline");
	const table = { columns: [] as string[], rows: [] as unknown[][] };
	const cols = columnsOf(rows);
	const x = spec.x ?? (cols.includes("text") ? "text" : cols.includes("title") ? "title" : cols[0]);
	table.columns = [x ?? "", spec.start ?? "start", spec.end ?? "end"];
	const note = (msg: string) => void (frame.root.appendChild(createDiv("muted")).textContent = msg);
	if (!L.items.length) {
		note(de ? "Keine Daten: keine Zeilen mit Datum." : "No data: no rows with dates.");
		if (L.hidden) note(de ? `${L.hidden} ohne Datum ausgeblendet` : `${L.hidden} without dates hidden`);
		return { table, warnings: L.warnings.length ? L.warnings : undefined };
	}
	const c = deps.colors;
	const svg = frame.svg(WIDTH, L.height);
	const line = (x1: number, y1: number, y2: number, stroke: string, dash?: string) => {
		const l = svg.appendChild(createSvg("line"));
		l.setAttribute("x1", x1.toFixed(1));
		l.setAttribute("x2", x1.toFixed(1));
		l.setAttribute("y1", String(y1));
		l.setAttribute("y2", String(y2));
		l.setAttribute("stroke", stroke);
		if (dash) l.setAttribute("stroke-dasharray", dash);
	};
	for (const k of L.ticks) {
		line(k.x, 16, L.height - 6, c.levels[0]);
		if (k.label) {
			text(svg, k.label, k.x, 11, c);
			(svg.lastChild as SVGElement).setAttribute("text-anchor", "middle");
		}
	}
	const accent = c.palette[0];
	if (L.todayX !== null) {
		line(L.todayX, 16, L.height - 6, accent, "4 3");
		text(svg, de ? "Heute" : "Today", L.todayX, 25, c);
		(svg.lastChild as SVGElement).setAttribute("text-anchor", "middle");
		(svg.lastChild as SVGElement).setAttribute("fill", accent);
	}
	const dateFmt = new Intl.DateTimeFormat(deps.locale, { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
	const show = (d: string | null) => (d ? dateFmt.format(Date.parse(d)) : "");
	const cells: Cell[] = [];
	for (const it of L.items) {
		const mid = TOP + it.index * ROW + ROW / 2;
		text(svg, trunc(it.label), 0, mid + 3.5, c);
		const color = it.series === null ? accent : c.palette[L.series.indexOf(it.series) % c.palette.length];
		let el: SVGElement;
		if (it.kind === "bar") {
			el = svg.appendChild(createSvg("rect"));
			el.setAttribute("x", it.x1.toFixed(1));
			el.setAttribute("y", String(mid - BAR / 2));
			el.setAttribute("width", Math.max(2, it.x2 - it.x1).toFixed(1));
			el.setAttribute("height", String(BAR));
			el.setAttribute("rx", "3");
		} else {
			const r = BAR / 2;
			el = svg.appendChild(createSvg("path"));
			el.setAttribute("d", `M${it.x1.toFixed(1)},${mid - r}L${(it.x1 + r).toFixed(1)},${mid}L${it.x1.toFixed(1)},${mid + r}L${(it.x1 - r).toFixed(1)},${mid}Z`);
		}
		el.setAttribute("fill", color);
		if (it.done) el.setAttribute("opacity", "0.45");
		const dates = it.kind === "bar" ? `${show(it.start)} – ${show(it.end)}` : show(it.start ?? it.end);
		const label = `${it.label}: ${dates}`;
		el.appendChild(createSvg("title")).textContent = label;
		cells.push({ el, key: it.row[x ?? ""], item: { key: toText(it.row[x ?? ""]), value: null, rows: [it.row] }, label });
		table.rows.push([it.row[x ?? ""] ?? null, it.start, it.end]);
	}
	if (L.series.length) {
		const legend = frame.root.appendChild(createDiv("prism-svgchart-legend"));
		L.series.forEach((s, i) => {
			const sw = legend.appendChild(createEl("i"));
			sw.style.setProperty("background", c.palette[i % c.palette.length]);
			legend.appendChild(createSpan()).textContent = s;
		});
	}
	if (L.hidden) note(de ? `${L.hidden} ohne Datum ausgeblendet` : `${L.hidden} without dates hidden`);
	if (L.more) note(de ? `${L.more} weitere Zeilen nicht angezeigt` : `${L.more} more rows not shown`);
	interact(frame.root, svg, cells, spec, deps);
	return { table, warnings: L.warnings.length ? L.warnings : undefined };
}
