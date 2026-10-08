---
type: showcase
tags: [prism, example, dashboard]
status: done
date: 2026-10-01
---
# Dashboard

A reading tracker kept as a plain Markdown table. The dashboard below reads it with `prism.note().table("^books")`, so editing a cell updates the cards and charts instantly.

| Book | Genre | Pages | Read | Rating | Status |
| --- | --- | --- | --- | --- | --- |
| Dune | Sci-fi | 688 | 688 | 5 | Done |
| The Left Hand of Darkness | Sci-fi | 304 | 304 | 4 | Done |
| Deep Work | Non-fiction | 296 | 296 | 4 | Done |
| Thinking, Fast and Slow | Non-fiction | 499 | 340 | – | Reading |
| The Pragmatic Programmer | Tech | 352 | 352 | 5 | Done |
| Data-Intensive Apps | Tech | 616 | 210 | – | Reading |
| Piranesi | Fantasy | 272 | 120 | – | Reading |
| The Name of the Wind | Fantasy | 662 | 0 | – | Planned |

^books

```viz chart id=reading title="Reading 2026"
<div class="grid" id="kpis" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))"></div>
<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));margin-top:12px">
  <div class="card"><div class="label">Progress per book</div><div style="height:240px"><canvas id="bars"></canvas></div></div>
  <div class="card"><div class="label">Pages read by genre</div><div style="height:240px"><canvas id="ring"></canvas></div></div>
</div>
<script>
let bars, ring;
const nf = new Intl.NumberFormat(prism.locale);
async function draw() {
  const rows = (await prism.note()).table("^books");
  const total = rows.reduce((s, r) => s + r.Pages, 0);
  const read = rows.reduce((s, r) => s + r.Read, 0);
  const rated = rows.filter(r => r.Rating != null);
  const avg = rated.reduce((s, r) => s + r.Rating, 0) / (rated.length || 1);
  const kpis = [
    ["Books finished", rows.filter(r => r.Status === "Done").length + " / " + rows.length],
    ["Pages read", nf.format(read)],
    ["Average rating", prism.format(avg, "number", 1) + " / 5"],
    ["Completion", prism.format(read / total, "percent", 0)],
  ];
  document.getElementById("kpis").replaceChildren(...kpis.map(([label, value]) => {
    const card = Object.assign(document.createElement("div"), { className: "card" });
    card.append(Object.assign(document.createElement("div"), { className: "label", textContent: label }),
                Object.assign(document.createElement("div"), { className: "kpi", textContent: value }));
    return card;
  }));

  bars?.destroy();
  bars = new Chart(document.getElementById("bars"), {
    type: "bar",
    data: { labels: rows.map(r => r.Book), datasets: [{ label: "Progress", data: rows.map(r => Math.round(100 * r.Read / r.Pages)), borderRadius: 4 }] },
    options: {
      indexAxis: "y", maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.parsed.x + " %" } } },
      scales: { x: { min: 0, max: 100, ticks: { callback: v => v + " %" }, grid: { display: false } }, y: { grid: { display: false } } },
    },
  });

  const byGenre = {};
  for (const r of rows) byGenre[r.Genre] = (byGenre[r.Genre] || 0) + r.Read;
  ring?.destroy();
  ring = new Chart(document.getElementById("ring"), {
    type: "doughnut",
    data: { labels: Object.keys(byGenre), datasets: [{ data: Object.values(byGenre), borderWidth: 0 }] },
    options: { maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "bottom" } } },
  });
}
draw();
prism.onNoteChange(draw);
</script>
```
