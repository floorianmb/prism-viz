import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { lintNote } from "../src/lint";

const table = "| Name | Value |\n|---|---|\n| a | 1 |\n\n^t1\n";
const block = (info: string, body: string) => "```viz " + info + "\n" + body + "\n```\n";
const messages = (note: string, files?: Parameters<typeof lintNote>[1]) => lintNote(note, files).blocks.flatMap((b) => b.errors);

test("a clean note is ok", () => {
	const r = lintNote("# T\n\n" + table + block("chart", "type: bar\nsource: ^t1\nx: Name\ny: Value"), undefined, "N.md");
	assert.equal(r.status, "ok");
	assert.equal(r.blocks[0].block, "N.md#0");
	assert.deepEqual(r.blocks[0].lines, [8, 13]);
});

test("YAML error carries the note line", () => {
	const [e] = messages("intro\n" + block("chart", "type: bar\nx: [a\ny: b"));
	assert.equal(e.kind, "error");
	assert.match(e.message, /not valid YAML/);
	assert.ok(e.line >= 3 && e.line <= 5, String(e.line));
});

test("spec must be an object", () => {
	assert.match(messages(block("table", "- a"))[0].message, /must contain a YAML\/JSON object/);
});

test("unknown key warns on its line", () => {
	const r = lintNote(table + block("chart", "type: bar\nsource: ^t1\nfoo: 1"));
	assert.equal(r.status, "warning");
	assert.equal(r.blocks[0].errors[0].line, 9);
});

test("missing column of a note table", () => {
	const [e] = messages(table + block("chart", "source: ^t1\nx: Name\ny: Wert"));
	assert.match(e.message, /column "Wert" not found \(columns: Name, Value\)/);
	assert.equal(e.line, 9);
});

test("table block checks columns, heading and #n sources", () => {
	const note = "## Sales\n\n| A | B |\n|---|---|\n| 1 | 2 |\n" + block("table", "source: table:Sales\ncolumns: [A, C]") + block("chart", "source: '#0'\nx: A\ny: B");
	const r = lintNote(note);
	assert.match(r.blocks[0].errors[0].message, /prism.table: column "C"/);
	assert.equal(r.blocks[1].status, "ok");
});

test("tasks columns are known", () => {
	assert.equal(lintNote(block("chart", "source: tasks\nx: due\ny: count\naggregate: count")).status, "ok");
	assert.match(messages(block("chart", "source: tasks\nx: duee"))[0].message, /column "duee" not found/);
});

test("missing table is an error listing the known tables", () => {
	const [e] = messages(table + block("chart", "source: ^nope\nx: a"));
	assert.equal(e.kind, "error");
	assert.match(e.message, /no such table\. Tables: #0 \^t1/);
});

test("csv header columns come from the file reader", () => {
	const files = { readText: (p: string) => (p === "data/s.csv" ? "a,b\n1,2" : null) };
	assert.match(messages(block("chart", "source: data/s.csv\nx: a\ny: z"), files)[0].message, /column "z"/);
	assert.equal(lintNote(block("chart", "source: data/s.csv\nx: a\ny: b"), files).status, "ok");
});

test("script syntax error line", () => {
	const note = "text\n" + block("", "<div></div>\n<script>\nconst a = 1;\nconst = ;\n</script>");
	const [e] = messages(note);
	assert.equal(e.kind, "error");
	assert.match(e.message, /^SyntaxError/);
	assert.equal(e.line, 6);
	assert.equal(lintNote(block("", '<script type="module">import x from "y";</script><script src="a.js"></script>')).status, "ok");
});

test("fenced examples are ignored, block ids and numbering", () => {
	const note = "````md\n" + block("chart", "type: [") + "````\n" + block("id=x", "<script>const = 1</script>") + block("chart", "type: bar");
	const r = lintNote(note, undefined, "N.md");
	assert.equal(r.blocks.length, 2);
	assert.equal(r.blocks[0].block, "N.md#x");
	assert.equal(r.blocks[1].block, "N.md#1");
	assert.equal(r.blocks[0].status, "error");
});

test("tables inside code fences are not tables", () => {
	assert.match(messages("```\n" + table + "```\n" + block("chart", "source: ^t1"))[0].message, /no such table/);
});

test("math, mermaid, web and monitor blocks are fine", () => {
	assert.equal(lintNote(block("math", "x^2") + block("mermaid", "graph TD\nA-->B") + block("web", "https://example.com") + block("monitor", "")).status, "ok");
});

test("the example notes produce no errors", () => {
	const files = { readText: (p: string) => { try { return readFileSync("examples/" + p, "utf8"); } catch { return null; } } };
	for (const f of readdirSync("examples").filter((f) => f.endsWith(".md"))) {
		const r = lintNote(readFileSync("examples/" + f, "utf8"), files, f);
		assert.notEqual(r.status, "error", f + JSON.stringify(r.blocks.flatMap((b) => b.errors)));
		for (const b of r.blocks) for (const e of b.errors) console.log(`  ${f}: line ${e.line}: ${e.message}`);
	}
});

test("compute: computed columns are known, syntax errors reported", () => {
	const note = "| a | b |\n| - | - |\n| 1 | 2 |\n^t\n\n```viz chart\ntype: bar\nsource: ^t\ncompute: { c: \"a + b\", d: \"a +\" }\nx: a\ny: c\n```\n";
	const result = lintNote(note);
	const errors = result.blocks[0].errors;
	assert.deepEqual(errors.filter((e) => e.kind === "warning"), []);
	assert.equal(errors.filter((e) => e.kind === "error").length, 1);
	assert.match(errors[0].message, /compute "d"/);
});
