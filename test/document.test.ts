import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDocument } from "../src/document";
import type { FrameConfig } from "../src/protocol";
import type { VizOptions } from "../src/options";

// The CSP <meta> only counts when the browser puts it into the real <head>.
// For full documents it therefore has to come before any of the user's
// markup: only leading comments and the doctype may precede it.

const options: VizOptions = { libs: [], height: null, fill: false, raw: false, eager: false, noToolbar: false, showSource: false, table: false, web: false, monitor: false, warnings: [] };
const config: FrameConfig = {
	token: "t",
	blockId: "b",
	sourcePath: "note.md",
	theme: { dark: false, vars: {}, palette: [] },
	state: {},
	locale: "en",
	shared: {},
	autoHeight: true,
	libs: [],
	displayMode: "inline",
};
const INJECTION = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy"`;

function build(source: string, libs: [string, string][] = []) {
	return buildDocument({ source, options, config, allowlist: [], prelude: "window.prism={};\nvoid 0;", libs, screenshotLib: "/* lib */\n" });
}

/** Asserts that exactly `prefix` comes before the CSP and that the rest of the user's source follows the injection unchanged. */
function assertInjectedAfter(source: string, prefix: string) {
	const { html } = build(source);
	assert.equal(html.slice(0, html.indexOf(INJECTION)), prefix);
	assert.ok(html.endsWith(source.slice(prefix.length)), "the rest of the source follows the injection unchanged");
}

const ATTACK = `<script>fetch("https://evil.example/")</script>`;

test("fragment: CSP in the wrapper's head, before the user's markup", () => {
	const { html } = build(`<p>x</p>${ATTACK}`);
	assert.equal(html.slice(0, html.indexOf(INJECTION)), `<!DOCTYPE html>\n<html lang="en" class="theme-light" data-theme="light">\n<head>\n`);
	assert.ok(html.indexOf(INJECTION) < html.indexOf("<p>x</p>"));
});

test("full document: CSP right after the doctype, user's <html> kept as written", () => {
	const source = `<!doctype html>\n<html lang="de" class="user">\n<head>\n<title>t</title>\n</head>\n<body>\n${ATTACK}\n</body>\n</html>`;
	assertInjectedAfter(source, "<!doctype html>");
	const { html } = build(source);
	assert.ok(html.startsWith("<!doctype html>"), "the doctype stays first");
	assert.ok(html.includes(`<html lang="de" class="user">`));
});

test("full document: body content before <head> does not move the CSP behind it", () => {
	assertInjectedAfter(`<!doctype html><html><p>x</p><head></head><body>${ATTACK}</body></html>`, "<!doctype html>");
});

test("full document: a <head> inside a comment is not taken for the head", () => {
	assertInjectedAfter(`<!doctype html><html><!-- <head> --><head></head><body>${ATTACK}</body></html>`, "<!doctype html>");
});

test("full document: a doctype inside a leading comment is not taken for the doctype", () => {
	assertInjectedAfter(`<!-- <!doctype html> --><html><p>x</p><head></head><body>${ATTACK}</body></html>`, "<!-- <!doctype html> -->");
});

test("full document: <html> without doctype gets the CSP first", () => {
	assertInjectedAfter(`<html lang="de"><head></head><body>${ATTACK}</body></html>`, "");
});

test("full document: leading prism option comment stays first and intact", () => {
	const source = `<!-- prism: chart height=300 -->\n<!DOCTYPE html>\n<html lang="de">\n<head></head>\n<body>${ATTACK}</body>\n</html>`;
	assertInjectedAfter(source, "<!-- prism: chart height=300 -->\n<!DOCTYPE html>");
});

test("full document: leading whitespace stays, a BOM or NBSP is not skipped", () => {
	assertInjectedAfter(` \n\t<!doctype html><html><head></head><body>${ATTACK}</body></html>`, " \n\t<!doctype html>");
	// The parser does not skip these: they start the body, so the CSP must come first.
	assertInjectedAfter(`﻿<!doctype html><html><head></head><body>${ATTACK}</body></html>`, "");
	assertInjectedAfter(` <!doctype html><html><head></head><body>${ATTACK}</body></html>`, "");
});

test("full document: comments end where the browser ends them", () => {
	// `<!-->`, `<!--->` and `--!>` close a comment, so the script after them is markup.
	assertInjectedAfter(`<!-->${ATTACK}--><!doctype html><html><head></head></html>`, "<!-->");
	assertInjectedAfter(`<!--->${ATTACK}--><!doctype html><html><head></head></html>`, "<!--->");
	assertInjectedAfter(`<!-- a --!>${ATTACK} --><!doctype html><html><head></head></html>`, "<!-- a --!>");
	assertInjectedAfter(`<!---->\n<!-- b -->\n<!doctype html><html><head></head><body>${ATTACK}</body></html>`, "<!---->\n<!-- b -->\n<!doctype html>");
});

test("line map: errors in a full document map to lines of the block", () => {
	const source = [
		"<!-- prism: chart -->", // 1
		"<!doctype html>", // 2
		`<html lang="de">`, // 3
		"<head>", // 4
		"</head>", // 5
		"<body>", // 6
		"<script>", // 7
		"boom();", // 8
		"</script>", // 9
		"</body>", // 10
		"</html>", // 11
	].join("\n");
	const { html, lineMap } = build(source, [["chart", "/* chart */\nvar x;\n"]]);
	const lineOf = (needle: string) => html.slice(0, html.indexOf(needle)).split("\n").length;
	assert.deepEqual(lineMap.map(lineOf("boom();"), 3), { line: 8, column: 3, origin: "block" });
	assert.deepEqual(lineMap.map(lineOf("<body>")), { line: 6, column: undefined, origin: "block" });
	assert.deepEqual(lineMap.map(lineOf("<!-- prism")), { line: 1, column: undefined, origin: "block" });
	assert.deepEqual(lineMap.map(lineOf("void 0;")), { origin: "prism" });
	assert.deepEqual(lineMap.map(lineOf("var x;")), { origin: "lib:chart" });
	assert.deepEqual(lineMap.locate({ kind: "error", message: "boom is not defined", stack: `ReferenceError\n    at about:srcdoc:${lineOf("boom();")}:1` }), {
		line: 8,
		column: 1,
		origin: "block",
	});
});

test("line map: errors in a fragment map to lines of the block", () => {
	const { html, lineMap } = build("<p>x</p>\n<script>\nboom();\n</script>");
	const line = html.slice(0, html.indexOf("boom();")).split("\n").length;
	assert.deepEqual(lineMap.map(line), { line: 3, column: undefined, origin: "block" });
});
