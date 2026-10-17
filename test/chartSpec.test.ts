process.env.TZ = "Europe/Berlin";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chartConfig, noteRows } from "../src/runtime/chartSpec";

const note = (mtime: number): any => ({ title: "t", folder: "", path: "t.md", mtime, tags: [], frontmatter: {} });

test("noteRows modified is the local date", () => {
	assert.equal(noteRows([note(Date.UTC(2026, 9, 16, 22, 30))])[0].modified, "2026-10-17");
	assert.equal(noteRows([note(Date.UTC(2026, 9, 17, 2, 0))])[0].modified, "2026-10-17");
	assert.equal(noteRows([note(Date.UTC(2026, 0, 5, 12, 0))])[0].modified, "2026-01-05");
	process.env.TZ = "America/New_York";
	try {
		assert.equal(noteRows([note(Date.UTC(2026, 9, 17, 2, 0))])[0].modified, "2026-10-16");
	} finally {
		process.env.TZ = "Europe/Berlin";
	}
});

// Old implementation of the series branch
function oldSeries(rows: Record<string, unknown>[], x: string, series: string, value: string) {
	const labels = [...new Set(rows.map((r) => r[x]))];
	const groups = [...new Set(rows.map((r) => r[series]))];
	return {
		labels,
		datasets: groups.map((g) => ({
			label: String(g),
			data: labels.map((l) => {
				const hit = rows.find((r) => r[x] === l && r[series] === g);
				return hit ? (hit[value] as number) ?? null : null;
			}),
		})),
	};
}

const cases: Record<string, Record<string, unknown>[]> = {
	duplicates: [{ d: "a", s: "p", v: 1 }, { d: "a", s: "p", v: 2 }, { d: "b", s: "q", v: 3 }],
	numberVsString: [{ d: 1, s: "p", v: 1 }, { d: "1", s: "p", v: 2 }, { d: 1, s: "q", v: 3 }],
	nullUndefined: [{ d: "a", s: null, v: 1 }, { d: "a", s: undefined, v: 2 }, { d: "b", s: "q", v: 3 }, { d: null, s: "q", v: 4 }],
	nan: [{ d: NaN, s: "p", v: 1 }, { d: "a", s: NaN, v: 2 }, { d: "a", s: "p", v: 3 }],
	missing: [{ d: "a", s: "p", v: 1 }, { d: "b", s: "q", v: 2 }, { d: "c", s: "p", v: null }],
};

for (const [name, rows] of Object.entries(cases)) {
	test(`series output unchanged: ${name}`, () => {
		const cfg: any = chartConfig({ type: "line", x: "d", y: "v", series: "s" } as any, rows);
		const old = oldSeries(rows, "d", "s", "v");
		assert.deepEqual(cfg.data.labels, old.labels);
		assert.deepEqual(cfg.data.datasets.map((d: any) => [d.label, d.data]), old.datasets.map((d) => [d.label, d.data]));
	});
}

test("aggregate + series", () => {
	const rows = [{ d: "a", s: "p", v: 1 }, { d: "a", s: "p", v: 2 }, { d: "a", s: "q", v: 5 }, { d: "b", s: "p", v: 4 }];
	const cfg: any = chartConfig({ type: "bar", x: "d", y: "v", series: "s", aggregate: "sum" } as any, rows);
	assert.deepEqual(cfg.data.labels, ["a", "b"]);
	assert.deepEqual(cfg.data.datasets.map((d: any) => [d.label, d.data]), [["p", [3, 4]], ["q", [5, null]]]);
});

test("series chart with 5000 rows is fast", () => {
	const rows = Array.from({ length: 5000 }, (_, i) => ({ d: i, s: "s" + (i % 5), v: i }));
	const t = Date.now();
	const cfg: any = chartConfig({ type: "line", x: "d", y: "v", series: "s" } as any, rows);
	assert.ok(Date.now() - t < 1000);
	assert.equal(cfg.data.datasets.length, 5);
});
