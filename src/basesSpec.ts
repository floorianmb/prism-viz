// Pure spec building for the Bases "Prism chart" view (no obsidian import, so it is testable).

import { toText } from "./util";

type Row = { label: unknown; value: number; series?: string };

/** Aggregated rows: one per (group, series), list-valued groups count once per element. */
export function aggregate(entries: { x: unknown; y: unknown; s: unknown }[], mode: string, counting: boolean): Row[] {
	const acc = new Map<string, { label: unknown; series?: string; values: number[]; count: number }>();
	const keys = (v: unknown): unknown[] => (Array.isArray(v) ? (v.length ? v : [null]) : [v]);
	for (const e of entries) {
		const y = typeof e.y === "number" ? e.y : typeof e.y === "string" && e.y.trim() !== "" && !isNaN(Number(e.y)) ? Number(e.y) : null;
		if (!counting && y === null) continue;
		for (const x of keys(e.x)) {
			for (const s of keys(e.s)) {
				const label = x ?? "(none)";
				const series = e.s === undefined ? undefined : toText(s, "(none)");
				const id = JSON.stringify([label, series]);
				const slot = acc.get(id) ?? { label, series, values: [], count: 0 };
				slot.count++;
				if (y !== null) slot.values.push(y);
				acc.set(id, slot);
			}
		}
	}
	const reduce = (values: number[]) =>
		mode === "avg" ? values.reduce((a, b) => a + b, 0) / values.length : mode === "min" ? Math.min(...values) : mode === "max" ? Math.max(...values) : values.reduce((a, b) => a + b, 0);
	return Array.from(acc.values()).map((slot) => ({
		label: slot.label,
		series: slot.series,
		value: counting ? slot.count : Math.round(reduce(slot.values) * 1000) / 1000,
	}));
}

export type SpecInput = {
	chartType: string;
	entries: { x: unknown; y: unknown; s: unknown; path: string }[];
	xName: string;
	yName?: string;
	hasSeries: boolean;
	aggregate: string;
	sort: "label" | "value";
	limit: number;
	stacked: boolean;
	height: number;
	geo: string;
	geoKey: string;
};

/** "YYYY-MM-DD…" text of a Bases date value (null when it is no date). */
export function dayText(v: unknown): string | null {
	const t = Array.isArray(v) ? v[0] : v;
	if (typeof t !== "string") return null;
	if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t;
	// shortcut: locale-formatted dates go through Date.parse; unparsable ones are dropped.
	const d = new Date(t);
	if (isNaN(d.getTime())) return null;
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function buildSpec(i: SpecInput): Record<string, unknown> {
	if (i.chartType === "calendar") {
		const rows: Record<string, unknown>[] = [];
		for (const e of i.entries) {
			const day = dayText(e.x);
			if (day) rows.push({ [i.xName]: day, ...(i.yName ? { [i.yName]: e.y } : {}), path: e.path });
		}
		return { type: "calendar", rows, x: i.xName, ...(i.yName ? { y: i.yName, aggregate: i.aggregate } : {}) };
	}
	let rows = aggregate(i.entries, i.aggregate, !i.yName);
	const valueName = i.yName ? `${i.yName} (${i.aggregate})` : "Notes";
	if (i.chartType === "map") {
		return {
			type: "map",
			rows: rows.map((r) => ({ [i.xName]: r.label, [valueName]: r.value })),
			x: i.xName,
			y: valueName,
			geo: i.geo,
			...(i.geoKey ? { geoKey: i.geoKey } : {}),
			height: i.height,
		};
	}
	rows.sort((a, b) => (i.sort === "value" ? b.value - a.value : String(a.label).localeCompare(String(b.label), undefined, { numeric: true })));
	if (!i.hasSeries) rows = rows.slice(0, i.limit);
	return {
		type: i.chartType,
		rows: rows.map((r) => ({ [i.xName]: r.label, [valueName]: r.value, ...(i.hasSeries ? { series: r.series } : {}) })),
		x: i.xName,
		y: valueName,
		...(i.hasSeries ? { series: "series" } : {}),
		stacked: i.stacked,
		height: i.height,
	};
}
