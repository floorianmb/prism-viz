import { test } from "node:test";
import assert from "node:assert/strict";
import { localToday, nextPeriod, periodOf, periodRange } from "../src/runtime/periods";

test("periodOf: labels per group", () => {
	assert.equal(periodOf("2026-10-18", "day"), "2026-10-18");
	assert.equal(periodOf("2026-10-18T09:00", "month"), "2026-10");
	assert.equal(periodOf("2026-10-18", "quarter"), "2026-Q4");
	assert.equal(periodOf("2026-10-18", "year"), "2026");
	assert.equal(periodOf("2026-10-18", "week"), "2026-W42");
	// ISO weeks across the year boundary
	assert.equal(periodOf("2027-01-01", "week"), "2026-W53");
	assert.equal(periodOf("2024-12-30", "week"), "2025-W01");
	assert.equal(periodOf("nope", "month"), null);
	assert.equal(periodOf(20261018, "month"), null);
});

test("periodRange and nextPeriod fill gaps", () => {
	assert.deepEqual(periodRange("2026-11", "2027-02", "month"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
	assert.deepEqual(periodRange("2026-W52", "2027-W02", "week"), ["2026-W52", "2026-W53", "2027-W01", "2027-W02"]);
	assert.deepEqual(periodRange("2026-Q3", "2027-Q1", "quarter"), ["2026-Q3", "2026-Q4", "2027-Q1"]);
	assert.equal(nextPeriod("2026-12-31", "day"), "2027-01-01");
	assert.equal(nextPeriod("2026", "year"), "2027");
	assert.equal(localToday(new Date(2026, 9, 18, 23, 30)), "2026-10-18");
});
