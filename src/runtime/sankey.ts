// type: sankey – flows between named nodes (budgets, funnels, energy), drawn by
// Prism as SVG (see svgCharts.ts for the shared helpers). The layout is a small
// version of d3-sankey's (justify alignment): d3 is not loaded in declarative blocks.

import { toText } from "../util";
import { ChartSpec, columnsOf } from "./chartSpec";
import { createDiv, createSvg } from "./dom";
import { Cell, SvgChartDeps, SvgResult, filtered, interact, numeric, start } from "./svgCharts";

type Row = Record<string, unknown>;

export interface SankeyLink {
	from: string;
	to: string;
	value: number;
}
export interface SankeyNode {
	name: string;
	column: number;
	x: number;
	y: number;
	h: number;
	value: number;
}
export interface PlacedLink extends SankeyLink {
	/** Top of the band at the source and at the target node. */
	sy: number;
	ty: number;
	width: number;
	/** Top of the band in each column it crosses between its ends (x of that column), left to right. */
	via: { x: number; y: number }[];
}

const WIDTH = 760;
const NODE_WIDTH = 12;
const PAD = 12;
const OPACITY = "0.35";
/** Relaxation passes; more than d3-sankey's 6, with its alpha decay, so nodes settle in a better order. */
const ITERATIONS = 32;

/**
 * Links of the rows, summed per (from, to) in row order: the y values (> 0), or
 * the row count without y. Empty ends and self-links are skipped; a link that
 * would close a cycle (its target already reaches its source) is dropped.
 */
export function sankeyLinks(rows: Row[], from: string, to: string, y?: string): { links: (SankeyLink & { rows: Row[] })[]; dropped: SankeyLink[] } {
	const byKey = new Map<string, SankeyLink & { rows: Row[] }>();
	for (const r of rows) {
		const a = toText(r[from]).trim();
		const b = toText(r[to]).trim();
		const v = y ? numeric(r[y]) : 1;
		if (!a || !b || a === b || v === null || v <= 0) continue;
		const key = JSON.stringify([a, b]);
		let link = byKey.get(key);
		if (!link) byKey.set(key, (link = { from: a, to: b, value: 0, rows: [] }));
		link.value += v;
		link.rows.push(r);
	}
	const next = new Map<string, string[]>();
	const reaches = (a: string, b: string, seen: Set<string>): boolean => a === b || (!seen.has(a) && (seen.add(a), (next.get(a) ?? []).some((n) => reaches(n, b, seen))));
	const links: (SankeyLink & { rows: Row[] })[] = [];
	const dropped: SankeyLink[] = [];
	for (const l of byKey.values()) {
		if (reaches(l.to, l.from, new Set())) {
			dropped.push({ from: l.from, to: l.to, value: l.value });
			continue;
		}
		links.push(l);
		next.set(l.from, [...(next.get(l.from) ?? []), l.to]);
	}
	return { links, dropped };
}

/**
 * Node and band positions within width × height. Columns: the longest path
 * from a source; sources move right next to their first target and sinks stay
 * at their own depth, so few bands skip a column. A band that does skip one
 * gets a slot in each column it crosses (`via`), like a thin node, so it never
 * runs behind another node. Nodes and slots then move towards their neighbors'
 * centers; links expects no cycles (see sankeyLinks).
 */
