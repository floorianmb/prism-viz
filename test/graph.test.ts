import { test } from "node:test";
import assert from "node:assert/strict";
import { isLinksSource, linkRows } from "../src/runtime/chartSpec";
import { forceLayout, graphData } from "../src/runtime/graph";
import type { NoteMeta } from "../src/protocol";

const note = (path: string, links: string[], extra: Partial<NoteMeta> = {}): NoteMeta => {
	const name = path.replace(/^.*\//, "").replace(/\.md$/, "");
	return { path, name, folder: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "", title: name, tags: [], frontmatter: {}, mtime: 0, links, ...extra };
};

test("linkRows: resolved, unresolved, dedupe, folder and tags", () => {
	const rows = linkRows([
		note("Projects/Alpha.md", ["Projects/Beta.md", "Missing note", "Projects/Beta.md", "Areas/Gamma.md"], { tags: ["#proj"] }),
		note("Projects/Beta.md", ["Projects/Alpha.md"], { title: "Beta Title" }),
	]);
	assert.deepEqual(rows.columns, ["from", "to", "fromPath", "toPath", "folder", "tags"]);
	assert.deepEqual(rows[0], { from: "Alpha", to: "Beta Title", fromPath: "Projects/Alpha.md", toPath: "Projects/Beta.md", folder: "Projects", tags: ["#proj"] });
	assert.deepEqual(rows[1], { from: "Alpha", to: "Missing note", fromPath: "Projects/Alpha.md", toPath: null, folder: "Projects", tags: ["#proj"] });
	// Target outside the queried notes: basename without extension.
	assert.equal(rows[2].to, "Gamma");
	assert.equal(rows.length, 4);
	assert.equal(rows[3].from, "Beta Title");
	assert.ok(isLinksSource(" links ") && isLinksSource("Links") && !isLinksSource("notes"));
	assert.deepEqual(linkRows([note("A.md", [])]).length, 0);
});

test("graphData: undirected dedupe, weights, self-links, paths", () => {
	const g = graphData({}, [
		{ from: "A", to: "B", fromPath: "x/A.md", toPath: "x/B.md" },
		{ from: "B", to: "A", fromPath: "x/B.md", toPath: "x/A.md" },
		{ from: "A", to: "A" },
		{ from: "A", to: "" },
		{ from: "A", to: "C", toPath: null },
	]);
	assert.deepEqual(g.nodes, [
		{ name: "A", path: "x/A.md", degree: 2 },
		{ name: "B", path: "x/B.md", degree: 1 },
		{ name: "C", path: null, degree: 1 },
	]);
	assert.deepEqual(g.all, [["A", "B", 2], ["A", "C", 1]]);
	assert.deepEqual(g.edges, [[0, 1, 2], [0, 2, 1]]);
	assert.equal(g.hidden, 0);
	// Custom columns, plain rows without paths.
	const h = graphData({ from: "src", to: "dst" }, [{ src: "x", dst: "y" }]);
	assert.deepEqual(h.nodes.map((n) => [n.name, n.path]), [["x", null], ["y", null]]);
});

test("graphData: limit keeps the highest degree nodes, ties by name", () => {
	const rows = [
		{ from: "hub", to: "b" },
		{ from: "hub", to: "a" },
		{ from: "hub", to: "c" },
		{ from: "a", to: "b" },
	];
	const g = graphData({ limit: 3 }, rows);
	assert.deepEqual(g.nodes.map((n) => n.name), ["hub", "a", "b"]);
	assert.equal(g.hidden, 1);
	assert.deepEqual(g.edges.length, 3);
	assert.equal(g.all.length, 4);
	assert.equal(graphData({ filter: { from: "a" } }, rows).nodes.length, 2);
});

test("forceLayout: deterministic, connected nodes closer", () => {
	// Two triangles joined by nothing, plus a chain.
	const edges: [number, number, number][] = [[0, 1, 1], [1, 2, 1], [0, 2, 1], [3, 4, 1], [4, 5, 1], [3, 5, 1]];
	const a = forceLayout(6, edges);
	assert.deepEqual(forceLayout(6, edges), a);
	const d = (i: number, j: number) => Math.hypot(a[i][0] - a[j][0], a[i][1] - a[j][1]);
	const within = (d(0, 1) + d(1, 2) + d(0, 2) + d(3, 4) + d(4, 5) + d(3, 5)) / 6;
	const across = (d(0, 3) + d(1, 4) + d(2, 5) + d(0, 5)) / 4;
	assert.ok(within < across, `within ${within} across ${across}`);
	assert.deepEqual(forceLayout(0, []), []);
	assert.equal(forceLayout(1, []).length, 1);
});

test("forceLayout: 200 nodes stay finite and fast", () => {
	const edges: [number, number, number][] = [];
	for (let i = 1; i < 200; i++) edges.push([Math.floor(i / 4), i, 1 + (i % 3)]);
	const t = Date.now();
	const pos = forceLayout(200, edges);
	assert.ok(Date.now() - t < 2000);
	assert.equal(pos.length, 200);
	assert.ok(pos.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
});

test("linkRows leaves out attachments", () => {
	const rows = linkRows([{ path: "A.md", name: "A", folder: "", title: "A", tags: [], frontmatter: {}, mtime: 0, links: ["B.md", "img/x.png", "Board.canvas", "Missing"] }] as any);
	assert.deepEqual(rows.map((r) => r.to), ["B", "Board", "Missing"]);
});

test("graphData: limit is capped at 500 nodes", () => {
	const rows = Array.from({ length: 600 }, (_, i) => ({ from: `a${i}`, to: `b${i}` }));
	const d = graphData({ type: "graph", limit: 3000 } as never, rows);
	assert.equal(d.nodes.length, 500);
	assert.equal(d.hidden, 700);
});
