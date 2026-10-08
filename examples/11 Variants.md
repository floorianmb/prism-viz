---
type: showcase
tags: [prism, example, variants]
status: done
date: 2026-10-08
---
# Variants

Some data is read best as bars, some as a line, some as a table. `prism.variants` puts all of them behind one switcher and remembers the reader's choice. Here the data comes from the `date` of every note in this vault, counted per month, so it moves when you add notes.

```viz chart id=variants title="Notes per month"
<div id="v"></div>
<p class="caption" id="cap"></p>
<script>
let months = [], counts = [];
const nice = m => new Date(m + "-01").toLocaleDateString(prism.locale, { month: "short", year: "2-digit" });
const box = el => el.appendChild(Object.assign(document.createElement("div"), { style: "height:260px" }));
function chartVariant(type) {
  return el => {
    const canvas = box(el).appendChild(document.createElement("canvas"));
    const chart = new Chart(canvas, {
      type,
      data: { labels: months.map(nice), datasets: [{ label: "Notes", data: counts, borderRadius: 3, tension: 0.3, fill: type === "line" }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { ticks: { precision: 0 } } } },
    });
    return () => chart.destroy();
  };
}
function tableVariant(el) {
  const rows = months.map((m, i) => `<tr><td>${nice(m)}</td><td style="text-align:right">${counts[i]}</td></tr>`).join("");
  el.innerHTML = `<table><thead><tr><th>Month</th><th style="text-align:right">Notes</th></tr></thead><tbody>${rows}</tbody></table>`;
}
async function load() {
  const per = {};
  for (const n of await prism.notes()) {
    const m = String(n.frontmatter.date ?? "").slice(0, 7);
    if (m) per[m] = (per[m] || 0) + 1;
  }
  months = Object.keys(per).sort();
  counts = months.map(m => per[m]);
  document.getElementById("cap").textContent = counts.reduce((a, b) => a + b, 0) + " notes with a date in " + months.length + " months.";
}
load().then(() => prism.variants("#v", [
  { label: "Bar", render: chartVariant("bar") },
  { label: "Line", render: chartVariant("line") },
  { label: "Table", render: tableVariant },
], { key: "view" }));
</script>
```

Pick **Line** or **Table**, then switch to another note and come back: the choice is stored with the block (`id=variants`). Each variant's `render(el)` may return a cleanup function; the bar and line variants use it to destroy their Chart.js instance.

A variant is just a function that draws into an element, so it can show anything: a Mermaid diagram next to a summary, a map next to a list, a formula next to its plot.
