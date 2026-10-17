import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyOptions, fenceOptions, parseOptionString, vizBlockIndex } from "../src/options";

// Pins the current behavior of the fence scanner (vizBlockIndex, fenceOptions)
// and the option parser (parseOptionString). Changing either changes which
// saved widget state a block gets, so these must fail loudly on any change.

function opts(input: string) {
	return parseOptionString(input, emptyOptions());
}

test("vizBlockIndex numbers viz blocks in order", () => {
	const text = ["```viz", "a", "```", "text", "```viz", "b", "```", "```viz", "c", "```"].join("\n");
	assert.equal(vizBlockIndex(text, 0), 0);
	assert.equal(vizBlockIndex(text, 4), 1);
	assert.equal(vizBlockIndex(text, 7), 2);
});

test("vizBlockIndex does not count the block at lineStart itself", () => {
	const text = ["```viz", "a", "```"].join("\n");
	assert.equal(vizBlockIndex(text, 0), 0);
});

test("vizBlockIndex ignores js blocks between viz blocks", () => {
	const text = ["```viz", "a", "```", "```js", "x()", "```", "```viz", "b", "```"].join("\n");
	assert.equal(vizBlockIndex(text, 6), 1);
	assert.equal(vizBlockIndex(text, 8), 2);
});

test("vizBlockIndex ignores a viz fence inside a longer 4-backtick block", () => {
	const text = ["````md", "```viz", "inner", "```", "````", "```viz", "x", "```"].join("\n");
	assert.equal(vizBlockIndex(text, 5), 0);
	// the 4-backtick block closed on line 4, so the ```viz on line 5 counts
	assert.equal(vizBlockIndex(text, 7), 1);
});

test("vizBlockIndex counts tilde viz fences", () => {
	const text = ["~~~viz", "a", "~~~", "```viz", "b", "```"].join("\n");
	assert.equal(vizBlockIndex(text, 3), 1);
});

test("vizBlockIndex: a fence closed with more backticks than it opened with closes the block", () => {
	const text = ["```js", "x", "````", "```viz", "b", "```"].join("\n");
	assert.equal(vizBlockIndex(text, 3), 0);
	assert.equal(vizBlockIndex(text, 5), 1);
});

test("vizBlockIndex: a closing fence followed by text does not close the block", () => {
	const text = ["```js", "```notclosed", "```viz", "```", "```viz", "b"].join("\n");
	// the js block only closes at line 3; the viz fence on line 2 is content
	assert.equal(vizBlockIndex(text, 4), 0);
	assert.equal(vizBlockIndex(text, 5), 1);
});

test("vizBlockIndex: a ~~~ line does not close a ``` block", () => {
	const text = ["```viz", "~~~", "```viz", "```", "```viz", "b"].join("\n");
	assert.equal(vizBlockIndex(text, 2), 1);
	assert.equal(vizBlockIndex(text, 4), 1);
	assert.equal(vizBlockIndex(text, 5), 2);
});

test("vizBlockIndex accepts \"```viz chart\", \"``` viz\" and uppercase VIZ, but not \"```vizzy\"", () => {
	const text = ["```viz chart", "a", "```", "``` viz", "b", "```", "```vizzy", "c", "```", "```VIZ", "d", "```", "```viz", "e", "```"].join("\n");
	assert.equal(vizBlockIndex(text, 3), 1);
	assert.equal(vizBlockIndex(text, 6), 2);
	assert.equal(vizBlockIndex(text, 9), 2);
	assert.equal(vizBlockIndex(text, 12), 3);
	assert.equal(vizBlockIndex(text, 14), 4);
});

test("vizBlockIndex: an unclosed viz block swallows the fences after it", () => {
	const text = ["```viz", "a", "```viz", "```viz", "b"].join("\n");
	assert.equal(vizBlockIndex(text, 2), 1);
	assert.equal(vizBlockIndex(text, 3), 1);
});

test("vizBlockIndex: a viz block after an unclosed one at the end of the note", () => {
	const text = ["```viz", "a", "```", "```viz", "unclosed at end"].join("\n");
	assert.equal(vizBlockIndex(text, 3), 1);
});

