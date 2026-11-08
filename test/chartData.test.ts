import { test } from "node:test";
import assert from "node:assert/strict";
import { LegendBox, chartConfig, ignoredKeys, shortenLegendLabels, specWarnings } from "../src/runtime/chartSpec";
import { dataCardText, ignoredNote } from "../src/runtime/svgCharts";
import { tableWarnings } from "../src/runtime/table";
import { compileExpression, computeRows } from "../src/runtime/compute";
import { localToday } from "../src/runtime/periods";

type Cfg = { type: string; data: { labels?: unknown[]; datasets: { label?: string; data: unknown[] }[] }; options: Record<string, any> };
const cfg = (spec: object, rows: Record<string, unknown>[] = []) => chartConfig(spec, rows) as unknown as Cfg;

const days = [
	{ day: "2026-10-05", n: 2 },
	{ day: "2026-10-06", n: 3 },
	{ day: "2026-10-20", n: 5 },
	{ day: "2026-12-01", n: 7 },
];

test("group: week labels, default count, gap filling", () => {
	const c = cfg({ x: "day", group: "week" }, days);
	assert.deepEqual(c.data.labels, ["2026-W41", "2026-W42", "2026-W43", "2026-W44", "2026-W45", "2026-W46", "2026-W47", "2026-W48", "2026-W49"]);
	assert.deepEqual(c.data.datasets[0].data, [2, 0, 1, 0, 0, 0, 0, 0, 1]);
});

test("group: month sums y, gaps are 0 for sum and null for avg", () => {
	const sum = cfg({ x: "day", y: "n", group: "month" }, days);
	assert.deepEqual(sum.data.labels, ["2026-10", "2026-11", "2026-12"]);
	assert.deepEqual(sum.data.datasets[0].data, [10, 0, 7]);
	const avg = cfg({ x: "day", y: "n", group: "month", aggregate: "avg" }, days);
	assert.deepEqual(avg.data.datasets[0].data, [10 / 3, null, 7]);
});

test("group: drops empty and non-date rows, sorts ascending, limit keeps the last N", () => {
	const rows = [{ day: "2026-03-01" }, { day: null }, { day: "soon" }, { day: "2026-01-15" }];
	const c = cfg({ x: "day", group: "month" }, rows);
	assert.deepEqual(c.data.labels, ["2026-01", "2026-02", "2026-03"]);
	assert.deepEqual(cfg({ x: "day", group: "month", limit: 2 }, rows).data.labels, ["2026-02", "2026-03"]);
	assert.deepEqual(cfg({ x: "day", group: "month", sort: "-day", limit: 2 }, rows).data.labels, ["2026-03", "2026-02"]);
});

test("group with series: no gap filling", () => {
	const rows = [
		{ day: "2026-01-02", kind: "a" },
		{ day: "2026-03-02", kind: "b" },
	];
	const c = cfg({ x: "day", series: "kind", group: "month" }, rows);
	assert.deepEqual(c.data.labels, ["2026-01", "2026-03"]);
	assert.equal(c.data.datasets.length, 2);
});

test("group warnings", () => {
	const rows = [{ day: "2026-01-02" }, { day: "soon" }, { day: "" }];
	assert.deepEqual(specWarnings({ x: "day", group: "month" }, rows), ['prism.chart: 1 rows have no date in "day" and are left out (group: month)']);
	assert.match(specWarnings({ group: "decade" }, null)[0], /group must be one of day, week, month, quarter, year/);
	assert.match(specWarnings({ type: "calendar", group: "month" }, null).join(), /"group" does not apply to type: calendar/);
	assert.deepEqual(specWarnings({ type: "kpi", group: "month" }, null), []);
});

