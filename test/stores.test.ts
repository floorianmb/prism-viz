import { test } from "node:test";
import assert from "node:assert/strict";
import { StateStore, alignBlocks, type BlockPrint } from "../src/stores";

// Pins the current behavior of per-block state (prism.state) and the block
// alignment that keeps position-keyed state with its block ("note.md#0").
// Prints are hex hashes like the real ones; "id:x" marks blocks with id=.

const P1 = "aaaa111100001111";
const P2 = "bbbb222200002222";
const P3 = "cccc333300003333";
const P4 = "dddd444400004444";

function block(print: string, key: string): BlockPrint {
	return { print, key };
}

function makeStore(data: Record<string, Record<string, unknown>> = {}, prints: Record<string, string[]> = {}) {
	const log = { saves: 0, tracked: [] as string[] };
	const store = new StateStore(data, prints, () => log.saves++, (path) => log.tracked.push(path));
	return { store, data, prints, log };
}

function pairsOf(m: Map<number, number>): [number, number][] {
	return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

test("alignBlocks pairs identical lists one to one", () => {
	assert.deepEqual(pairsOf(alignBlocks(["a", "b", "c"], ["a", "b", "c"])), [[0, 0], [1, 1], [2, 2]]);
});

test("alignBlocks: an inserted block gets no old partner", () => {
	assert.deepEqual(pairsOf(alignBlocks(["a", "b"], ["a", "x", "b"])), [[0, 0], [1, 2]]);
});

test("alignBlocks: a removed block has no new partner", () => {
	assert.deepEqual(pairsOf(alignBlocks(["a", "x", "b"], ["a", "b"])), [[0, 0], [2, 1]]);
});

test("alignBlocks: an edited block in the middle with the same count is paired in order", () => {
	assert.deepEqual(pairsOf(alignBlocks(["a", "b", "c"], ["a", "B", "c"])), [[0, 0], [1, 1], [2, 2]]);
});

test("alignBlocks: an edit that changes the count pairs only the unchanged blocks", () => {
	assert.deepEqual(pairsOf(alignBlocks(["a", "b"], ["a", "x", "y"])), [[0, 0]]);
});

test("alignBlocks: swapped blocks keep only one pair", () => {
	assert.deepEqual(pairsOf(alignBlocks(["a", "b"], ["b", "a"])), [[1, 0]]);
});

test("alignBlocks: empty lists", () => {
	assert.deepEqual(pairsOf(alignBlocks([], [])), []);
	assert.deepEqual(pairsOf(alignBlocks([], ["a"])), []);
	assert.deepEqual(pairsOf(alignBlocks(["a"], [])), []);
});

test("StateStore set and get merge keys and get returns a copy", () => {
	const { store, data, log } = makeStore();
	store.set("n.md#0", "a", 1);
	store.set("n.md#0", "b", "two");
	assert.deepEqual(store.get("n.md#0"), { a: 1, b: "two" });
	assert.deepEqual(data["n.md#0"], { a: 1, b: "two" });
	assert.equal(log.saves, 2);
	const copy = store.get("n.md#0");
	copy.a = 99;
	assert.equal(store.get("n.md#0").a, 1);
});

test("StateStore get of an unknown block is an empty object", () => {
	const { store } = makeStore();
	assert.deepEqual(store.get("missing.md#0"), {});
});

test("StateStore delete removes one key, then the block when it is empty", () => {
	const { store, data, log } = makeStore();
	store.set("n.md#0", "a", 1);
	store.set("n.md#0", "b", 2);
	store.delete("n.md#0", "a");
	assert.deepEqual(data["n.md#0"], { b: 2 });
	store.delete("n.md#0", "b");
	assert.equal("n.md#0" in data, false);
	assert.equal(log.saves, 4);
});

test("StateStore delete of a missing key or block does not save", () => {
	const { store, log } = makeStore();
	store.delete("n.md#0", "a");
	store.set("n.md#0", "a", 1);
	store.delete("n.md#0", "zzz");
	assert.equal(log.saves, 1);
});

test("StateStore set tracks a position-keyed note that has no recorded prints", () => {
	const { store, log } = makeStore();
	store.set("n.md#0", "a", 1);
	assert.deepEqual(log.tracked, ["n.md"]);
});

test("StateStore set does not track a note with recorded prints, id blocks or HTML files", () => {
	const { store, log } = makeStore({}, { "n.md": [P1] });
	store.set("n.md#0", "a", 1);
	store.set("n.md#id:x", "a", 1);
	store.set("file:page.html", "a", 1);
	assert.deepEqual(log.tracked, []);
});

test("StateStore set throws over 512 KB for the whole block and stores nothing", () => {
	const { store, data, log } = makeStore();
	assert.throws(
		() => store.set("n.md#0", "big", "x".repeat(600 * 1024)),
		/^Error: prism\.state for this block would exceed 512 KB \(600 KB\)\.$/
	);
	assert.equal("n.md#0" in data, false);
	assert.equal(log.saves, 0);
	assert.deepEqual(log.tracked, []);
});

test("StateStore size limit counts the whole block, not only the new value", () => {
	const { store } = makeStore();
	store.set("n.md#0", "a", "x".repeat(300 * 1024));
	assert.throws(() => store.set("n.md#0", "b", "x".repeat(300 * 1024)), /would exceed 512 KB/);
});

test("StateStore size limit: a block of exactly 512 KB JSON is allowed, one more character is not", () => {
	// JSON.stringify({ k: s }).length === s.length + 8
	const { store } = makeStore();
	store.set("n.md#0", "k", "x".repeat(512 * 1024 - 8));
	assert.throws(() => store.set("n.md#1", "k", "x".repeat(512 * 1024 - 7)), /would exceed 512 KB/);
});

test("StateStore realign records prints of a note seen for the first time without moving state", () => {
	const { store, data, prints, log } = makeStore({ "n.md#0": { a: 1 } }, {});
	assert.equal(store.realign("n.md", [block(P1, "n.md#0")]), false);
	assert.deepEqual(prints, { "n.md": [P1] });
	assert.deepEqual(data, { "n.md#0": { a: 1 } });
	assert.equal(log.saves, 1);
});

test("StateStore realign with unchanged blocks changes nothing and does not save", () => {
	const { store, log } = makeStore({ "n.md#0": { a: 1 } }, { "n.md": [P1] });
	assert.equal(store.realign("n.md", [block(P1, "n.md#0")]), false);
	assert.equal(log.saves, 0);
});

test("StateStore realign moves position state down when a block is inserted above", () => {
	const { store, data, prints } = makeStore(
		{ "n.md#0": { a: 1 }, "n.md#1": { b: 2 } },
		{ "n.md": [P1, P2] }
	);
	assert.equal(store.realign("n.md", [block(P3, "n.md#0"), block(P1, "n.md#1"), block(P2, "n.md#2")]), true);
	assert.deepEqual(data, { "n.md#1": { a: 1 }, "n.md#2": { b: 2 } });
	assert.deepEqual(prints, { "n.md": [P3, P1, P2] });
});

test("StateStore realign parks the state of a removed block and returns it when the source comes back", () => {
	const { store, data, prints } = makeStore(
		{ "n.md#0": { a: 1 }, "n.md#1": { b: 2 }, "n.md#2": { c: 3 } },
		{ "n.md": [P1, P2, P3] }
	);
	// block 2 (P2) is removed
	assert.equal(store.realign("n.md", [block(P1, "n.md#0"), block(P3, "n.md#1")]), true);
	assert.deepEqual(data, {
		"n.md#0": { a: 1 },
		"n.md#1": { c: 3 },
		"n.md#hbbbb222200": { b: 2 },
	});
	assert.deepEqual(prints, { "n.md": [P1, P3] });

	// the block comes back in the middle
	assert.equal(store.realign("n.md", [block(P1, "n.md#0"), block(P2, "n.md#1"), block(P3, "n.md#2")]), true);
	assert.deepEqual(data, { "n.md#0": { a: 1 }, "n.md#1": { b: 2 }, "n.md#2": { c: 3 } });
	assert.deepEqual(prints, { "n.md": [P1, P2, P3] });
});

test("StateStore realign keeps the state of a block that was edited in place", () => {
	const { store, data, prints } = makeStore(
		{ "n.md#0": { a: 1 }, "n.md#1": { b: 2 } },
		{ "n.md": [P1, P2] }
	);
	assert.equal(store.realign("n.md", [block(P1, "n.md#0"), block(P4, "n.md#1")]), true);
	assert.deepEqual(data, { "n.md#0": { a: 1 }, "n.md#1": { b: 2 } });
	assert.deepEqual(prints, { "n.md": [P1, P4] });
});

test("StateStore realign: a block that just got an id= takes over the state of its position", () => {
	const { store, data, prints } = makeStore({ "n.md#0": { a: 1 } }, { "n.md": [P1] });
	assert.equal(store.realign("n.md", [block("id:x", "n.md#id:x")]), true);
	assert.deepEqual(data, { "n.md#id:x": { a: 1 } });
	// no position keys are left, so the note stops being tracked
	assert.equal("n.md" in prints, false);
});

test("StateStore realign: an id= block does not take over state when its id already has some", () => {
	const { store, data, prints } = makeStore(
		{ "n.md#0": { a: 1 }, "n.md#id:x": { z: 9 } },
		{ "n.md": [P1] }
	);
	assert.equal(store.realign("n.md", [block("id:x", "n.md#id:x")]), true);
	assert.deepEqual(data, { "n.md#id:x": { z: 9 }, "n.md#haaaa111100": { a: 1 } });
	assert.deepEqual(prints, { "n.md": ["id:x"] });
});

test("StateStore realign leaves id-keyed state alone, even when its block is removed", () => {
	const { store, data, prints } = makeStore(
		{ "n.md#id:x": { v: 1 }, "n.md#1": { a: 1 } },
		{ "n.md": ["id:x", P1] }
	);
	assert.equal(store.realign("n.md", [block(P1, "n.md#0")]), true);
	assert.deepEqual(data, { "n.md#id:x": { v: 1 }, "n.md#0": { a: 1 } });
	assert.deepEqual(prints, { "n.md": [P1] });
});

test("StateStore realign stops tracking a note whose blocks changed but have no position state", () => {
	const { store, prints } = makeStore({}, { "n.md": [P1] });
	assert.equal(store.realign("n.md", [block(P2, "n.md#0")]), true);
	assert.equal(store.tracks("n.md"), false);
	assert.equal("n.md" in prints, false);
});

test("StateStore realign keeps tracking while a parked block still has state", () => {
	const { store } = makeStore({ "n.md#0": { a: 1 } }, { "n.md": [P1] });
	assert.equal(store.realign("n.md", []), true);
	assert.equal(store.tracks("n.md"), true);
});

test("StateStore tracks and untracked report notes whose prints are not recorded", () => {
	const { store } = makeStore();
	store.set("n.md#0", "a", 1);
	assert.deepEqual(store.untracked(), ["n.md"]);
	assert.equal(store.tracks("n.md"), false);
	store.realign("n.md", [block(P1, "n.md#0")]);
	assert.deepEqual(store.untracked(), []);
	assert.equal(store.tracks("n.md"), true);
});

test("StateStore rename moves prints, position and id state, and file: state", () => {
	const { store, data, prints, log } = makeStore(
		{
			"a.md#0": { x: 1 },
			"a.md#id:x": { y: 2 },
			"file:a.md": { z: 3 },
			"a.md2#0": { w: 4 },
			"b.md#0": { v: 5 },
		},
		{ "a.md": [P1] }
	);
	store.rename("a.md", "c.md");
	assert.deepEqual(data, {
		"c.md#0": { x: 1 },
		"c.md#id:x": { y: 2 },
		"file:c.md": { z: 3 },
		"a.md2#0": { w: 4 },
		"b.md#0": { v: 5 },
	});
	assert.deepEqual(prints, { "c.md": [P1] });
	assert.equal(log.saves, 1);
});

test("StateStore rename of a note without state does not save", () => {
	const { store, log } = makeStore({ "b.md#0": { v: 5 } }, {});
	store.rename("a.md", "c.md");
	assert.equal(log.saves, 0);
});

test("StateStore removeFile drops prints and state of the note and its HTML file only", () => {
	const { store, data, prints, log } = makeStore(
		{
			"a.md#0": { x: 1 },
			"a.md#id:x": { y: 2 },
			"file:a.md": { z: 3 },
			"a.md2#0": { w: 4 },
			"b.md#0": { v: 5 },
		},
		{ "a.md": [P1], "a.md2": [P2] }
	);
	store.removeFile("a.md");
	assert.deepEqual(data, { "a.md2#0": { w: 4 }, "b.md#0": { v: 5 } });
	assert.deepEqual(prints, { "a.md2": [P2] });
	assert.equal(log.saves, 1);
});

test("StateStore removeFile of an unknown note still saves (delete reports true even for a missing key)", () => {
	const { store, log } = makeStore({ "b.md#0": { v: 5 } }, {});
	store.removeFile("a.md");
	assert.equal(log.saves, 1);
});
