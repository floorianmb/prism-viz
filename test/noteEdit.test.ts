import { test } from "node:test";
import assert from "node:assert/strict";
import { addRow, applyLineEdit, findTable, lineEditFor, scanTables, setCell, setTask } from "../src/noteEdit";
import type { NoteTable } from "../src/protocol";

const add = (text: string, values: unknown[], table: string | number = "^habits") => applyLineEdit(text, lineEditFor(text, { kind: "row", table, values }));

test("addRow: id on its own line after the table stays put (unchanged output)", () => {
	const note = "| Day | Done |\n| --- | --- |\n| Mon | 1 |\n\n^habits\n\ntext";
	const edit = lineEditFor(note, { kind: "row", table: "^habits", values: ["Tue", 0] });
	assert.deepEqual(edit, { line: 2, text: "| Tue | 0 |", insert: true });
	assert.equal(applyLineEdit(note, edit), "| Day | Done |\n| --- | --- |\n| Mon | 1 |\n| Tue | 0 |\n\n^habits\n\ntext");
});

test("addRow: table without id appends a plain row", () => {
	const plain = "# Log\n| Day | Done |\n| --- | --- |\n| Mon | 1 |\n\ntext";
	assert.deepEqual(lineEditFor(plain, { kind: "row", values: { Done: 1, Day: "Tue" } }), { line: 3, text: "| Tue | 1 |", insert: true });
	assert.equal(add(plain, ["Tue", 1], 0), "# Log\n| Day | Done |\n| --- | --- |\n| Mon | 1 |\n| Tue | 1 |\n\ntext");
});

test("addRow: id at the end of the last row moves to the new row, as one replace", () => {
	const note = "| Day | Done |\n| --- | --- |\n| Mon | 1 | ^habits\n\ntext";
	const edit = lineEditFor(note, { kind: "row", table: "^habits", values: ["Tue", 0] });
	assert.deepEqual(edit, { line: 2, text: "| Mon | 1 |\n| Tue | 0 | ^habits" });
	const once = applyLineEdit(note, edit);
	assert.equal(once, "| Day | Done |\n| --- | --- |\n| Mon | 1 |\n| Tue | 0 | ^habits\n\ntext");
	const [table] = scanTables(once);
	assert.equal(table.id, "habits");
	assert.deepEqual(table.rows, [["Mon", "1"], ["Tue", "0"]]);
	// A second addRow still finds the table.
	const twice = add(once, ["Wed", 1]);
	assert.equal(twice, "| Day | Done |\n| --- | --- |\n| Mon | 1 |\n| Tue | 0 |\n| Wed | 1 | ^habits\n\ntext");
	// setCell on the row that carries the id keeps it.
	const cell = applyLineEdit(twice, lineEditFor(twice, { kind: "cell", table: "^habits", row: 2, column: "Done", value: 0 }));
	assert.equal(cell, "| Day | Done |\n| --- | --- |\n| Mon | 1 |\n| Tue | 0 |\n| Wed | 0 | ^habits\n\ntext");
	// setCell on the row that lost the id.
	const cell2 = applyLineEdit(cell, lineEditFor(cell, { kind: "cell", table: "habits", row: 0, column: 1, value: "x" }));
	assert.equal(cell2, "| Day | Done |\n| --- | --- |\n| Mon | x |\n| Tue | 0 |\n| Wed | 0 | ^habits\n\ntext");
});

test("addRow: id suffix keeps its spacing; CRLF lines keep their CR", () => {
	const table = scanTables("| A |\n| - |\n| 1 |  ^t-1  \n")[0];
	assert.equal(addRow("| A |\n| - |\n| 1 |  ^t-1  \n", table, ["2"]).text, "| 1 |\n| 2 | ^t-1  ");
	const crlf = "| A |\r\n| - |\r\n| 1 | ^t\r\n\r\nx";
	const out = add(crlf, ["2"], "t");
	assert.equal(out, "| A |\r\n| - |\r\n| 1 |\r\n| 2 | ^t\r\n\r\nx");
	assert.equal(scanTables(out)[0].id, "t");
});

test("addRow: an already damaged note (id on a middle row) gets a plain row, as before", () => {
	const note = "| Day | Done |\n| --- | --- |\n| Mon | 1 | ^habits\n| Tue | 0 |\n\ntext";
	assert.deepEqual(lineEditFor(note, { kind: "row", values: ["Wed", 1] }), { line: 3, text: "| Wed | 1 |", insert: true });
});

test("setTask: toggling uses the same done rule as prism.note() (only x/X is done)", () => {
	const toggle = (status: string) => setTask(`- [${status}] Write report`, { line: 1 }, undefined).text;
	assert.equal(toggle(" "), "- [x] Write report");
	assert.equal(toggle("x"), "- [ ] Write report");
	assert.equal(toggle("X"), "- [ ] Write report");
	assert.equal(toggle("/"), "- [x] Write report");
	assert.equal(toggle("-"), "- [x] Write report");
	assert.equal(toggle(">"), "- [x] Write report");
});

test("setTask: explicit done behaves as before for every status", () => {
	for (const status of [" ", "x", "X", "/", "-"]) {
		assert.equal(setTask(`- [${status}] a`, { line: 1 }, true).text, "- [x] a");
		assert.equal(setTask(`- [${status}] a`, { line: 1 }, false).text, "- [ ] a");
	}
});

test("findTable: index, default, ^id, id, exact heading, heading part, miss", () => {
	const t = (index: number, id?: string, heading?: string): NoteTable => ({ index, id, heading, lines: { start: 1, end: 3 }, header: ["A"], rows: [] });
	const tables = [t(0, undefined, "Workout log"), t(1, "habits", "Log"), t(2, "log", "Other")];
	assert.equal(findTable(tables, undefined).index, 0);
	assert.equal(findTable(tables, 2).index, 2);
	assert.equal(findTable(tables, "^habits").index, 1);
	assert.equal(findTable(tables, " habits ").index, 1);
	// An id wins over a heading; an exact heading over a part of one.
	assert.equal(findTable(tables, "log").index, 2);
	assert.equal(findTable(tables, "LOG").index, 1);
	assert.equal(findTable(tables, "workout").index, 0);
	assert.throws(() => findTable(tables, "nope"), /no table "nope"/);
	assert.throws(() => findTable(tables, 5), /no table 5/);
});
