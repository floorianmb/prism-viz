// Chart types Prism draws itself as SVG, for ```viz chart blocks and
// prism.chart(): "calendar" (one cell per day, like a contribution graph) and
// "map" (GeoJSON regions colored by value). Colors are five steps of the first
// palette color. They are set on the elements as resolved values (not only via
// CSS classes): PNG/SVG exports and snapshots copy inline styles of SVG
// elements, not stylesheet rules. The runtime redraws on theme changes.

import { toText } from "../util";
import { ChartSpec, aggregateRows, columnsOf } from "./chartSpec";
import { createDiv, createSvg } from "./dom";

type Row = Record<string, unknown>;

/** Resolved theme colors (no var()): levels[0] = no value, 1–4 low to high. */
export interface SvgColors {
	levels: string[];
	text: string;
	strong: string;
	stroke: string;
	font: string;
}

export interface SvgChartDeps {
	locale: string;
	colors: SvgColors;
	/** The current value of prism.shared[spec.select] (undefined: nothing selected). */
	selected: unknown;
	/** Toggles prism.shared[spec.select]; only called when the spec has `select`. */
	select(value: unknown): void;
	openNote(path: string): void;
}

/** One labeled value of a calendar or map. */
export interface Item {
	key: string;
	value: number | null;
	rows: Row[];
}

/* ------------------------------------------------------------------ values */

/** "YYYY-MM-DD" of a value that starts with a valid date (also "2026-10-18T09:00", "2026-10-18 Sat"), else null. */
export function isoDay(value: unknown): string | null {
	const m = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})(?=$|[T\s])/.exec(value.trim()) : null;
	if (!m) return null;
	const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
	return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? m[0] : null;
}