test("lines and goal", () => {
	const rows = [{ a: "x", b: 1 }];
	const c = cfg({ x: "a", y: "b", goal: 30, lines: [{ y: -5, label: "Min" }, { x: "x", label: "Launch" }] }, rows);
	assert.deepEqual(c.options.plugins.prismLines.lines, [{ y: -5, label: "Min" }, { x: "x", label: "Launch" }, { y: 30, goal: true }]);
	assert.equal(c.options.scales.y.suggestedMax, 30);
	assert.equal(c.options.scales.y.suggestedMin, -5);
	const h = cfg({ type: "hbar", x: "a", y: "b", goal: 30, stacked: true }, rows);
	assert.equal(h.options.scales.x.suggestedMax, 30);
	assert.equal(h.options.scales.x.stacked, true);
	assert.equal(h.options.scales.y.suggestedMax, undefined);
	assert.equal(cfg({ x: "a", y: "b", goal: 30, options: { scales: { y: { suggestedMax: 99 } } } }, rows).options.scales.y.suggestedMax, 99);
	assert.equal(cfg({ type: "pie", x: "a", y: "b", goal: 30 }, rows).options.plugins, undefined);
	assert.match(specWarnings({ type: "pie", goal: 3 }, null)[0], /do not apply to type: pie/);
	assert.match(specWarnings({ type: "sankey", lines: [{ y: 1 }] }, null)[0], /do not apply/);
	assert.deepEqual(specWarnings({ type: "kpi", goal: 3 }, null), []);
	assert.match(specWarnings({ lines: [{ label: "x" }] as any }, null)[0], /lines must be a list/);
	assert.deepEqual(specWarnings({ lines: [{ y: 1 }, { x: "a" }] }, null), []);
});

const run = (expr: string, row: Record<string, unknown> = {}) => compileExpression(expr)(row);

test("compute: precedence, unary minus, functions", () => {
	assert.equal(run("1 + 2 * 3"), 7);
	assert.equal(run("(1 + 2) * 3"), 9);
	assert.equal(run("-2 * -3"), 6);
	assert.equal(run("2 - -1"), 3);
	assert.equal(run("7 % 4 + 1.5e1"), 18);
	assert.equal(run("round(a * 1.19, 2)", { a: 10 }), 11.9);
	assert.equal(run("round(2.5)"), 3);
	assert.equal(run("floor(2.7) + ceil(2.1) + abs(-1)"), 6);
	assert.equal(run("min(3, 1, 2) + max(1, 5)"), 6);
	assert.equal(run("pages / days", { pages: 10, days: 4 }), 2.5);
	assert.equal(run("`Pages read` + 1", { "Pages read": 4 }), 5);
	assert.equal(run("done + 1", { done: true }), 2);
	assert.equal(run("name", { name: "x" }), "x");
	assert.equal(run('"a"'), "a");
	assert.equal(run("today()"), localToday());
});

test("compute: days() and nulls", () => {
	assert.equal(run("days(a, b)", { a: "2026-10-01", b: "2026-10-18" }), 17);
	assert.equal(run("days(a, b)", { a: "x", b: "2026-10-18" }), null);
	assert.equal(run("days(a, b)", { b: "2026-10-18" }), null);
	assert.equal(run("a + 1", { a: null }), null);
	assert.equal(run("a + 1", { a: "5" }), null);
	assert.equal(run("1 / 0"), null);
	assert.equal(run("1 % 0"), null);
	assert.equal(run("a * 1e308 * 10", { a: 1 }), null);
});

test("compute: syntax errors and prototype safety", () => {
	assert.throws(() => compileExpression("pages / )"), /unexpected "\)" at 8 in "pages \/ \)"/);
	assert.throws(() => compileExpression("1 +"), /unexpected end at 3/);
	assert.throws(() => compileExpression("foo(1)"), /unknown function "foo"/);
	assert.throws(() => compileExpression("1 2"), /unexpected "2" at 2/);
	assert.equal(run("constructor"), null);
	assert.equal(run("__proto__ + 1"), null);
	assert.equal(run("toString"), null);
});

test("computeRows: chaining, columns, constants, unknown columns", () => {
	const rows = [{ a: 2, b: 3 }, { a: 4, b: 5 }];
	const out = computeRows(rows, { sum: "a + b", dbl: "sum * 2", k: 7 as any });
	assert.deepEqual(out.map((r) => r.dbl), [10, 18]);
	assert.deepEqual(out.map((r) => r.k), [7, 7]);
	assert.deepEqual(out.columns, ["a", "b", "sum", "dbl", "k"]);
	assert.deepEqual(rows[0], { a: 2, b: 3 });
	assert.throws(() => computeRows(rows, { x: "c + 1" }), /prism\.chart: compute "x": column "c" not found \(columns: a, b\)/);
	assert.throws(() => computeRows(rows, { x: "dbl + 1", dbl: "a" }), /column "dbl" not found/);
	assert.throws(() => computeRows(rows, { x: "(a" }), /compute "x": unexpected end/);
	assert.deepEqual(computeRows([], { x: "c" }).columns, ["x"]);
});

