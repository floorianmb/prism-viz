import { test } from "node:test";
import assert from "node:assert/strict";
import { sankeyLayout, sankeyLinks } from "../src/runtime/sankey";

const budget = [
	{ Von: "Gehalt", Nach: "Konto", Betrag: 3000 },
	{ Von: "Bonus", Nach: "Konto", Betrag: 500 },
	{ Von: "Konto", Nach: "Miete", Betrag: 1200 },
	{ Von: "Konto", Nach: "Essen", Betrag: 400 },
	{ Von: "Konto", Nach: "Essen", Betrag: 100 },
	{ Von: "Konto", Nach: "Sparen", Betrag: 800 },
	{ Von: "Sparen", Nach: "ETF", Betrag: 600 },
	{ Von: "Konto", Nach: "Sonstiges", Betrag: "viel" },
	{ Von: "Konto", Nach: "Null", Betrag: 0 },
	{ Von: "", Nach: "Miete", Betrag: 5 },
	{ Von: "Miete", Nach: "Miete", Betrag: 5 },
];

test("sankeyLinks: sums y per (from, to), skips invalid rows; counts rows without y", () => {
	const { links, dropped } = sankeyLinks(budget, "Von", "Nach", "Betrag");
	assert.deepEqual(dropped, []);
	assert.deepEqual(
		links.map((l) => [l.from, l.to, l.value, l.rows.length]),
		[["Gehalt", "Konto", 3000, 1], ["Bonus", "Konto", 500, 1], ["Konto", "Miete", 1200, 1], ["Konto", "Essen", 500, 2], ["Konto", "Sparen", 800, 1], ["Sparen", "ETF", 600, 1]],
	);
	const counted = sankeyLinks(budget, "Von", "Nach").links;
	assert.equal(counted.find((l) => l.to === "Essen")!.value, 2);
	assert.equal(counted.find((l) => l.to === "Sonstiges")!.value, 1);
});

test("sankeyLinks: links that close a cycle are dropped in row order", () => {
	const rows = [{ from: "A", to: "B" }, { from: "B", to: "C" }, { from: "C", to: "A" }, { from: "B", to: "A" }, { from: "A", to: "C" }];
	const { links, dropped } = sankeyLinks(rows, "from", "to");
	assert.deepEqual(dropped.map((l) => `${l.from} → ${l.to}`), ["C → A", "B → A"]);
	assert.deepEqual(links.map((l) => `${l.from} → ${l.to}`), ["A → B", "B → C", "A → C"]);
});

const layoutOf = (height = 300) => sankeyLayout(sankeyLinks(budget, "Von", "Nach", "Betrag").links, 760, height);

test("sankeyLayout: columns are the longest path, sinks at their depth, sources next to their first target", () => {
	const { nodes } = layoutOf();
	const col = Object.fromEntries(nodes.map((n) => [n.name, n.column]));
	assert.deepEqual(col, { Gehalt: 0, Bonus: 0, Konto: 1, Miete: 2, Essen: 2, Sparen: 2, ETF: 3 });
	// A -> D directly and A -> B -> C -> D: D at column 3; the sink E stays at column 1, the source F moves to column 2.
	const g = sankeyLayout([{ from: "A", to: "D", value: 1 }, { from: "A", to: "B", value: 1 }, { from: "B", to: "C", value: 1 }, { from: "C", to: "D", value: 1 }, { from: "A", to: "E", value: 1 }, { from: "F", to: "D", value: 1 }], 760, 300);
	assert.deepEqual(Object.fromEntries(g.nodes.map((n) => [n.name, n.column])), { A: 0, D: 3, B: 1, C: 2, E: 1, F: 2 });
	assert.equal(g.nodes.find((n) => n.name === "D")!.x, 748);
	// A -> D gets a slot in the columns of B and C.
	const x = (name: string) => g.nodes.find((n) => n.name === name)!.x;
	assert.deepEqual(g.links.map((l) => l.via.map((v) => v.x)), [[x("B"), x("C")], [], [], [], [], []]);
});

// The "Monthly budget" of examples/28 Sankey.md and energy flows with bands that skip columns.
const monthly = [["Salary", "Budget", 3800], ["Side projects", "Budget", 600], ["Budget", "Housing", 1500], ["Budget", "Food", 650], ["Budget", "Transport", 250], ["Budget", "Savings", 1200], ["Budget", "Fun", 800], ["Housing", "Rent", 1200], ["Housing", "Utilities", 300], ["Food", "Groceries", 480], ["Food", "Restaurants", 170], ["Savings", "Pension", 600], ["Savings", "Emergency fund", 600]];
const energy = [["Coal", "Power plants", 320], ["Gas", "Power plants", 260], ["Gas", "Heating", 180], ["Gas", "Industry", 140], ["Oil", "Refinery", 520], ["Nuclear", "Power plants", 120], ["Solar", "Grid", 90], ["Wind", "Grid", 150], ["Power plants", "Grid", 430], ["Power plants", "Losses", 270], ["Refinery", "Transport", 410], ["Refinery", "Industry", 60], ["Refinery", "Losses", 50], ["Grid", "Homes", 280], ["Grid", "Industry", 250], ["Grid", "Transport", 40], ["Grid", "Losses", 100], ["Heating", "Homes", 160], ["Heating", "Losses", 20], ["Oil", "Heating", 60], ["Coal", "Industry", 90], ["Solar", "Homes", 25]];
const flows = (rows: (string | number)[][]) => rows.map(([from, to, value]) => ({ from: String(from), to: String(to), value: Number(value) }));