export function sankeyLayout(links: SankeyLink[], width: number, height: number): { nodes: SankeyNode[]; links: PlacedLink[] } {
	type Seg = { a: N; b: N; value: number; sy: number; ty: number };
	type N = SankeyNode & { i: number; ins: Seg[]; outs: Seg[] };
	const all: N[] = [];
	const make = (name: string): N => (all[all.length] = { name, column: 0, x: 0, y: 0, h: 0, value: 0, i: all.length, ins: [], outs: [] });
	const byName = new Map<string, N>();
	const node = (name: string): N => byName.get(name) ?? byName.set(name, make(name)).get(name)!;
	for (const l of links) node(l.from), node(l.to);
	const nodes = [...all];
	if (!nodes.length) return { nodes: [], links: [] };
	// Longest path; at most one pass per node, so a stray cycle cannot hang.
	for (let pass = 0, changed = true; changed && pass < nodes.length; pass++) {
		changed = false;
		for (const l of links) {
			if (node(l.to).column < node(l.from).column + 1) {
				node(l.to).column = node(l.from).column + 1;
				changed = true;
			}
		}
	}
	const targets = new Set(links.map((l) => l.to));
	for (const n of nodes) if (!targets.has(n.name)) n.column = Math.min(...links.filter((l) => l.from === n.name).map((l) => node(l.to).column)) - 1;
	// One segment per column a link crosses, with a slot node in each column between its ends.
	const chains = links.map((l) => {
		const chain: Seg[] = [];
		const end = node(l.to);
		const stop = Math.max(end.column, node(l.from).column + 1); // a stray cycle gets one segment
		for (let a = node(l.from), c = a.column + 1; c <= stop; c++) {
			const b = c === stop ? end : Object.assign(make(`${l.from} → ${l.to}`), { column: c });
			const s = { a, b, value: l.value, sy: 0, ty: 0 };
			a.outs.push(s);
			b.ins.push(s);
			chain.push(s);
			a = b;
		}
		return chain;
	});
	const last = Math.max(...nodes.map((n) => n.column));
	const sum = (ss: Seg[]) => ss.reduce((s, l) => s + l.value, 0);
	const cols: N[][] = Array.from({ length: last + 1 }, () => []);
	for (const n of all) {
		n.value = Math.max(sum(n.ins), sum(n.outs));
		n.x = last ? (n.column * (width - NODE_WIDTH)) / last : 0;
		cols[n.column].push(n);
	}
	const pad = Math.min(PAD, height / 2 / Math.max(...cols.map((c) => c.length)));
	const ky = Math.min(...cols.filter((c) => c.length).map((c) => (height - (c.length - 1) * pad) / (c.reduce((s, n) => s + n.value, 0) || 1)));
	const center = (n: N) => n.y + n.h / 2;
	// Weighted mean center of the nodes on one side (own center without links there).
	const bary = (n: N, side: "ins" | "outs") => (n[side].length ? n[side].reduce((t, s) => t + center(side === "ins" ? s.a : s.b) * s.value, 0) / sum(n[side]) : center(n));
	for (const col of cols) {
		let y = (height - col.reduce((s, n) => s + n.value * ky + pad, -pad)) / 2;
		for (const n of col) (n.h = n.value * ky), (n.y = y), (y += n.h + pad);
	}
	// Sorts a column by y and pushes nodes apart, first down from 0, then up from height.
	const resolve = (col: N[]) => {
		col.sort((a, b) => a.y - b.y || a.i - b.i);
		let y = 0;
		for (const n of col) {
			n.y = Math.max(n.y, y);
			y = n.y + n.h + pad;
		}
		y = height;
		for (let k = col.length - 1; k >= 0; k--) {
			col[k].y = Math.max(0, Math.min(col[k].y, y - col[k].h));
			y = col[k].y - pad;
		}
	};
	// Moves each node towards its neighbors' centers, then resolves overlaps (which may reorder the column).
	const pull = (col: N[], side: "ins" | "outs", alpha: number) => {
		for (const n of col) n.y += (bary(n, side) - center(n)) * alpha;
		resolve(col);
	};
	for (let it = 0, alpha = 1; it < ITERATIONS; it++, alpha *= 0.99) {
		for (let c = 1; c <= last; c++) pull(cols[c], "ins", alpha);
		for (let c = last - 1; c >= 0; c--) pull(cols[c], "outs", alpha);
	}
	// Band slots, ordered by the other end's position so bands don't twist.
	for (const n of all) {
		let y = n.y;
		for (const s of [...n.outs].sort((a, b) => center(a.b) - center(b.b))) (s.sy = y), (y += s.value * ky);
		y = n.y;
		for (const s of [...n.ins].sort((a, b) => center(a.a) - center(b.a))) (s.ty = y), (y += s.value * ky);
	}
	return {
		nodes: nodes.map(({ name, column, x, y, h, value }) => ({ name, column, x, y, h, value })),
		links: links.map((l, k) => ({ from: l.from, to: l.to, value: l.value, sy: chains[k][0].sy, ty: chains[k].at(-1)!.ty, width: l.value * ky, via: chains[k].slice(1).map((s) => ({ x: s.a.x, y: s.sy })) })),
	};
}

