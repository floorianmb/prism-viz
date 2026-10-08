---
type: showcase
tags: [prism, example, data]
status: done
date: 2026-10-07
---
# Data file

Prism can read CSV, TSV, JSON, YAML and TXT files from your vault with `prism.data()`. The data lives in [`data/sales.csv`](data/sales.csv): monthly revenue, orders and share of returning customers for three regions.

> [!warning] One setting is needed
> Prism only reads files from folders you allow. Open **Settings → Prism → Data folders** and add `data`. Until then the blocks below show a short message instead of the chart. Notes themselves are never readable this way; use `prism.note()` and `prism.notes()` for those.

```viz chart id=sales title="Monthly revenue by region"
<div style="height:300px"><canvas id="c"></canvas></div>
<p class="caption" id="msg">Source: data/sales.csv</p>
<script>
let chart;
const money = new Intl.NumberFormat(prism.locale, { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 0 });
async function draw() {
  let rows;
  try { rows = await prism.data("data/sales.csv"); }
  catch (err) { document.getElementById("msg").textContent = err.message; return; }
  const months = [...new Set(rows.map(r => r.month))];
  const regions = [...new Set(rows.map(r => r.region))];
  chart?.destroy();
  chart = new Chart(document.getElementById("c"), {
    type: "bar",
    data: {
      labels: months.map(m => new Date(m + "-01").toLocaleDateString(prism.locale, { month: "short", year: "2-digit" })),
      datasets: regions.map(region => ({ label: region, borderRadius: 3,
        data: months.map(m => rows.find(r => r.month === m && r.region === region)?.revenue ?? 0) })),
    },
    options: {
      maintainAspectRatio: false, animation: { duration: 200 },
      plugins: { legend: { position: "top", align: "end", labels: { usePointStyle: true, boxWidth: 8 } } },
      scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: v => money.format(v), maxTicksLimit: 6 } } },
    },
  });
  document.getElementById("msg").textContent = "Source: data/sales.csv · " + rows.length + " rows";
}
draw();
prism.onDataChange(draw);
prism.onTheme(draw);
</script>
```

The same file as a table, best months first. Edit the CSV and both blocks update.

```viz table title="Top months"
source: data/sales.csv
sort: -revenue
pageSize: 6
columns:
  - month
  - region
  - { key: revenue, label: Revenue, format: eur, digits: 0 }
  - { key: orders, label: Orders, format: integer }
  - { key: returning_rate, label: Returning, format: percent, digits: 0 }
```
