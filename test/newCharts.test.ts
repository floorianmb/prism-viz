import { test } from "node:test";
import assert from "node:assert/strict";
import { NONE, chartConfig, chartTable, resolveFilter, sharedKeys, specWarnings, taskRows } from "../src/runtime/chartSpec";
import { bestGeoKey, calendarItems, cellOf, isoDay, itemsBy, level, mercator, regionsOf } from "../src/runtime/svgCharts";
import { chartSpecHtml } from "../src/document";
import { parseDataReply, toCsv } from "../src/csv";
import { pixelDiff } from "../src/snapshotDiff";

const note = (title: string, tasks: any[]): any => ({ title, path: `P/${title}.md`, folder: "P", tags: [], frontmatter: {}, mtime: 0, tasks });

test("taskRows: one row per task with its note", () => {
	const rows = taskRows([
		note("A", [{ text: "x", status: " ", done: false, line: 3, due: "2026-10-20", tags: ["#w"], priority: "high" }]),
		note("B", [{ text: "y", status: "x", done: true, line: 5, doneDate: "2026-10-01", tags: [] }]),
		note("C", []),
		{ ...note("D", []), tasks: undefined },
	]);
	assert.equal(rows.length, 2);
	assert.deepEqual(rows[0], { text: "x", done: false, status: " ", due: "2026-10-20", scheduled: null, start: null, doneDate: null, priority: "high", tags: ["#w"], note: "A", path: "P/A.md", folder: "P", line: 3 });
	assert.equal(rows[1].doneDate, "2026-10-01");
	assert.ok(rows.columns.includes("note"));
	const cfg: any = chartConfig({ type: "hbar", x: "note", aggregate: "count", filter: { done: false } }, rows);
	assert.deepEqual(cfg.data.labels, ["A"]);
	assert.deepEqual(cfg.data.datasets[0].data, [1]);
});

test("folder/tag warning accepts source: tasks", () => {
	assert.deepEqual(specWarnings({ source: "tasks", folder: "P" }, null), []);
	assert.equal(specWarnings({ source: "^t", folder: "P" }, null).length, 1);
});

test("specs of earlier versions get no new warnings", () => {
	const rows = [{ q: "Q1", a: 1, b: 2 }];
	for (const spec of [{ type: "bar", source: "^t", x: "q", y: ["a", "b"] }, { type: "line", source: "^t", series: "q", stacked: true, options: {} }, { type: "doughnut", source: "notes", folder: "X", tag: "y" }])
		assert.deepEqual(specWarnings(spec as any, spec.source === "notes" ? null : rows).filter((w) => !w.includes("not found")), []);
});

test("resolveFilter: $shared values, unset keys dropped, (none) matches empty", () => {
	const shared: Record<string, unknown> = { genre: "Sachbuch", empty: NONE };
	const get = (k: string) => shared[k];
	assert.deepEqual(resolveFilter({ genre: "$shared.genre", year: 2024, gone: "$shared.nothing" }, get), { genre: "Sachbuch", year: 2024 });
	assert.deepEqual(resolveFilter({ x: "$shared.empty" }, get), { x: [null, undefined, ""] });
	assert.equal(resolveFilter(undefined, get), undefined);
	assert.deepEqual(sharedKeys({ filter: { a: "$shared.k1", b: "plain" }, select: "k2" }), ["k1", "k2"]);
	const rows = [{ g: "Roman", n: 1 }, { g: "Sachbuch", n: 2 }];
	const cfg: any = chartConfig({ type: "bar", x: "g", y: "n", filter: resolveFilter({ g: "$shared.genre" }, get) }, rows);
	assert.deepEqual(cfg.data.labels, ["Sachbuch"]);
});

test("chartTable: labeled data and points", () => {
	const cfg: any = chartConfig({ type: "bar", x: "q", y: ["a", "b"] }, [{ q: "Q1", a: 1, b: 2 }, { q: "Q2", a: 3, b: null }]);
	assert.deepEqual(chartTable(cfg, "q"), { columns: ["q", "a", "b"], rows: [["Q1", 1, 2], ["Q2", 3, null]] });
	const sc: any = chartConfig({ type: "scatter", x: "x", y: "y" }, [{ x: 1, y: 2 }]);
	assert.deepEqual(chartTable(sc), { columns: ["x", "y"], rows: [[1, 2]] });
});

test("isoDay, cellOf, level", () => {
	assert.equal(isoDay("2026-10-18"), "2026-10-18");
	assert.equal(isoDay("2026-10-18T09:00"), "2026-10-18");
	assert.equal(isoDay("2026-10-18 Sat"), "2026-10-18");
	assert.equal(isoDay("2026-02-30"), null);
	assert.equal(isoDay("Dune"), null);
	assert.equal(isoDay(20261018), null);
	// 2026-01-01 is a Thursday: column 0, row 3 (Monday first).
	assert.deepEqual(cellOf("2026-01-01"), { year: 2026, col: 0, row: 3 });
	assert.deepEqual(cellOf("2026-01-05"), { year: 2026, col: 1, row: 0 });
	assert.equal(cellOf("2024-12-31").col, 52);
	// A leap year that starts on a Sunday needs the 54th column.
	assert.equal(cellOf("2012-12-31").col, 53);
	assert.equal(level(null, 0, 1), 0);
	assert.equal(level(3, 3, 3), 4);
	assert.deepEqual([1, 2, 3, 4, 5].map((v) => level(v, 1, 5)), [1, 2, 3, 4, 4]);
});

