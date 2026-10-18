import { test } from "node:test";
import assert from "node:assert/strict";
import { formatKpi, kpiDelta, kpiGoal, kpiValues } from "../src/runtime/kpi";

const rows = [
	{ d: "2026-08-03", pages: 100, read: true },
	{ d: "2026-08-20", pages: 50, read: false },
	{ d: "2026-10-05", pages: 200, read: true },
	{ d: "nope", pages: 7, read: true },
];

test("totals per y, count without y, booleans", () => {
	const r = kpiValues({ y: ["pages", "read"] }, rows, "2026-10-18");
	assert.deepEqual(r.tiles.map((t) => [t.label, t.value]), [["pages", 357], ["read", 3]]);
	assert.equal(kpiValues({}, rows, "2026-10-18", "de").tiles[0].label, "Anzahl");
	assert.equal(kpiValues({}, rows, "2026-10-18").tiles[0].value, 4);
	assert.equal(kpiValues({ y: "pages", aggregate: "avg" }, rows, "2026-10-18").tiles[0].value, 89.25);
	assert.equal(kpiValues({ y: "pages" }, [], "2026-10-18").tiles[0].value, null);
});

test("group fills gaps up to today, value is the current period", () => {
	const r = kpiValues({ y: "pages", x: "d", group: "month" }, rows, "2026-11-02");
	assert.deepEqual(r.periods, ["2026-08", "2026-09", "2026-10", "2026-11"]);
	assert.deepEqual(r.tiles[0].series, [150, 0, 200, 0]);
	assert.equal(r.tiles[0].value, 0);
	assert.equal(r.tiles[0].previous, 200);
	const avg = kpiValues({ y: "pages", x: "d", group: "month", aggregate: "avg" }, rows, "2026-10-18");
	assert.deepEqual(avg.tiles[0].series, [75, null, 200]);
	// data after today extends the range
	assert.equal(kpiValues({ x: "d", group: "month" }, rows, "2026-09-01").periods.at(-1), "2026-10");
});

test("delta: percent, zero previous gives absolute difference", () => {
	assert.deepEqual(kpiDelta(120, 100), { kind: "percent", amount: 0.2 });
	assert.deepEqual(kpiDelta(5, 0), { kind: "abs", amount: 5 });
	assert.equal(kpiDelta(null, 1), null);
	assert.equal(kpiDelta(1, null), null);
});

test("goal percent", () => {
	assert.equal(kpiGoal(320, 500)?.percent, 64);
	assert.equal(kpiGoal(320, 500)?.reached, false);
	assert.equal(kpiGoal(600, 500)?.reached, true);
	assert.equal(kpiGoal(null, 500), null);
});

test("formatKpi per format in de and en", () => {
	assert.equal(formatKpi(null, "number", undefined, "de"), "–");
	assert.equal(formatKpi(1234.567, "number", undefined, "en"), "1,234.57");
	assert.equal(formatKpi(1234.567, undefined, undefined, "de"), "1.234,57");
	assert.equal(formatKpi(1234.567, "integer", undefined, "de"), "1.235");
	assert.equal(formatKpi(1234.567, "number", 1, "en"), "1,234.6");
	assert.equal(formatKpi(0.256, "percent", undefined, "en"), "25.6%");
	assert.equal(formatKpi(25.6, "percent", undefined, "en"), "25.6%");
	assert.equal(formatKpi(0.25, "percent", 0, "de").replace(/\s/g, " "), "25 %");
	assert.equal(formatKpi(1234.5, "eur", undefined, "de").replace(/\s/g, " "), "1.235 €");
	assert.equal(formatKpi(1234.5, "usd", 2, "en"), "$1,234.50");
});

test("warnings", () => {
	const w = kpiValues({ group: "month", select: "k", lines: [{ y: 1 }], series: "s", stacked: true }, rows, "2026-10-18").warnings;
	assert.equal(w.length, 5);
	assert.ok(w.includes('prism.chart: type kpi needs "x" (a date column) for group'));
	assert.deepEqual(kpiValues({ y: "pages" }, rows, "2026-10-18").warnings, []);
});

test("group: an invalid period gives no trend", () => {
	const r = kpiValues({ y: "pages", x: "d", group: "monthly" }, rows, "2026-10-18");
	assert.equal(r.group, null);
	assert.deepEqual(r.tiles[0].series, []);
});

test("formatKpi pins the outputs of prism.format", () => {
	const f = (v: number, k?: string, d?: number) => formatKpi(v, k, d, "en");
	assert.equal(f(1234.567), "1,234.57");
	assert.equal(f(1234.567, "integer"), "1,235");
	assert.equal(f(0.123, "percent"), "12.3%");
	assert.equal(f(12, "percent"), "12%");
	assert.equal(f(1234.5, "eur"), "€1,235");
	assert.equal(f(1234.5, "usd", 2), "$1,234.50");
	assert.equal(f(3, "number", 2), "3.00");
});
