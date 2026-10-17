import { test } from "node:test";
import assert from "node:assert/strict";
import type { CachedMetadata } from "obsidian";
import { lookupTable, noteTables } from "../src/noteInfo";
import { applyLineEdit, lineEditFor } from "../src/noteEdit";

/** Metadata cache with one table section over the given 0-based lines. */
const cacheFor = (start: number, end: number) =>
	({ sections: [{ type: "table", position: { start: { line: start, col: 0, offset: 0 }, end: { line: end, col: 0, offset: 0 } } }], headings: [] }) as unknown as CachedMetadata;

test("noteTables still sees the id after addRow moved it to the new last row", () => {
	const note = "| Day | Done |\n| --- | --- |\n| Mon | 1 | ^habits\n\ntext";
	assert.equal(noteTables(note, cacheFor(0, 2))[0].id, "habits");
	const after = applyLineEdit(note, lineEditFor(note, { kind: "row", table: "^habits", values: ["Tue", 0] }));
	const [table] = noteTables(after, cacheFor(0, 3));
	assert.equal(table.id, "habits");
	assert.deepEqual(table.rows, [["Mon", "1"], ["Tue", "0"]]);
});

test("lookupTable: the shared rule of prism.note().table() and prism.edit", () => {
	// The iframe's tables have columns/rows instead of header/rows; only id, heading and order count.
	const tables = [
		{ index: 0, heading: "Workout log", columns: ["A"] },
		{ index: 1, id: "habits", heading: "Log", columns: ["A"] },
		{ index: 2, id: "log", heading: "Other", columns: ["A"] },
	];
	assert.equal(lookupTable(tables, undefined)?.index, 0);
	assert.equal(lookupTable(tables, 0)?.index, 0);
	assert.equal(lookupTable(tables, 1)?.index, 1);
	assert.equal(lookupTable(tables, 3), undefined);
	assert.equal(lookupTable(tables, -1), undefined);
	assert.equal(lookupTable(tables, "^habits")?.index, 1);
	assert.equal(lookupTable(tables, "habits")?.index, 1);
	assert.equal(lookupTable(tables, "log")?.index, 2);
	assert.equal(lookupTable(tables, "  LOG ")?.index, 1);
	// "^" only marks an id; it is not stripped for headings.
	assert.equal(lookupTable(tables, "^Log"), undefined);
	assert.equal(lookupTable(tables, "WORK")?.index, 0);
	assert.equal(lookupTable(tables, "missing"), undefined);
	assert.equal(lookupTable([], 0), undefined);
});
