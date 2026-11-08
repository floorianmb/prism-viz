---
type: test
tags: [prism, example, test]
status: done
date: 2026-11-09
---
# Legend spacing test

A test note, not a showcase. It checks one thing: a legend on the right side of a chart keeps its distance from the right edge, also when it needs two columns or its box is too small for the labels.

The block below draws five charts and measures each one the way Chart.js lays it out. You do not have to count pixels.

## How to test

**1. In Obsidian (one minute).** Open this note with Prism enabled and read the table in the first block.

| Case | What it sets up | Expected |
| --- | --- | --- |
| A | No padding, the control | `control` (box gap 0: this is what touching the edge looks like) |
| B | `layout.padding.right: 24` | `PASS` |
| C | 24 entries in a low chart, so two columns | `PASS` |
| D | Case C with `plugins.legend.maxWidth: 260` | `PASS`, labels shortened with … |
| E | Case C in a block 420 px wide | `PASS`, labels shortened with … |

`PASS` means the legend box **and** its text are at least 24 px away from the right edge. Make the pane narrower and wider: the table updates, and B to E must stay `PASS`.

**2. At the width of the export.** With Obsidian running and Prism enabled, render this note 1921 px wide from the root of the vault:

```sh
node .obsidian/plugins/prism-viz/scripts/prism-render.mjs "32 Legend spacing test.md" --width 1921
```

The output is JSON. `status` must be `ok`, and `blocks[0].snapshotFile` is a PNG of the block: its table shows the numbers at that width (`Chart width` about 1921 for A to D), and the charts in it show the gap.

**3. In the PDF.** Export this note to PDF (*Export to PDF* in Obsidian) and look at the right edge of the charts. The legends of B to E must not touch it and no label may be cut off.

## What the numbers mean

- **Box gap**: from the legend box to the right edge of the chart. This is what `layout.padding.right` controls.
- **Text gap**: from the end of the longest legend text to the right edge. It is 10 px more than the box gap in a box that fits, because the box has 10 px of its own.
- **Columns**: Chart.js starts a second column when the entries do not fit the height of the chart. A higher `height` gives one column.
- **Shortened**: labels were cut with … to keep the columns inside the box.

## If a case fails

The problem exists when one of B to E shows `FAIL`, in step 1 or at 1921 px in step 2. Copy the row, the Prism version and the width of the pane into the issue. In Prism 0.8.0, before the fix, D and E fail (and C in a narrow pane): the box keeps its distance, but the second column runs past the edge.

```viz chart id=legend-spacing title="Legend spacing, measured live"
<style>
table { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
th, td { padding: 4px 8px; text-align: left; border-bottom: 1px solid var(--background-modifier-border); }
.PASS { color: var(--text-success); font-weight: 600; }
.FAIL { color: var(--text-error); font-weight: 600; }
.case { margin-top: 18px; }
.case h4 { margin: 0 0 4px; font-size: 13px; font-weight: 600; }
</style>
<table>
  <thead><tr><th>Case</th><th>Chart width</th><th>Box gap</th><th>Text gap</th><th>Columns</th><th>Shortened</th><th>Result</th></tr></thead>
  <tbody id="results"></tbody>
</table>
<div id="charts"></div>
<script>
const NEEDED = 24;
const many = Array.from({ length: 24 }, (_, i) => ({ Item: `Category with a long name ${i + 1}`, Value: 30 - i }));
const few = many.slice(0, 6);
const cases = [
  { id: "A", title: "A: no padding (control)", rows: few, height: 320, padding: 0, legend: {}, control: true },
  { id: "B", title: "B: layout.padding.right: 24", rows: few, height: 320, padding: NEEDED, legend: {} },
  { id: "C", title: "C: 24 entries, two columns", rows: many, height: 300, padding: NEEDED, legend: {} },
  { id: "D", title: "D: C with legend.maxWidth: 260", rows: many, height: 300, padding: NEEDED, legend: { maxWidth: 260 } },
  { id: "E", title: "E: C in a 420 px wide block", rows: many, height: 300, padding: NEEDED, legend: {}, width: 420 },
];

// What the legend really draws: each text at its position in its column.
function measure(chart) {
  const legend = chart.legend;
  const labels = legend.options.labels;
  const font = Chart.helpers.toFont(labels.font);
  chart.ctx.save();
  chart.ctx.font = font.string;
  const textRight = Math.max(...legend.legendItems.map((item, i) => legend.legendHitBoxes[i].left + labels.boxWidth + font.size / 2 + chart.ctx.measureText(item.text).width));
  chart.ctx.restore();
  return {
    width: Math.round(chart.width),
    box: chart.width - legend.right,
    text: chart.width - textRight,
    columns: legend.columnSizes.length,
    shortened: legend.legendItems.filter((item) => item.text.endsWith("…")).length,
  };
}

function show(c, chart) {
  const m = measure(chart);
  const ok = m.box >= NEEDED - 0.5 && m.text >= NEEDED - 0.5;
  const result = c.control ? "control" : ok ? "PASS" : "FAIL";
  const cells = [c.id, m.width, m.box.toFixed(1), m.text.toFixed(1), m.columns, m.shortened, result];
  c.row.replaceChildren(...cells.map((value) => {
    const td = document.createElement("td");
    td.textContent = value;
    if (value === result) td.className = result;
    return td;
  }));
}

for (const c of cases) {
  c.row = document.getElementById("results").appendChild(document.createElement("tr"));
  const box = document.getElementById("charts").appendChild(document.createElement("div"));
  box.className = "case";
  if (c.width) box.style.maxWidth = `${c.width}px`;
  box.appendChild(document.createElement("h4")).textContent = c.title;
  const target = box.appendChild(document.createElement("div"));
  prism.chart(target, {
    type: "doughnut",
    rows: c.rows,
    x: "Item",
    y: ["Value"],
    height: c.height,
    options: { animation: false, layout: { padding: { right: c.padding } }, plugins: { legend: { position: "right", ...c.legend } } },
  }).then((chart) => {
    show(c, chart);
    new ResizeObserver(() => setTimeout(() => show(c, chart), 150)).observe(target);
  });
}
</script>
```

## The setting to copy

The same as case B, written as a plain chart.

| Item | Value |
| --- | --- |
| Enterprise | 42 |
| Mid market | 26 |
| SMB | 18 |
| Public | 9 |

^items

```viz chart title="Legend on the right, 24 px from the edge"
type: doughnut
source: ^items
x: Item
y: [Value]
height: 320
options:
  layout: { padding: { right: 24 } }
  plugins:
    legend: { position: right }
```