test("calendarItems: count per day, sum of y, booleans", () => {
	const rows = [
		{ title: "2026-10-01", mood: 3, sport: true },
		{ title: "2026-10-01", mood: 4, sport: false },
		{ title: "2026-10-02", mood: null, sport: false },
		{ title: "Reading list", mood: 5 },
	];
	const count = calendarItems({ type: "calendar" }, rows);
	assert.deepEqual([...count.values()].map((i) => [i.key, i.value]), [["2026-10-01", 2], ["2026-10-02", 1]]);
	const sum = calendarItems({ type: "calendar", y: "mood" }, rows);
	assert.equal(sum.get("2026-10-01")?.value, 7);
	assert.equal(sum.get("2026-10-02")?.value, null);
	assert.equal(calendarItems({ type: "calendar", y: "mood", aggregate: "avg" }, rows).get("2026-10-01")?.value, 3.5);
	assert.equal(calendarItems({ type: "calendar", y: "sport" }, rows).get("2026-10-01")?.value, 1);
	assert.equal(calendarItems({ type: "calendar", y: "mood", filter: { sport: true } }, rows).size, 1);
	assert.equal(itemsBy({ y: "mood" }, rows, () => "all").get("all")?.value, 12);
});

const square = (name: string, lon: number, lat: number) => ({
	type: "Feature",
	properties: { NAME: name, iso: name.slice(0, 2).toUpperCase() },
	geometry: { type: "Polygon", coordinates: [[[lon, lat], [lon + 1, lat], [lon + 1, lat + 1], [lon, lat + 1], [lon, lat]]] },
});

test("regionsOf and bestGeoKey", () => {
	const geo = {
		type: "FeatureCollection",
		features: [square("Germany", 10, 50), square("France", 2, 46), { type: "Feature", properties: { NAME: "Point" }, geometry: { type: "Point", coordinates: [0, 0] } }],
	};
	const regions = regionsOf(geo);
	assert.equal(regions.length, 2);
	assert.equal(regions[0].rings[0].length, 5);
	assert.equal(bestGeoKey(regions, ["germany", "France"]), "NAME");
	assert.equal(bestGeoKey(regions, ["GE", "FR"]), "iso");
	assert.equal(regionsOf({ type: "MultiPolygon", coordinates: [square("a", 0, 0).geometry.coordinates] }).length, 1);
	assert.equal(regionsOf(null).length, 0);
	const [x, y] = mercator([0, 0]);
	assert.ok(Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12);
	assert.ok(Number.isFinite(mercator([0, 90])[1]));
});

test("calendar and map blocks size themselves", () => {
	assert.ok(!chartSpecHtml({ type: "calendar" }).includes("height:"));
	assert.ok(!chartSpecHtml({ type: "map", geo: "x.geojson" }).includes("height:"));
	assert.ok(chartSpecHtml({ type: "bar" }).includes("height:300px"));
});

test("toCsv: locale separators, quoting, formulas, BOM", () => {
	const table = { columns: ["Name", "Wert"], rows: [["Müller; GmbH", 1.5], ["=SUM(A1)", -2], ['say "hi"', null], [["a", "b"], 3], ["-", 0]] };
	const de = toCsv(table, "de");
	assert.ok(de.startsWith("﻿Name;Wert\r\n"));
	assert.ok(de.includes('"Müller; GmbH";1,5\r\n'));
	assert.ok(de.includes("'=SUM(A1);-2\r\n"));
	assert.ok(de.includes('"say ""hi""";\r\n'));
	assert.ok(de.includes('a, b;3\r\n'));
	assert.ok(de.includes("'-;0\r\n"));
	const en = toCsv(table, "en");
	assert.ok(en.includes("Müller; GmbH,1.5\r\n"));
	assert.ok(en.includes('"a, b",3\r\n'));
});

test("parseDataReply rejects what is not a table", () => {
	assert.deepEqual(parseDataReply('{"columns":["a"],"rows":[[1]]}'), { columns: ["a"], rows: [[1]] });
	for (const bad of ["", "null", '{"columns":"a","rows":[]}', '{"columns":[],"rows":[1]}', "<svg/>"]) assert.throws(() => parseDataReply(bad));
});

test("pixelDiff", () => {
	const img = (w: number, h: number, v: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(v) });
	assert.equal(pixelDiff(img(10, 10, 100), img(10, 10, 110)), 0);
	assert.equal(pixelDiff(img(10, 10, 0), img(10, 10, 255)), 100);
	assert.equal(pixelDiff(img(10, 10, 0), img(10, 20, 0)), 50);
	const b = img(10, 10, 0);
	b.data.fill(255, 0, 4 * 10); // first row
	assert.equal(pixelDiff(img(10, 10, 0), b), 10);
	assert.equal(pixelDiff(img(0, 0, 0), img(0, 0, 0)), 0);
});
