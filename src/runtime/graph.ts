// type: graph – a network of notes (or any from/to rows), drawn by Prism as SVG
// with its own force-directed layout (d3 is not loaded in declarative blocks).
// Deterministic: the same rows give the same picture (snapshots stay stable).

import { toText } from "../util";
import { ChartSpec, columnsOf } from "./chartSpec";
import { Cell, SvgChartDeps, SvgResult, filtered, interact, start, text } from "./svgCharts";
import { createDiv, createEl, createSpan, createSvg } from "./dom";

type Row = Record<string, unknown>;

export interface GraphNode {
	name: string;
	/** Vault path (from the `<column>Path` column), null for unresolved links and plain rows. */
	path: string | null;
	/** Number of distinct neighbors. */
	degree: number;
}

export interface GraphData {
	/** Shown nodes: highest degree first, ties by name. */
	nodes: GraphNode[];
	/** Edges between shown nodes as [node index, node index, weight]. */
	edges: [number, number, number][];
	/** Every deduplicated edge (CSV export): [from, to, weight]. */
	all: [string, string, number][];
	/** Nodes left out by `limit`. */
	hidden: number;
}

const DEFAULT_LIMIT = 150;
/** The layout is O(n²) per step and reruns on vault changes. */
export const MAX_NODES = 500;

/**
 * Nodes and undirected, deduplicated edges of from/to rows (weight = number of
 * rows). Self-links and empty ends are skipped. Nodes are keyed by name.
 * shortcut: two notes with the same title merge into one node; key by path if people hit that.
 */
export function graphData(spec: ChartSpec, rows: Row[]): GraphData {
	const fromCol = spec.from ?? "from";
	const toCol = spec.to ?? "to";
	const paths = new Map<string, string | null>();
	const edges = new Map<string, [string, string, number]>();
	const end = (r: Row, col: string) => {
		const name = toText(r[col]).trim();
		const path = r[`${col}Path`];
		if (name && typeof path === "string" && path && !paths.get(name)) paths.set(name, path);
		return name;
	};
	for (const r of filtered(spec, rows)) {
		const a = end(r, fromCol);
		const b = end(r, toCol);
		if (!a || !b || a === b) continue;
		const key = JSON.stringify(a < b ? [a, b] : [b, a]);
		const e = edges.get(key);
		if (e) e[2]++;
		else edges.set(key, [a, b, 1]);
	}
	const degree = new Map<string, number>();
	for (const [a, b] of edges.values()) {
		degree.set(a, (degree.get(a) ?? 0) + 1);
		degree.set(b, (degree.get(b) ?? 0) + 1);
	}
	const sorted = Array.from(degree, ([name, d]) => ({ name, path: paths.get(name) ?? null, degree: d })).sort((x, y) => y.degree - x.degree || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
	const limit = typeof spec.limit === "number" && spec.limit > 0 ? Math.floor(spec.limit) : DEFAULT_LIMIT;
	const nodes = sorted.slice(0, Math.min(limit, MAX_NODES));
	const index = new Map(nodes.map((n, i) => [n.name, i]));
	const shown: [number, number, number][] = [];
	for (const [a, b, w] of edges.values()) {
		const i = index.get(a);
		const j = index.get(b);
		if (i !== undefined && j !== undefined) shown.push([i, j, w]);
	}
	return { nodes, edges: shown, all: Array.from(edges.values()), hidden: sorted.length - nodes.length };
}

/**
 * Force-directed layout (Fruchterman–Reingold): phyllotaxis start by node
 * order, pairwise repulsion, springs along edges (stronger for heavier edges),
 * gravity to the center so separate components stay close, linear cooling.
 * No randomness: the same input gives the same positions. O(n²) per step.
 */
export function forceLayout(nodeCount: number, edges: [number, number, number][], opts: { iterations?: number } = {}): [number, number][] {
	const n = nodeCount;
	const iterations = opts.iterations ?? 300;
	const k = Math.sqrt(1 / Math.max(1, n));
	const x = new Float64Array(n);
	const y = new Float64Array(n);
	const golden = Math.PI * (3 - Math.sqrt(5));
	for (let i = 0; i < n; i++) {
		const r = k * Math.sqrt(i + 0.5);
		x[i] = r * Math.cos(i * golden);
		y[i] = r * Math.sin(i * golden);
	}
	const dx = new Float64Array(n);
	const dy = new Float64Array(n);
	for (let it = 0; it < iterations; it++) {
		dx.fill(0);
		dy.fill(0);
		for (let i = 0; i < n; i++) {
			for (let j = i + 1; j < n; j++) {
				let ex = x[i] - x[j];
				let ey = y[i] - y[j];
				let d2 = ex * ex + ey * ey;
				if (d2 < 1e-12) {
					// Same spot: push apart in a fixed direction.
					ex = 1e-6;
					ey = 1e-6 * ((i % 7) - 3);
					d2 = ex * ex + ey * ey;
				}
				const f = (k * k) / d2;
				dx[i] += ex * f;
				dy[i] += ey * f;
				dx[j] -= ex * f;
				dy[j] -= ey * f;
			}
		}
		for (const [a, b, w] of edges) {
			const ex = x[a] - x[b];
			const ey = y[a] - y[b];
			const f = (Math.sqrt(ex * ex + ey * ey) * (1 + Math.log(w))) / k;
			dx[a] -= ex * f;
			dy[a] -= ey * f;
			dx[b] += ex * f;
			dy[b] += ey * f;
		}
		// Hot enough at first to untangle crossings (0.1 left rings knotted into trees).
		const t = (0.3 * (iterations - it)) / iterations;
		for (let i = 0; i < n; i++) {
			const r = Math.sqrt(x[i] * x[i] + y[i] * y[i]);
			const g = (GRAVITY * r) / k;
			dx[i] -= x[i] * g;
			dy[i] -= y[i] * g;
			const len = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]);
			if (len > 0) {
				const step = Math.min(len, t) / len;
				x[i] += dx[i] * step;
				y[i] += dy[i] * step;
			}
		}
	}
	return Array.from({ length: n }, (_, i) => [x[i], y[i]] as [number, number]);
}

