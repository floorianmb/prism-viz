import test from "node:test";
import assert from "node:assert/strict";
import { buildSpec, dayText } from "../src/basesSpec";

const base = { xName: "Status", hasSeries: false, aggregate: "sum", sort: "label" as const, limit: 30, stacked: false, height: 320, geo: "", geoKey: "" };
const entries = [
	{ x: "b", y: 2, s: undefined, path: "b.md" },
	{ x: "a", y: 1, s: undefined, path: "a.md" },
	{ x: "b", y: 3, s: undefined, path: "c.md" },
];

test("bar spec is unchanged", () => {
	const spec = buildSpec({ ...base, chartType: "bar", entries, yName: "Hours" });
	assert.equal(JSON.stringify(spec), '{"type":"bar","rows":[{"Status":"a","Hours (sum)":1},{"Status":"b","Hours (sum)":5}],"x":"Status","y":"Hours (sum)","stacked":false,"height":320}');
	const count = buildSpec({ ...base, chartType: "pie", entries });
	assert.equal(JSON.stringify(count), '{"type":"pie","rows":[{"Status":"a","Notes":1},{"Status":"b","Notes":2}],"x":"Status","y":"Notes","stacked":false,"height":320}');
});

test("calendar spec has per-entry rows with path", () => {
	const e = [{ x: "2024-05-01T10:00:00", y: 4, s: undefined, path: "a.md" }, { x: null, y: 1, s: undefined, path: "n.md" }];
	assert.equal(
		JSON.stringify(buildSpec({ ...base, chartType: "calendar", entries: e, xName: "Date", yName: "Hours" })),
		'{"type":"calendar","rows":[{"Date":"2024-05-01T10:00:00","Hours":4,"path":"a.md"}],"x":"Date","y":"Hours","aggregate":"sum"}',
	);
	assert.equal(JSON.stringify(buildSpec({ ...base, chartType: "calendar", entries: e, xName: "Date" })), '{"type":"calendar","rows":[{"Date":"2024-05-01T10:00:00","path":"a.md"}],"x":"Date"}');
});

test("dayText", () => {
	assert.equal(dayText("2024-05-01"), "2024-05-01");
	assert.equal(dayText("May 1, 2024"), "2024-05-01");
	assert.equal(dayText("nope"), null);
});

test("map spec", () => {
	const spec = buildSpec({ ...base, chartType: "map", entries, yName: "Hours", geo: "data/europe.geojson", geoKey: "iso" });
	assert.equal(JSON.stringify(spec), '{"type":"map","rows":[{"Status":"b","Hours (sum)":5},{"Status":"a","Hours (sum)":1}],"x":"Status","y":"Hours (sum)","geo":"data/europe.geojson","geoKey":"iso","height":320}');
	assert.equal((buildSpec({ ...base, chartType: "map", entries }) as { geo: string }).geo, "");
});