export function renderSankey(container: HTMLElement, spec: ChartSpec, rows: Row[], deps: SvgChartDeps): SvgResult {
	const from = spec.from ?? "from";
	const to = spec.to ?? "to";
	const y = Array.isArray(spec.y) ? spec.y[0] : spec.y;
	const warnings: string[] = [];
	// y, series and stacked are already checked by specWarnings.
	if (rows.length) {
		const cols = columnsOf(rows);
		for (const c of [from, to]) if (!cols.includes(c)) warnings.push(`prism.chart: column "${c}" not found (columns: ${cols.join(", ")})`);
	}
	for (const key of ["lines", "goal", "group"] as const) if (spec[key] !== undefined) warnings.push(`prism.chart: "${key}" does not apply to type: sankey`);
	const { links, dropped } = sankeyLinks(filtered(spec, rows), from, to, y);
	const numFmt = new Intl.NumberFormat(deps.locale, { maximumFractionDigits: 2 });
	if (dropped.length) warnings.push(`prism.chart: type sankey cannot show cycles, links left out: ${dropped.map((l) => `${l.from} → ${l.to}`).join(", ")}`);
	const result: SvgResult = { table: { columns: [from, to, y ?? "count"], rows: links.map((l) => [l.from, l.to, l.value]) }, warnings };

	const frame = start(container, spec, "prism-sankey");
	if (!links.length) {
		const de = deps.locale.startsWith("de");
		frame.root.appendChild(createDiv("muted")).textContent = de ? `Keine Daten: keine Verbindungen in den Spalten ${from} und ${to}.` : `No data: no links in the columns ${from} and ${to}.`;
		return result;
	}
	let height = Number(spec.height) || 640;
	let layout = sankeyLayout(links, WIDTH, height);
	if (!Number(spec.height)) {
		// Columns don't depend on the height: lay out again at a height that fits the fullest column.
		const counts = new Map<number, number>();
		// Per column (by x): its nodes and the slots of bands that skip it.
		for (const x of [...layout.nodes.map((n) => n.x), ...layout.links.flatMap((l) => l.via.map((v) => v.x))]) counts.set(x, (counts.get(x) ?? 0) + 1);
		height = Math.min(640, Math.max(220, Math.max(...counts.values()) * 36));
		layout = sankeyLayout(links, WIDTH, height);
	}
	const svg = frame.svg(WIDTH, height);
	const { palette, levels, strong, font } = deps.colors;
	const color = (i: number) => (palette.length ? palette[i % palette.length] : levels[4]);
	const index = new Map(layout.nodes.map((n, i) => [n.name, i]));
	const at = (name: string) => layout.nodes[index.get(name)!];

	// Big bands first, so smaller ones crossing them stay visible on top.
	const bands = [...layout.links].sort((a, b) => b.width - a.width).map((l) => {
		const pts = [[at(l.from).x + NODE_WIDTH, l.sy], ...l.via.flatMap((v) => [[v.x, v.y], [v.x + NODE_WIDTH, v.y]]), [at(l.to).x, l.ty]].map(([x, y]) => [+x.toFixed(1), +y.toFixed(1)]);
		const w = +l.width.toFixed(1);
		// One curve per gap between columns; across a skipped column the curve is a straight slot.
		const edge = (ps: number[][], dy: number) => ps.slice(1).map(([x, y], k) => { const xm = (ps[k][0] + x) / 2; return `C${xm},${ps[k][1] + dy} ${xm},${y + dy} ${x},${y + dy}`; }).join("");
		const back = [...pts].reverse();
		const path = svg.appendChild(createSvg("path"));
		path.setAttribute("class", "link");
		path.setAttribute("d", `M${pts[0]}${edge(pts, 0)}L${back[0][0]},${back[0][1] + w}${edge(back, w)}Z`);
		path.setAttribute("fill", color(index.get(l.from)!));
		path.setAttribute("fill-opacity", OPACITY);
		path.appendChild(createSvg("title")).textContent = `${l.from} → ${l.to}: ${numFmt.format(l.value)}`;
		return { path, link: l };
	});
	const highlight = (keep: ((l: PlacedLink) => boolean) | null) => {
		for (const b of bands) b.path.setAttribute("fill-opacity", !keep || keep(b.link) ? OPACITY : "0.08");
	};
	for (const b of bands) {
		b.path.addEventListener("pointerenter", () => highlight((l) => l === b.link));
		b.path.addEventListener("pointerleave", () => highlight(null));
	}

	const rowsOf = new Map<string, Set<Row>>();
	for (const l of links) for (const name of [l.from, l.to]) for (const r of l.rows) (rowsOf.get(name) ?? rowsOf.set(name, new Set()).get(name)!).add(r);
	const cells: Cell[] = [];
	layout.nodes.forEach((n, i) => {
		const rect = svg.appendChild(createSvg("rect"));
		for (const [k, v] of [["x", n.x], ["y", n.y], ["width", NODE_WIDTH], ["height", Math.max(1, n.h)]] as const) rect.setAttribute(k, v.toFixed(1));
		rect.setAttribute("rx", "2");
		rect.setAttribute("class", "node");
		rect.setAttribute("fill", color(i));
		const label = `${n.name}: ${numFmt.format(n.value)}`;
		rect.appendChild(createSvg("title")).textContent = label;
		rect.addEventListener("pointerenter", () => highlight((l) => l.from === n.name || l.to === n.name));
		rect.addEventListener("pointerleave", () => highlight(null));
		cells.push({ el: rect, key: n.name, item: { key: n.name, value: n.value, rows: Array.from(rowsOf.get(n.name) ?? []) }, label });
	});
	// Labels on the side of the node's own bands: sinks left, all others right.
	const sources = new Set(links.map((l) => l.from));
	for (const n of layout.nodes) {
		const t = svg.appendChild(createSvg("text"));
		const right = !n.column || sources.has(n.name);
		t.setAttribute("x", (right ? n.x + NODE_WIDTH + 6 : n.x - 6).toFixed(1));
		// Kept inside the chart: thin nodes at the top or bottom edge would cut their label.
		t.setAttribute("y", Math.min(height - 3, Math.max(11, n.y + n.h / 2 + 4)).toFixed(1));
		t.setAttribute("text-anchor", right ? "start" : "end");
		t.setAttribute("font-size", "11");
		t.setAttribute("font-family", font);
		t.setAttribute("fill", strong);
		// A halo in the background color keeps the label readable over other bands.
		for (const [k, v] of [["stroke", deps.colors.stroke], ["stroke-width", "3"], ["stroke-linejoin", "round"], ["paint-order", "stroke"]]) t.setAttribute(k, v);
		t.textContent = `${n.name} ${numFmt.format(n.value)}`;
	}
	// Keyboard order: column by column, top to bottom.
	cells.sort((a, b) => at(a.key as string).x - at(b.key as string).x || at(a.key as string).y - at(b.key as string).y);
	interact(frame.root, svg, cells, spec, deps);
	return result;
}
