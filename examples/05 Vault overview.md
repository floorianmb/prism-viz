---
type: showcase
tags: [prism, example, overview]
status: done
date: 2026-10-05
---
# Vault overview

No numbers are typed in here. The blocks ask `prism.notes()` for the metadata of every note in this vault (`type`, `status`, `date` and tags from the frontmatter) and update when notes change. Add a note with frontmatter and watch the chart move.

```viz chart id=overview title="Notes in this vault"
<div class="toolbar"><div id="by"></div><span class="muted" id="count"></span></div>
<div style="height:280px"><canvas id="c"></canvas></div>
<p class="caption">Stacked by <code>status</code>. Tags count once per note.</p>
<script>
const STATUS = [["done", "--color-green"], ["active", "--color-blue"], ["draft", "--text-faint"]];
let chart, group = "Type";
function keysOf(n) {
  if (group === "Type") return [n.frontmatter.type ?? "none"];
  if (group === "Month") return [String(n.frontmatter.date ?? "").slice(0, 7) || "none"];
  return n.tags.map(t => t.replace(/^#/, ""));
}
async function draw() {
  const notes = await prism.notes();
  document.getElementById("count").textContent = notes.length + " notes";
  const table = {};
  for (const n of notes) for (const k of keysOf(n)) {
    const row = (table[k] ??= { done: 0, active: 0, draft: 0, total: 0 });
    row[n.frontmatter.status] = (row[n.frontmatter.status] || 0) + 1;
    row.total++;
  }
  let labels = Object.keys(table);
  labels = group === "Month" ? labels.sort() : labels.sort((a, b) => table[b].total - table[a].total).slice(0, 9);
  const datasets = STATUS.map(([s, v]) => ({ label: s, data: labels.map(l => table[l][s] || 0), backgroundColor: prism.color(v), borderRadius: 3 }));
  chart?.destroy();
  chart = new Chart(document.getElementById("c"), {
    type: "bar", data: { labels, datasets },
    options: {
      maintainAspectRatio: false, animation: { duration: 200 },
      plugins: { legend: { position: "top", align: "end", labels: { usePointStyle: true, boxWidth: 8 } } },
      scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { precision: 0, stepSize: 1 } } },
    },
  });
}
prism.segmented("#by", ["Type", "Tag", "Month"], { key: "by", value: "Type", onChange(v) { group = v; draw(); } });
prism.onNotesChange(draw);
prism.onTheme(draw);
</script>
```

The most recent notes, newest first. Click a title to open it.

```viz id=recent title="Latest notes"
<div class="grid" id="list" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))"></div>
<script>
async function draw() {
  const notes = (await prism.notes({ folder: "Notes" }))
    .filter(n => n.frontmatter.date)
    .sort((a, b) => String(b.frontmatter.date).localeCompare(String(a.frontmatter.date)))
    .slice(0, 6);
  document.getElementById("list").replaceChildren(...notes.map(n => {
    const card = Object.assign(document.createElement("div"), { className: "card" });
    const link = Object.assign(document.createElement("a"), { href: "#", textContent: n.title });
    link.onclick = e => { e.preventDefault(); prism.openNote(n.path); };
    const meta = Object.assign(document.createElement("div"), { className: "label" });
    meta.append(String(n.frontmatter.date).slice(0, 10) + " · ", Object.assign(document.createElement("span"), { className: "badge", textContent: n.frontmatter.type ?? "note" }));
    card.append(link, meta);
    return card;
  }));
}
draw();
prism.onNotesChange(draw);
</script>
```
