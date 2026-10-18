import { test } from "node:test";
import assert from "node:assert/strict";
import { rowTarget, rowsAt } from "../src/runtime/trace";
import { NONE } from "../src/runtime/chartSpec";

const rows = [
	{ g: "Run", n: 30, d: "2026-09-01", tags: ["a", "b"] },
	{ g: "Bike", n: 45, d: "2026-09-20", tags: ["b"] },
	{ g: "Run", n: 20, d: "2026-10-02", tags: [] },
	{ g: "", n: 5, d: null, tags: [] },
];

test("rowsAt: label, series, filter, group, lists and (none)", () => {
	assert.deepEqual(rowsAt({ x: "g" }, rows, "Run").map((r) => r.n), [30, 20]);
	assert.deepEqual(rowsAt({ x: "g", filter: { n: 20 } }, rows, "Run").map((r) => r.n), [20]);
	assert.deepEqual(rowsAt({ x: "d", group: "month" }, rows, "2026-09").map((r) => r.n), [30, 45]);
	assert.deepEqual(rowsAt({ x: "tags" }, rows, "b").map((r) => r.n), [30, 45]);
	assert.deepEqual(rowsAt({ x: "g", aggregate: "count" }, rows, NONE).map((r) => r.n), [5]);
	assert.deepEqual(rowsAt({ x: "d", series: "g" }, rows, "2026-09-20", "Bike").map((r) => r.n), [45]);
	assert.deepEqual(rowsAt({ x: "d", series: "g" }, rows, "2026-09-20", "Run"), []);
	// numbers compare as chart labels do (text)
	assert.deepEqual(rowsAt({ x: "n" }, rows, "45").map((r) => r.g), ["Bike"]);
});

test("rowTarget: table row, note, task line", () => {
	const lines = new Map<object, number>([[rows[1], 12]]);
	const lineOf = (r: object) => lines.get(r);
	assert.deepEqual(rowTarget([rows[1], rows[0]], "Me.md", lineOf, false), { path: "Me.md", line: 12, preview: false });
	assert.equal(rowTarget([rows[0]], "Me.md", lineOf, false), null);
	assert.equal(rowTarget([], "Me.md", lineOf, false), null);
	const notes = [{ path: "A.md", line: 4 }, { path: "A.md", line: 9 }];
	assert.deepEqual(rowTarget(notes, "Me.md", lineOf, true), { path: "A.md", line: undefined, preview: true });
	assert.deepEqual(rowTarget([notes[1]], "Me.md", lineOf, true), { path: "A.md", line: 9, preview: true });
	// a frontmatter property named "line" is no task line
	assert.deepEqual(rowTarget([notes[1]], "Me.md", lineOf, false), { path: "A.md", line: undefined, preview: true });
	assert.equal(rowTarget([{ path: "A.md" }, { path: "B.md" }], "Me.md", lineOf, false), null);
});