test("sankeyLayout: no band passes behind a node it does not connect to", () => {
	for (const [name, rows] of [["budget", monthly], ["energy", energy]] as const) {
		const { nodes, links } = sankeyLayout(flows(rows), 760, 420);
		const by = Object.fromEntries(nodes.map((n) => [n.name, n]));
		if (name === "budget") assert.deepEqual(links.filter((l) => l.via.length), [], "no band skips a column");
		else assert.ok(links.some((l) => l.via.length), "energy has bands that skip columns");
		for (const l of links) {
			const [a, b] = [by[l.from], by[l.to]];
			assert.equal(l.via.length, b.column - a.column - 1, `${l.from} → ${l.to}`);
			l.via.forEach((v, k) => {
				for (const n of nodes.filter((n) => n.column === a.column + k + 1)) {
					assert.equal(v.x, n.x);
					assert.ok(v.y + l.width <= n.y + 1e-6 || v.y >= n.y + n.h - 1e-6, `${name}: ${l.from} → ${l.to} behind ${n.name}`);
				}
			});
		}
	}
});

test("sankeyLayout: bands leave and enter a node in the order of their other end", () => {
	for (const rows of [monthly, energy]) {
		const { nodes, links } = sankeyLayout(flows(rows), 760, 420);
		for (const n of nodes) {
			// The other end: the next slot of a band that skips a column, else the node.
			const outs = links.filter((l) => l.from === n.name).sort((a, b) => a.sy - b.sy).map((l) => l.via[0]?.y ?? l.ty);
			const ins = links.filter((l) => l.to === n.name).sort((a, b) => a.ty - b.ty).map((l) => l.via.at(-1)?.y ?? l.sy);
			for (const ys of [outs, ins]) for (let i = 1; i < ys.length; i++) assert.ok(ys[i] >= ys[i - 1], `${n.name}: ${ys.join(", ")}`);
		}
	}
});

test("sankeyLayout: node value is max(in, out); band widths sum to node heights", () => {
	const { nodes, links } = layoutOf();
	const by = Object.fromEntries(nodes.map((n) => [n.name, n]));
	assert.equal(by.Konto.value, 3500);
	assert.equal(by.Sparen.value, 800);
	for (const n of nodes) {
		const out = links.filter((l) => l.from === n.name).reduce((s, l) => s + l.width, 0);
		const inn = links.filter((l) => l.to === n.name).reduce((s, l) => s + l.width, 0);
		assert.ok(Math.abs(Math.max(out, inn) - n.h) < 1e-6, n.name);
		for (const l of links.filter((l) => l.from === n.name)) assert.ok(l.sy >= n.y - 1e-6 && l.sy + l.width <= n.y + n.h + 1e-6);
		for (const l of links.filter((l) => l.to === n.name)) assert.ok(l.ty >= n.y - 1e-6 && l.ty + l.width <= n.y + n.h + 1e-6);
	}
});

test("sankeyLayout: nodes stay within the height and don't overlap; deterministic", () => {
	const many = Array.from({ length: 20 }, (_, i) => ({ from: `S${i % 4}`, to: `T${i}`, value: 1 + ((i * 7) % 5) }));
	for (const [links, height] of [[sankeyLinks(budget, "Von", "Nach", "Betrag").links, 220], [many, 640], [many, 220]] as const) {
		const { nodes } = sankeyLayout(links, 760, height);
		for (const n of nodes) assert.ok(n.y >= -1e-6 && n.y + n.h <= height + 1e-6, `${n.name} in [0, ${height}]`);
		const cols = new Map<number, typeof nodes>();
		for (const n of nodes) cols.set(n.column, [...(cols.get(n.column) ?? []), n]);
		for (const col of cols.values()) {
			col.sort((a, b) => a.y - b.y);
			for (let i = 1; i < col.length; i++) assert.ok(col[i].y >= col[i - 1].y + col[i - 1].h - 1e-6, `${col[i - 1].name} / ${col[i].name}`);
		}
		assert.deepEqual(sankeyLayout(links, 760, height), sankeyLayout(links, 760, height));
	}
	assert.deepEqual(sankeyLayout([], 760, 300), { nodes: [], links: [] });
});