test("old specs without the new keys are unchanged", () => {
	const base = { maintainAspectRatio: false, animation: { duration: 250 } };
	const rows = [{ k: "a", v: 1, w: 2 }, { k: "b", v: 3, w: 4 }, { k: "a", v: 5, w: 6 }];
	assert.deepEqual(chartConfig({ type: "bar", x: "k", y: "v", limit: 2 }, rows), {
		type: "bar",
		data: { labels: ["a", "b"], datasets: [{ label: "v", data: [1, 3] }] },
		options: { ...base, plugins: { legend: { display: false } } },
	});
	assert.deepEqual(chartConfig({ type: "hbar", x: "k", y: ["v", "w"], title: "T", sort: "-v" }, rows), {
		type: "bar",
		data: { labels: ["a", "b", "a"].map((_, i) => [rows[2], rows[1], rows[0]][i].k), datasets: [{ label: "v", data: [5, 3, 1] }, { label: "w", data: [6, 4, 2] }] },
		options: { ...base, indexAxis: "y", plugins: { title: { display: true, text: "T" } } },
	});
	assert.deepEqual(chartConfig({ type: "area", x: "k", y: "v", stacked: true }, rows), {
		type: "line",
		data: { labels: ["a", "b", "a"], datasets: [{ label: "v", data: [1, 3, 5], fill: "stack" }] },
		options: { ...base, scales: { x: { stacked: true }, y: { stacked: true } }, plugins: { legend: { display: false } } },
	});
	assert.deepEqual(chartConfig({ type: "line", x: "k", y: "v", aggregate: "sum" }, rows), {
		type: "line",
		data: { labels: ["a", "b"], datasets: [{ label: "v", data: [6, 3] }] },
		options: { ...base, plugins: { legend: { display: false } } },
	});
	assert.deepEqual(chartConfig({ type: "pie", x: "k", y: "v", aggregate: "count" }, rows), {
		type: "pie",
		data: { labels: ["a", "b"], datasets: [{ label: "count", data: [2, 1] }] },
		options: base,
	});
	assert.deepEqual(chartConfig({ x: "k", y: "v", series: "k" }, rows), {
		type: "bar",
		data: { labels: ["a", "b"], datasets: [{ label: "a", data: [1, null] }, { label: "b", data: [null, 3] }] },
		options: base,
	});
});

const shares = [{ s: "A", v: 1 }, { s: "B", v: 2 }];

test("data labels are off until a spec sets them", () => {
	const plain = cfg({ type: "pie", x: "s", y: ["v"] }, shares);
	assert.equal(plain.options.plugins?.datalabels, undefined);
	assert.equal(plain.options.layout, undefined);
});

test("options.plugins.datalabels turns the labels on, the spec's own values win", () => {
	const on = cfg({ type: "pie", x: "s", y: ["v"], options: { plugins: { datalabels: { color: "#20242D" } } } }, shares);
	assert.deepEqual(on.options.plugins.datalabels, { display: "auto", color: "#20242D" });
	assert.equal(on.options.layout.padding, 20);
	assert.equal(on.options.radius, "85%", "room between the pie and the legend");
	assert.equal(cfg({ type: "pie", x: "s", y: ["v"], options: { radius: "100%", plugins: { datalabels: {} } } }, shares).options.radius, "100%");
	assert.equal(cfg({ type: "polarArea", x: "s", y: ["v"], options: { plugins: { datalabels: {} } } }, shares).options.scales.r.grace, "15%");
	assert.equal(cfg({ type: "bar", x: "s", y: ["v"], options: { plugins: { datalabels: {} } } }, shares).options.radius, undefined);
	const own = cfg({ type: "bar", x: "s", y: ["v"], options: { layout: { padding: { right: 24 } }, plugins: { datalabels: { display: true } } } }, shares);
	assert.equal(own.options.plugins.datalabels.display, true);
	assert.deepEqual(own.options.layout.padding, { right: 24 });
	assert.deepEqual(cfg({ type: "bar", x: "s", y: ["v"], options: { plugins: { datalabels: true } } }, shares).options.plugins.datalabels, { display: "auto" });
	assert.equal(cfg({ type: "bar", x: "s", y: ["v"], options: { plugins: { datalabels: false } } }, shares).options.plugins.datalabels, false);
});