const numeric = (v: unknown): number | null => (typeof v === "boolean" ? (v ? 1 : 0) : typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Groups rows by `key(row)` into one value per key: the row count without `y`,
 * otherwise the sum (or spec.aggregate) of `y`. Booleans count as 1 and 0, so
 * `y: sport` with `sport: true/false` works.
 */
export function itemsBy(spec: ChartSpec, rows: Row[], key: (r: Row) => string | null): Map<string, Item> {
	const y = Array.isArray(spec.y) ? spec.y[0] : spec.y;
	const how = String(spec.aggregate ?? (y ? "sum" : "count"));
	const groups = new Map<string, Row[]>();
	for (const r of rows) {
		const k = key(r);
		if (k === null) continue;
		let g = groups.get(k);
		if (!g) groups.set(k, (g = []));
		g.push(r);
	}
	const out = new Map<string, Item>();
	for (const [k, g] of groups) {
		let value: number | null = g.length;
		if (how !== "count") {
			if (!y) value = null;
			else {
				const typed = g.map((r) => ({ ...r, [y]: numeric(r[y]) }));
				value = aggregateRows(typed, "__key", undefined, [y], how).rows[0]?.[y] as number | null;
			}
		}
		out.set(k, { key: k, value, rows: g });
	}
	return out;
}

/** Rows after `filter` (already resolved) – list cells match by containment, like charts. */
function filtered(spec: ChartSpec, rows: Row[]): Row[] {
	if (!spec.filter) return rows;
	const one = (cell: unknown, w: unknown) => (Array.isArray(cell) ? cell.includes(w) : cell === w);
	return rows.filter((r) => Object.entries(spec.filter as object).every(([k, v]) => (Array.isArray(v) ? v.some((w) => one(r[k], w)) : one(r[k], v))));
}

/** 1–4 for a value between min and max (0: no value). */
export function level(value: number | null, min: number, max: number): number {
	if (value === null) return 0;
	if (max === min) return 4;
	return 1 + Math.min(3, Math.floor(((value - min) / (max - min)) * 4));
}

function range(items: Iterable<Item>): { min: number; max: number } | null {
	let min = Infinity;
	let max = -Infinity;
	for (const it of items) {
		if (it.value === null) continue;
		min = Math.min(min, it.value);
		max = Math.max(max, it.value);
	}
	return min <= max ? { min, max } : null;
}

/* ---------------------------------------------------------------- calendar */

const STEP = 13;
const CELL = 11;
const LEFT = 32;
const ROW_LABELS = 14;
/** shortcut: only the most recent years are drawn; add paging if people chart decades of daily notes. */
const MAX_YEARS = 10;

/** Days of a calendar spec: x = date column (default: first column), value from y or the row count. */
export function calendarItems(spec: ChartSpec, rows: Row[]): Map<string, Item> {
	const x = spec.x ?? columnsOf(rows)[0];
	return itemsBy(spec, filtered(spec, rows), (r) => isoDay(r[x]));
}

/** Week column (Monday first) and weekday row of a day within its year. */
export function cellOf(day: string): { year: number; col: number; row: number } {
	const [y, m, d] = day.split("-").map(Number);
	const t = Date.UTC(y, m - 1, d);
	const jan1 = Date.UTC(y, 0, 1);
	const offset = (new Date(jan1).getUTCDay() + 6) % 7; // Monday = 0
	const dayOfYear = Math.round((t - jan1) / 86400000);
	return { year: y, col: Math.floor((dayOfYear + offset) / 7), row: (new Date(t).getUTCDay() + 6) % 7 };
}

export function renderCalendar(container: HTMLElement, spec: ChartSpec, rows: Row[], deps: SvgChartDeps): Map<string, Item> {
	const items = calendarItems(spec, rows);
	const years = Array.from(new Set(Array.from(items.keys()).map((d) => +d.slice(0, 4)))).sort((a, b) => a - b).slice(-MAX_YEARS);
	const frame = start(container, spec, "prism-cal");
	if (!years.length) {
		empty(frame, deps.locale, spec);
		return items;
	}
	const span = range(items.values());
	const dayFmt = new Intl.DateTimeFormat(deps.locale, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
	const monthFmt = new Intl.DateTimeFormat(deps.locale, { month: "short", timeZone: "UTC" });
	const weekdayFmt = new Intl.DateTimeFormat(deps.locale, { weekday: "short", timeZone: "UTC" });
	const numFmt = new Intl.NumberFormat(deps.locale, { maximumFractionDigits: 2 });
	const blockHeight = ROW_LABELS + 7 * STEP;
	const width = LEFT + 54 * STEP;
	const height = years.length * (blockHeight + 12);
	const svg = frame.svg(width, height);
	const cells: Cell[] = [];
	years.forEach((year, i) => {
		const top = i * (blockHeight + 12);
		text(svg, String(year), 0, top + 10, deps.colors, true);
		for (let m = 0; m < 12; m++) {
			const first = `${year}-${String(m + 1).padStart(2, "0")}-01`;
			text(svg, monthFmt.format(new Date(Date.UTC(year, m, 1))), LEFT + cellOf(first).col * STEP, top + 10, deps.colors);
		}
		// Mon, Wed, Fri; 2024-01-01 was a Monday.
		for (const row of [0, 2, 4]) text(svg, weekdayFmt.format(new Date(Date.UTC(2024, 0, 1 + row))), 0, top + ROW_LABELS + row * STEP + 9, deps.colors);
		const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
		for (let n = 0; n < days; n++) {
			const date = new Date(Date.UTC(year, 0, 1 + n));
			const day = date.toISOString().slice(0, 10);
			const pos = cellOf(day);
			const item = items.get(day);
			const label = `${dayFmt.format(date)}${item && item.value !== null ? `: ${numFmt.format(item.value)}` : ""}`;
			const rect = cell(svg, LEFT + pos.col * STEP, top + ROW_LABELS + pos.row * STEP, item && span ? level(item.value, span.min, span.max) : 0, label, deps.colors);
			if (item) cells.push({ el: rect, key: day, item, label });
		}
	});
	frame.legend(span, numFmt, deps.colors);
	interact(frame.root, svg, cells, spec, deps);
	return items;
}

/* --------------------------------------------------------------------- map */

type Position = number[];
interface Region {
	props: Record<string, unknown>;
	/** Rings of projected [x, y] points. */
	rings: Position[][];
}

const MAP_WIDTH = 800;
const MAP_MAX_HEIGHT = 560;

/** Web Mercator of [lon, lat] in degrees (latitude clamped like web maps). */
export function mercator([lon, lat]: Position): Position {
	const phi = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
	return [(lon * Math.PI) / 180, -Math.log(Math.tan(Math.PI / 4 + phi / 2))];
}

/**
 * Polygon and MultiPolygon features of a GeoJSON value (FeatureCollection,
 * Feature or geometry), projected. Points and lines are skipped.
 */
export function regionsOf(geo: unknown): Region[] {
	const out: Region[] = [];
	const add = (geometry: unknown, props: Record<string, unknown>) => {
		const g = geometry as { type?: string; coordinates?: unknown; geometries?: unknown[] } | null;
		if (!g) return;
		if (g.type === "GeometryCollection") (g.geometries ?? []).forEach((x) => add(x, props));
		const polygons = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? (g.coordinates as unknown[]) : [];
		const rings: Position[][] = [];
		for (const poly of polygons) for (const ring of (poly as Position[][]) ?? []) if (Array.isArray(ring) && ring.length > 2) rings.push(ring.map(mercator));
		if (rings.length) out.push({ props, rings });
	};
	const v = geo as { type?: string; features?: unknown[]; geometry?: unknown; properties?: Record<string, unknown> } | null;
	if (v?.type === "FeatureCollection") {
		for (const f of v.features ?? []) {
			const feature = f as { geometry?: unknown; properties?: Record<string, unknown> | null };
			add(feature.geometry, feature.properties ?? {});
		}
	} else if (v?.type === "Feature") add(v.geometry, v.properties ?? {});
	else add(v, {});
	return out;
}

const norm = (v: unknown) => toText(v).trim().toLowerCase();

/** The feature property that matches the most x values (ties: the first property). */
export function bestGeoKey(regions: Region[], values: unknown[]): string | null {
	const wanted = new Set(values.map(norm).filter(Boolean));
	let best: string | null = null;
	let hits = 0;
	const keys: string[] = [];
	for (const r of regions) for (const k of Object.keys(r.props)) if (!keys.includes(k)) keys.push(k);
	for (const k of keys) {
		const n = regions.filter((r) => wanted.has(norm(r.props[k]))).length;
		if (n > hits) {
			best = k;
			hits = n;
		}
	}
	return best ?? keys[0] ?? null;
}

export interface MapResult {
	items: Map<string, Item>;
	/** x values without a matching region. */
	unmatched: string[];
	geoKey: string | null;
}

export function renderMap(container: HTMLElement, spec: ChartSpec, rows: Row[], geo: unknown, deps: SvgChartDeps): MapResult {
	const regions = regionsOf(geo);
	if (!regions.length) throw new Error(`prism.chart: ${toText(spec.geo)} contains no Polygon or MultiPolygon features`);
	const x = spec.x ?? columnsOf(rows)[0];
	const list = filtered(spec, rows);
	const geoKey = spec.geoKey ?? bestGeoKey(regions, list.map((r) => r[x]));
	const items = itemsBy(spec, list, (r) => (norm(r[x]) ? norm(r[x]) : null));
	const known = new Set(regions.map((r) => norm(geoKey ? r.props[geoKey] : "")));
	const unmatched = Array.from(new Set(list.map((r) => toText(r[x]).trim()).filter((v) => v && !known.has(norm(v)))));

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const r of regions)
		for (const ring of r.rings)
			for (const [px, py] of ring) {
				minX = Math.min(minX, px);
				maxX = Math.max(maxX, px);
				minY = Math.min(minY, py);
				maxY = Math.max(maxY, py);
			}
	const scale = Math.min(MAP_WIDTH / (maxX - minX || 1), MAP_MAX_HEIGHT / (maxY - minY || 1));
	const width = Math.max(1, (maxX - minX) * scale);
	const height = Math.max(1, (maxY - minY) * scale);
	const frame = start(container, spec, "prism-map");
	const svg = frame.svg(width, height);
	// Tall regions (e.g. Chile) would grow far beyond the note column's height.
	svg.style.setProperty("max-width", `${Math.round((width / height) * MAP_MAX_HEIGHT)}px`);
	// Only values that have a region set the color scale.
	const span = range(Array.from(items.values()).filter((it) => known.has(it.key)));
	const numFmt = new Intl.NumberFormat(deps.locale, { maximumFractionDigits: 2 });
	const cells: Cell[] = [];
	for (const r of regions) {
		const name = geoKey ? toText(r.props[geoKey]) : "";
		const item = items.get(norm(name));
		const d = r.rings.map((ring) => "M" + ring.map(([px, py]) => `${((px - minX) * scale).toFixed(1)},${((py - minY) * scale).toFixed(1)}`).join("L") + "Z").join("");
		const path = createSvg("path");
		path.setAttribute("d", d);
		const lvl = item && span ? level(item.value, span.min, span.max) : 0;
		path.setAttribute("class", `region l${lvl}`);
		path.setAttribute("fill", deps.colors.levels[lvl]);
		path.setAttribute("stroke", deps.colors.stroke);
		const label = `${name}${item && item.value !== null ? `: ${numFmt.format(item.value)}` : ""}`;
		path.appendChild(createSvg("title")).textContent = label;
		svg.appendChild(path);
		if (item) cells.push({ el: path, key: item.rows[0][x], item, label });
	}
	frame.legend(span, numFmt, deps.colors);
	interact(frame.root, svg, cells, spec, deps);
	return { items, unmatched, geoKey };
}

/* ------------------------------------------------------------------ shared */

interface Cell {
	el: SVGElement;
	/** The x value (what `select` writes). */
	key: unknown;
	item: Item;
	label: string;
}

function start(container: HTMLElement, spec: ChartSpec, cls: string) {
	container.replaceChildren();
	const root = container.appendChild(createDiv(`prism-svgchart ${cls}`));
	if (spec.title) root.appendChild(createDiv("label")).textContent = toText(spec.title);
	return {
		root,
		svg(width: number, height: number): SVGSVGElement {
			const svg = createSvg("svg");
			svg.setAttribute("viewBox", `0 0 ${width.toFixed(1)} ${height.toFixed(1)}`);
			svg.setAttribute("role", "img");
			if (spec.title) svg.setAttribute("aria-label", toText(spec.title));
			root.appendChild(svg);
			return svg;
		},
		legend(span: { min: number; max: number } | null, fmt: Intl.NumberFormat, colors: SvgColors) {
			if (!span) return;
			const legend = root.appendChild(createDiv("prism-svgchart-legend"));
			legend.appendChild(document.createElement("span")).textContent = fmt.format(span.min);
			for (let l = 1; l <= 4; l++) {
				const swatch = legend.appendChild(document.createElement("i"));
				swatch.className = `l${l}`;
				swatch.style.setProperty("background", colors.levels[l]);
			}
			legend.appendChild(document.createElement("span")).textContent = fmt.format(span.max);
		},
	};
}

function empty(frame: ReturnType<typeof start>, locale: string, spec: ChartSpec) {
	const de = locale.startsWith("de");
	const column = toText(spec.x) || (de ? "der ersten Spalte" : "the first column");
	frame.root.appendChild(createDiv("muted")).textContent = de ? `Keine Daten: keine Datumswerte (JJJJ-MM-TT) in ${column}.` : `No data: no dates (YYYY-MM-DD) in ${column}.`;
}

function text(svg: SVGSVGElement, value: string, x: number, y: number, colors: SvgColors, strong = false) {
	const t = svg.appendChild(createSvg("text"));
	t.setAttribute("x", String(x));
	t.setAttribute("y", String(y));
	t.setAttribute("font-size", "10");
	t.setAttribute("font-family", colors.font);
	t.setAttribute("fill", strong ? colors.strong : colors.text);
	if (strong) t.setAttribute("font-weight", "600");
	t.textContent = value;
}

function cell(svg: SVGSVGElement, x: number, y: number, lvl: number, label: string, colors: SvgColors): SVGRectElement {
	const r = svg.appendChild(createSvg("rect"));
	r.setAttribute("x", String(x));
	r.setAttribute("y", String(y));
	r.setAttribute("width", String(CELL));
	r.setAttribute("height", String(CELL));
	r.setAttribute("rx", "2");
	r.setAttribute("class", `day l${lvl}`);
	r.setAttribute("fill", colors.levels[lvl]);
	r.appendChild(createSvg("title")).textContent = label;
	return r;
}

/**
 * Click, hover preview and keyboard for the cells with data: with `select` a
 * click toggles prism.shared[select], otherwise it opens the row's note
 * (`path` column, e.g. source: notes). Keyboard: the chart is one tab stop,
 * arrow keys move between cells, Enter activates.
 */
function interact(root: HTMLElement, svg: SVGSVGElement, cells: Cell[], spec: ChartSpec, deps: SvgChartDeps) {
	const pathOf = (c: Cell) => {
		const paths = Array.from(new Set(c.item.rows.map((r) => r.path).filter((p) => typeof p === "string" && p)));
		return paths.length === 1 ? (paths[0] as string) : null;
	};
	const selecting = typeof spec.select === "string" && !!spec.select;
	const hasSelection = selecting && deps.selected !== undefined && deps.selected !== null;
	const activate = (c: Cell) => {
		if (selecting) deps.select(c.key);
		else {
			const path = pathOf(c);
			if (path) deps.openNote(path);
		}
	};
	const active = cells.filter((c) => selecting || pathOf(c));
	for (const c of active) {
		c.el.classList.add("is-active");
		if (hasSelection && toText(deps.selected) === toText(c.key)) c.el.classList.add("is-selected");
		const path = pathOf(c);
		if (path && !selecting) c.el.setAttribute("data-prism-note", path);
		c.el.addEventListener("click", () => activate(c));
	}
	// Inline, so exports show the selection too.
	if (hasSelection) for (const el of Array.from(svg.querySelectorAll(".day, .region"))) if (!el.classList.contains("is-selected")) (el as SVGElement).style.setProperty("opacity", "0.35");
	if (!active.length) return;
	const status = root.appendChild(createDiv("prism-sr-only"));
	status.setAttribute("role", "status");
	svg.setAttribute("tabindex", "0");
	let focus = -1;
	const show = (i: number) => {
		active[focus]?.el.classList.remove("is-focus");
		focus = (i + active.length) % active.length;
		active[focus].el.classList.add("is-focus");
		status.textContent = active[focus].label;
	};
	svg.addEventListener("keydown", (e) => {
		if (e.key === "ArrowRight" || e.key === "ArrowDown") show(focus + 1);
		else if (e.key === "ArrowLeft" || e.key === "ArrowUp") show(focus < 0 ? active.length - 1 : focus - 1);
		else if ((e.key === "Enter" || e.key === " ") && focus >= 0) activate(active[focus]);
		else return;
		e.preventDefault();
	});
	svg.addEventListener("blur", () => active[focus]?.el.classList.remove("is-focus"));
}
