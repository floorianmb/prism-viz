import { test } from "node:test";
import assert from "node:assert/strict";
import { timelineLayout } from "../src/runtime/timeline";

const L = (spec: object, rows: Record<string, unknown>[], today = "2026-10-18") => timelineLayout(spec as never, rows, today, "en");
const tasks = [
	{ text: "B", start: "2026-10-05", due: "2026-10-09", done: true, note: "n1" },
	{ text: "A", start: "2026-10-01", due: "2026-10-03", note: "n2" },
];

test("default columns: tasks, notes, generic", () => {
	const r = L({}, tasks);
	assert.deepEqual(r.items.map((i) => i.label), ["A", "B"]);
	assert.equal(r.items[0].kind, "bar");
	assert.equal(r.items[1].done, true);
	const n = L({}, [{ title: "N", scheduled: "2026-10-01", end: "2026-10-02" }]);
	assert.equal(n.items[0].label, "N");
	assert.equal(n.items[0].end, "2026-10-02");
	const g = L({}, [{ name: "G", date: "2026-10-01" }]);
	assert.equal(g.items[0].label, "G");
	assert.equal(g.items[0].kind, "milestone");
});

test("bar is end-inclusive, milestone is one point, end<start warns once", () => {
	const r = L({}, [{ text: "a", start: "2026-10-01", due: "2026-10-01" }, { text: "m", start: "2026-10-02" }, { text: "r", start: "2026-10-05", due: "2026-10-03" }, { text: "o", due: "2026-10-04" }]);
	const by = (l: string) => r.items.find((i) => i.label === l)!;
	assert.equal(by("a").kind, "bar");
	assert.ok(by("a").x2 > by("a").x1);
	assert.equal(by("m").x1, by("m").x2);
	assert.equal(by("r").kind, "milestone");
	assert.equal(by("r").start, "2026-10-05");
	assert.equal(by("o").kind, "milestone");
	assert.equal(r.warnings.filter((w) => w.includes("end before start")).length, 1);
	assert.match(r.warnings[0], /1 row /);
});

test("rows without dates are hidden and counted", () => {
	const r = L({}, [...tasks, { text: "x" }, { text: "y", start: "soon" }]);
	assert.equal(r.hidden, 2);
	assert.equal(r.items.length, 2);
	assert.equal(L({}, [{ text: "x" }]).items.length, 0);
});

test("sort and limit", () => {
	assert.deepEqual(L({ sort: "-text" }, tasks).items.map((i) => i.label), ["B", "A"]);
	assert.deepEqual(L({ limit: 1 }, tasks).items.map((i) => i.label), ["A"]);
	const many = Array.from({ length: 250 }, (_, i) => ({ text: `t${i}`, start: "2026-10-01" }));
	const r = L({}, many);
	assert.equal(r.items.length, 200);
	assert.equal(r.more, 50);
	assert.equal(L({ limit: 5 }, many).more, 0);
});

test("missing columns and ignored keys warn", () => {
	const r = L({ start: "nope", stacked: true, group: "week" }, tasks);
	assert.equal(r.warnings.length, 3);
	assert.equal(r.items.length, 2); // falls back to the end dates as milestones
});

test("tick unit follows the span", () => {
	const span = (days: number) => L({}, [{ text: "a", start: "2026-01-01", end: new Date(Date.UTC(2026, 0, 1 + days)).toISOString().slice(0, 10) }]).ticks;
	assert.ok(span(10).length >= 10 && span(10).length <= 14); // days
	const weeks = span(60);
	assert.ok(weeks.length >= 8 && weeks.length <= 10);
	const months = span(300).filter((t) => t.label);
	assert.ok(months.length >= 6 && months.length <= 13);
	assert.match(months[0].label, /\d{2}$/);
	const years = span(2000);
	assert.ok(years.length >= 5 && years.length <= 7);
	assert.match(years[0].label, /^\d{4}$/);
});

test("today line only within the range", () => {
	assert.notEqual(L({}, tasks, "2026-10-04").todayX, null);
	assert.equal(L({}, tasks, "2027-01-01").todayX, null);
	assert.equal(L({}, tasks, "2026-01-01").todayX, null);
});

test("series get one color index per value in order of appearance", () => {
	const r = L({ series: "note" }, tasks);
	assert.deepEqual(r.series, ["n2", "n1"]);
	assert.equal(L({}, tasks).items[0].series, null);
});