test("several unknown keys give one message that names them and the valid keys", () => {
	const chart = specWarnings({ type: "bar", foo: 1, bar: 2 } as never, null);
	assert.equal(chart.length, 1);
	assert.match(chart[0], /^prism\.chart: unknown keys "foo", "bar" \(known: type, source, /);
	assert.match(specWarnings({ type: "bar", foo: 1 } as never, null)[0], /^prism\.chart: unknown key "foo" \(known: /);
	const table = tableWarnings({ foo: 1, bar: 2 } as never, []);
	assert.equal(table.length, 1);
	assert.match(table[0], /^prism\.table: unknown keys "foo", "bar" \(known: source, /);
});

test("the keys a chart drawn by Prism ignores: warning and visible note agree", () => {
	assert.deepEqual(ignoredKeys({ type: "calendar", options: {} }), ["options"]);
	assert.deepEqual(ignoredKeys({ type: "bar", options: {} }), []);
	assert.deepEqual(ignoredKeys({ type: "timeline", series: "s", stacked: true }), ["stacked"]);
	assert.match(specWarnings({ type: "calendar", options: {} }, null).join(), /"options" does not apply to type: calendar/);
	assert.equal(ignoredNote({ type: "calendar", options: {} }, "en"), "options ignored for calendar");
	assert.equal(ignoredNote({ type: "map", options: {}, stacked: true }, "de-DE"), "stacked, options bei map ignoriert");
	assert.equal(ignoredNote({ type: "calendar" }, "en"), null);
});

test("the data folder card names the kind and the folder", () => {
	assert.equal(dataCardText("map", "data", "en").title, "Add a data folder to render this map");
	assert.match(dataCardText("map", "data", "en").body, /Add "data" in Settings → Prism → Data folders/);
	assert.equal(dataCardText("bar", "x", "de").title, "Für dieses Diagramm fehlt ein Datenordner");
	assert.equal(dataCardText("table", "x", "en").title, "Add a data folder to render this table");
});

// A legend as Chart.js leaves it after fit: 1 character = 6 px, 40 px of swatch per item, padding 10.
function legendBox(width: number, columns: string[][]): LegendBox & { texts(): unknown[] } {
	const items = columns.flat().map((text) => ({ text }));
	const size = (t: unknown) => 40 + String(t).length * 6;
	return {
		width,
		options: { display: true, labels: { padding: 10 } },
		columnSizes: columns.map((c) => ({ width: Math.max(...c.map(size)) })),
		legendHitBoxes: items.map((i) => ({ width: size(i.text) })),
		legendItems: items,
		ctx: { measureText: (text: string) => ({ width: text.length * 6 }) },
		isHorizontal: () => false,
		texts: () => items.map((i) => i.text),
	};
}

test("legend labels are left alone while the columns fit their box", () => {
	const legend = legendBox(500, [["short one", "short two"], ["short three"]]);
	assert.equal(shortenLegendLabels(legend), false);
	assert.deepEqual(legend.texts(), ["short one", "short two", "short three"]);
});

test("legend labels are shortened to keep every column inside the box", () => {
	const long = "Category with a very long name";
	const legend = legendBox(300, [[long, "ok"], [long]]);
	assert.equal(shortenLegendLabels(legend), true);
	const [first, ok, last] = legend.texts() as string[];
	assert.equal(ok, "ok");
	assert.ok(first.endsWith("…") && last.endsWith("…"));
	// Two columns of (300 - 10 - 2 * 10) / 2 = 135 px, 40 of them the swatch.
	assert.ok(40 + first.length * 6 <= 135, first);
	assert.ok(long.startsWith(first.slice(0, -1)));
});

test("legend at the top or bottom, or hidden, is not touched", () => {
	const top = { ...legendBox(10, [["a long label"]]), isHorizontal: () => true };
	assert.equal(shortenLegendLabels(top), false);
	const hidden = legendBox(10, [["a long label"]]);
	hidden.options.display = false;
	assert.equal(shortenLegendLabels(hidden), false);
});