test("fenceOptions returns the option string of a viz fence", () => {
	assert.equal(fenceOptions("```viz"), "");
	assert.equal(fenceOptions("```viz chart d3 height=300"), "chart d3 height=300");
	assert.equal(fenceOptions("   ~~~viz   raw  "), "raw");
	assert.equal(fenceOptions("``` viz"), "");
	assert.equal(fenceOptions("````VIZ height=auto"), "height=auto");
});

test("fenceOptions returns null for non-viz lines", () => {
	assert.equal(fenceOptions("```js"), null);
	assert.equal(fenceOptions("```vizzy"), null);
	assert.equal(fenceOptions("``viz"), null);
	assert.equal(fenceOptions("viz"), null);
	assert.equal(fenceOptions("```"), null);
	assert.equal(fenceOptions("text ```viz"), null);
});

test("parseOptionString parses libs, height, title, id and flags", () => {
	const o = opts('chart d3 height=420 title="Arch \\"x\\"" id=my-block raw eager notoolbar');
	assert.deepEqual(o.libs, ["chart", "d3"]);
	assert.equal(o.height, 420);
	assert.equal(o.title, 'Arch "x"');
	assert.equal(o.id, "my-block");
	assert.equal(o.raw, true);
	assert.equal(o.eager, true);
	assert.equal(o.noToolbar, true);
	assert.equal(o.fill, false);
	assert.equal(o.showSource, false);
	assert.deepEqual(o.warnings, []);
});

test("parseOptionString mutates and returns the object it is given", () => {
	const into = emptyOptions();
	assert.equal(parseOptionString("raw", into), into);
	assert.equal(into.raw, true);
});

test("parseOptionString: invalid height adds a warning and keeps the default", () => {
	const o = opts("height=abc");
	assert.equal(o.height, null);
	assert.deepEqual(o.warnings, ['Invalid height "abc" (expected 40-10000, "auto" or "fill").']);
});

test("parseOptionString: height out of range adds a warning", () => {
	assert.equal(opts("height=39").height, null);
	assert.equal(opts("height=39").warnings.length, 1);
	assert.equal(opts("height=10001").height, null);
	assert.equal(opts("height=40").height, 40);
	assert.equal(opts("height=10000").height, 10000);
});

test("parseOptionString: height=auto, bare height and height=fill", () => {
	const auto = opts("height=auto");
	assert.equal(auto.height, null);
	assert.deepEqual(auto.warnings, []);
	assert.equal(opts("height").height, null);
	const fill = opts("height=fill");
	assert.equal(fill.fill, true);
	assert.equal(fill.height, null);
	assert.deepEqual(fill.warnings, []);
});

test("parseOptionString: invalid id adds a warning", () => {
	const o = opts("id=bad$id");
	assert.equal(o.id, undefined);
	assert.deepEqual(o.warnings, ['Invalid id "bad$id" (letters, digits, "_", "-", "."; max 80).']);
});

test("parseOptionString: id longer than 80 characters is invalid", () => {
	const long = "a".repeat(81);
	assert.equal(opts(`id=${long}`).id, undefined);
	assert.equal(opts(`id=${"a".repeat(80)}`).id, "a".repeat(80));
});

test("parseOptionString: unknown option adds a warning", () => {
	const o = opts("bogus");
	assert.deepEqual(o.warnings, ['Unknown option "bogus".']);
	assert.deepEqual(o.libs, []);
	assert.deepEqual(opts("foo=1").warnings, ['Unknown option "foo=1".']);
});

test("parseOptionString resolves library aliases: chartjs -> chart, math -> katex", () => {
	const o = opts("chartjs math");
	assert.deepEqual(o.libs, ["chart", "katex"]);
	assert.deepEqual(o.warnings, []);
	assert.deepEqual(opts("latex tex").libs, ["katex"]);
	assert.deepEqual(opts("chart chartjs").libs, ["chart"]);
});

test("parseOptionString: keys are case-insensitive and quoted values keep spaces", () => {
	const o = opts("HEIGHT=500 Title='one two' Source");
	assert.equal(o.height, 500);
	assert.equal(o.title, "one two");
	assert.equal(o.showSource, true);
});

test("parseOptionString: title without a value is an empty string", () => {
	assert.equal(opts("title").title, "");
});