const GRAVITY = 1;
const WIDTH = 760;
const PAD = 14;
/** Room right of the nodes for their labels. */
const LABEL_ROOM = 90;

export function renderGraph(container: HTMLElement, spec: ChartSpec, rows: Row[], deps: SvgChartDeps): SvgResult {
	const de = deps.locale.startsWith("de");
	const fromCol = spec.from ?? "from";
	const toCol = spec.to ?? "to";
	const warnings: string[] = [];
	for (const k of ["series", "stacked", "lines", "goal", "group"] as const) if (spec[k] !== undefined) warnings.push(`prism.chart: "${k}" does not apply to type: graph`);
	if (rows.length) {
		const cols = columnsOf(rows);
		for (const c of [fromCol, toCol]) if (!cols.includes(c)) warnings.push(`prism.chart: column "${c}" not found (columns: ${cols.join(", ")})`);
	}
	const data = graphData(spec, rows);
	if (typeof spec.limit === "number" && spec.limit > MAX_NODES && data.hidden > 0) warnings.push(`prism.chart: type graph shows at most ${MAX_NODES} nodes (limit: ${spec.limit})`);
	const table = { columns: [fromCol, toCol, "weight"], rows: data.all.map((e) => e.slice()) };
	const frame = start(container, spec, "prism-graph");
	const { nodes, edges } = data;
	if (!nodes.length) {
		frame.root.appendChild(createDiv("muted")).textContent = de ? `Keine Daten: keine Verknüpfungen in den Spalten ${fromCol} und ${toCol}.` : `No data: no links in the columns ${fromCol} and ${toCol}.`;
		return { table, warnings };
	}

	const height = Math.max(260, Math.min(560, Math.sqrt(nodes.length) * 60));
	const pos = forceLayout(nodes.length, edges);
	const xs = pos.map((p) => p[0]);
	const ys = pos.map((p) => p[1]);
	const fit = (v: number, min: number, max: number, size: number) => (max > min ? ((v - min) / (max - min)) * size : size / 2);
	const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
	const px = (i: number) => PAD + fit(xs[i], minX, maxX, WIDTH - 2 * PAD - LABEL_ROOM);
	const py = (i: number) => PAD + fit(ys[i], minY, maxY, height - 2 * PAD);

	const folderOf = (n: GraphNode) => (n.path === null ? null : n.path.includes("/") ? n.path.slice(0, n.path.indexOf("/")) : "/");
	const folders = Array.from(new Set(nodes.map(folderOf).filter((f): f is string => f !== null))).sort();
	const colorOf = (f: string) => deps.colors.palette[folders.indexOf(f) % deps.colors.palette.length];

	const svg = frame.svg(WIDTH, height);
	const lines = edges.map(([a, b, w]) => {
		const line = svg.appendChild(createSvg("line"));
		line.setAttribute("x1", px(a).toFixed(1));
		line.setAttribute("y1", py(a).toFixed(1));
		line.setAttribute("x2", px(b).toFixed(1));
		line.setAttribute("y2", py(b).toFixed(1));
		line.setAttribute("stroke", deps.colors.text);
		line.setAttribute("stroke-opacity", "0.35");
		line.setAttribute("stroke-width", (1 + Math.log(w)).toFixed(2));
		return line;
	});
	const labeled = nodes.length <= 40 ? nodes.length : 30;
	const cells: Cell[] = [];
	const marks = nodes.map((n, i) => {
		const r = 4 + 1.6 * Math.sqrt(n.degree);
		const circle = svg.appendChild(createSvg("circle"));
		circle.setAttribute("cx", px(i).toFixed(1));
		circle.setAttribute("cy", py(i).toFixed(1));
		circle.setAttribute("r", r.toFixed(1));
		circle.setAttribute("class", "node");
		const folder = folderOf(n);
		circle.setAttribute("fill", folder === null ? deps.colors.levels[0] : colorOf(folder));
		circle.setAttribute("stroke", folder === null ? deps.colors.text : deps.colors.stroke);
		const label = de ? `${n.name} (${n.degree} Links)` : `${n.name} (${n.degree} link${n.degree === 1 ? "" : "s"})`;
		circle.appendChild(createSvg("title")).textContent = label;
		cells.push({ el: circle, key: n.name, item: { key: n.name, value: n.degree, rows: n.path ? [{ path: n.path }] : [] }, label });
		let caption: Element | null = null;
		if (i < labeled) {
			text(svg, n.name, +(px(i) + r + 3).toFixed(1), +(py(i) + 3.5).toFixed(1), deps.colors);
			caption = svg.lastElementChild;
		}
		return [circle, caption].filter((el): el is Element => el !== null);
	});
	interact(frame.root, svg, cells, spec, deps);

	// Base opacity: the selection (prism.shared[select]) stays visible, the rest fades.
	const selected = typeof spec.select === "string" && spec.select && deps.selected !== undefined && deps.selected !== null ? toText(deps.selected) : null;
	const base = (i: number) => (selected !== null && nodes[i].name !== selected ? "0.35" : null);
	const setOpacity = (el: Element, v: string | null) => (v === null ? el.removeAttribute("opacity") : el.setAttribute("opacity", v));
	const restore = () => {
		marks.forEach((els, i) => els.forEach((el) => setOpacity(el, base(i))));
		lines.forEach((l) => setOpacity(l, null));
	};
	restore();
	const neighbors = nodes.map(() => new Set<number>());
	for (const [a, b] of edges) {
		neighbors[a].add(b);
		neighbors[b].add(a);
	}
	marks.forEach(([circle], i) => {
		circle.addEventListener("pointerenter", () => {
			marks.forEach((els, j) => els.forEach((el) => setOpacity(el, j === i || neighbors[i].has(j) ? null : "0.15")));
			lines.forEach((l, e) => setOpacity(l, edges[e][0] === i || edges[e][1] === i ? null : "0.1"));
		});
		circle.addEventListener("pointerleave", restore);
	});

	if (folders.length > 1) {
		const legend = frame.root.appendChild(createDiv("prism-svgchart-legend"));
		for (const f of folders) {
			const swatch = legend.appendChild(createEl("i"));
			swatch.style.setProperty("background", colorOf(f));
			legend.appendChild(createSpan()).textContent = f;
		}
	}
	if (data.hidden) frame.root.appendChild(createDiv("muted prism-graph-more")).textContent = de ? `${data.hidden} weitere ausgeblendet` : `${data.hidden} more hidden`;
	return { table, warnings };
}
