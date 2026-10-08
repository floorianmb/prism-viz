---
type: showcase
tags: [prism, example, tasks, links]
status: done
date: 2026-10-08
---
# Tasks and links

`prism.notes({ include: [...] })` can add more than metadata: `tasks` (with due dates and priorities parsed from the Tasks-plugin emoji format), `links` and `backlinks`. The ten notes in the `Notes` folder contain real `- [ ]` and `- [x]` tasks and `[[links]]` to each other, so the blocks below have something to show.

## Open and done tasks

```viz chart id=tasks title="Tasks per note"
<div class="toolbar"><span class="muted" id="sum"></span></div>
<div id="wrap"><canvas id="c"></canvas></div>
<p class="caption">Counted from <code>- [ ]</code> and <code>- [x]</code> in the Notes folder. Notes without tasks are left out.</p>
<script>
let chart;
async function draw() {
  const notes = (await prism.notes({ folder: "Notes", include: ["tasks"] })).filter(n => n.tasks.length);
  notes.sort((a, b) => b.tasks.filter(t => !t.done).length - a.tasks.filter(t => !t.done).length || a.title.localeCompare(b.title));
  const open = notes.map(n => n.tasks.filter(t => !t.done).length);
  const done = notes.map(n => n.tasks.filter(t => t.done).length);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const total = sum(open) + sum(done);
  document.getElementById("sum").textContent = sum(open) + " open, " + sum(done) + " done" + (total ? " (" + prism.format(sum(done) / total, "percent", 0) + ")" : "");
  document.getElementById("wrap").style.height = Math.max(160, 44 + notes.length * 28) + "px";
  chart?.destroy();
  chart = new Chart(document.getElementById("c"), {
    type: "bar",
    data: { labels: notes.map(n => n.title), datasets: [
      { label: "Open", data: open, backgroundColor: prism.color("--color-orange"), borderRadius: 3 },
      { label: "Done", data: done, backgroundColor: prism.color("--color-green"), borderRadius: 3 },
    ] },
    options: {
      indexAxis: "y", maintainAspectRatio: false, animation: { duration: 200 },
      plugins: { legend: { position: "top", align: "end", labels: { usePointStyle: true, boxWidth: 8 } } },
      scales: { x: { stacked: true, ticks: { precision: 0, stepSize: 1 } }, y: { stacked: true, grid: { display: false } } },
    },
  });
  prism.resize();
}
draw();
prism.onNotesChange(draw);
prism.onTheme(draw);
</script>
```

## What is due next

```viz id=due title="Next open tasks"
<div id="list" class="stack"></div>
<p class="caption">Open tasks with a due date, soonest first. Click a note name to open it.</p>
<script>
const LEVEL = { highest: ["Highest", "error"], high: ["High", "warning"], medium: ["Medium", ""], low: ["Low", "muted"], lowest: ["Lowest", "muted"] };
const today = new Date().toISOString().slice(0, 10);
async function draw() {
  const rows = [];
  for (const n of await prism.notes({ folder: "Notes", include: ["tasks"] }))
    for (const t of n.tasks) if (!t.done && t.due) rows.push({ n, t });
  rows.sort((a, b) => a.t.due.localeCompare(b.t.due));
  const list = document.getElementById("list");
  if (!rows.length) { list.textContent = "No open tasks with a due date."; return; }
  list.replaceChildren(...rows.slice(0, 7).map(({ n, t }) => {
    const row = Object.assign(document.createElement("div"), { className: "row" });
    row.style.cssText = "gap:10px;align-items:baseline";
    const when = Object.assign(document.createElement("span"), { textContent: prism.format(t.due, "date") });
    when.style.cssText = "min-width:5.5em;font-variant-numeric:tabular-nums";
    when.className = t.due < today ? "error" : "muted";
    const text = Object.assign(document.createElement("span"), { textContent: t.text });
    text.style.flex = "1";
    const link = Object.assign(document.createElement("a"), { href: "#", textContent: n.title, className: "label" });
    link.onclick = e => { e.preventDefault(); prism.openNote(n.path); };
    row.append(when, text);
    if (t.priority && LEVEL[t.priority]) row.append(Object.assign(document.createElement("span"), { className: "badge " + LEVEL[t.priority][1], textContent: LEVEL[t.priority][0] }));
    row.append(link);
    return row;
  }));
  prism.resize();
}
draw();
prism.onNotesChange(draw);
</script>
```

## How the notes link

Every wiki link between notes is an edge, every note a dot. Dot size grows with the number of backlinks, color shows the note `type`. Hover a dot for Obsidian's page preview, click it to open the note, drag to rearrange.

```viz d3 id=graph title="Link graph" height=420
<div class="toolbar"><div id="legend" class="row"></div><span class="muted" id="count"></span></div>
<svg id="svg" style="width:100%;height:360px;display:block"></svg>
<style>
  .edge { stroke: var(--text-faint); stroke-opacity: .45; }
  .node { cursor: pointer; stroke: var(--background-primary); stroke-width: 1.5; }
  .node:hover { stroke: var(--text-normal); }
  .name { font-size: 10px; fill: var(--text-muted); pointer-events: none; }
</style>
<script>
const svg = d3.select("#svg"), H = 360;
let sim;
async function draw() {
  const notes = await prism.notes({ include: ["links", "backlinks"] });
  const byPath = new Map(notes.map(n => [n.path, n]));
  const edges = [];
  for (const n of notes) for (const l of new Set(n.links)) if (byPath.has(l) && l !== n.path) edges.push({ source: n.path, target: l });
  const linked = new Set(edges.flatMap(e => [e.source, e.target]));
  const nodes = notes.filter(n => linked.has(n.path)).map(n => ({ id: n.path, title: n.title, type: n.frontmatter.type ?? "note", deg: n.backlinks.length }));
  const types = [...new Set(nodes.map(n => n.type))].sort();
  const color = d3.scaleOrdinal(types, prism.palette);
  document.getElementById("count").textContent = nodes.length + " notes, " + edges.length + " links";
  document.getElementById("legend").replaceChildren(...types.map(t => {
    const s = Object.assign(document.createElement("span"), { className: "muted", textContent: t });
    s.style.cssText = "display:inline-flex;align-items:center;gap:5px;font-size:var(--font-ui-smaller)";
    const dot = document.createElement("i");
    dot.style.cssText = "width:9px;height:9px;border-radius:50%;background:" + color(t);
    s.prepend(dot);
    return s;
  }));
  const W = svg.node().clientWidth || 640;
  svg.attr("viewBox", [0, 0, W, H]).selectAll("*").remove();
  sim?.stop();
  const r = d => 5 + Math.sqrt(d.deg) * 3;
  sim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(edges).id(d => d.id).distance(75).strength(0.5))
    .force("charge", d3.forceManyBody().strength(-260))
    .force("center", d3.forceCenter(W / 2, H / 2))
    .force("x", d3.forceX(W / 2).strength(0.04)).force("y", d3.forceY(H / 2).strength(0.08))
    .force("collide", d3.forceCollide(d => r(d) + 24))
    .stop();
  for (let i = 0; i < 300; i++) sim.tick();
  const clampX = d => (d.x = Math.max(r(d) + 4, Math.min(W - r(d) - 4, d.x)));
  const clampY = d => (d.y = Math.max(r(d) + 4, Math.min(H - r(d) - 14, d.y)));
  nodes.forEach(d => { clampX(d); clampY(d); });
  const link = svg.append("g").selectAll("line").data(edges).join("line").attr("class", "edge");
  const node = svg.append("g").selectAll("circle").data(nodes).join("circle")
    .attr("class", "node").attr("r", r).attr("fill", d => color(d.type))
    .on("mouseenter", (e, d) => prism.hoverNote(d.id, e))
    .on("mouseleave", () => prism.hoverEnd())
    .on("click", (e, d) => prism.openNote(d.id))
    .call(d3.drag()
      .on("start", (e, d) => { prism.hoverEnd(); sim.alphaTarget(0.25).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on("end", (e, d) => { sim.alphaTarget(0); d.fx = d.fy = null; }));
  const label = svg.append("g").selectAll("text").data(nodes).join("text")
    .attr("class", "name").attr("text-anchor", "middle").text(d => d.title.replace(/^\d+ /, ""));
  const paint = () => {
    nodes.forEach(d => { clampX(d); clampY(d); });
    link.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    node.attr("cx", d => d.x).attr("cy", d => d.y);
    label.attr("x", d => d.x).attr("y", d => d.y + r(d) + 11);
  };
  paint();
  sim.on("tick", paint);
}
draw();
prism.onNotesChange(draw);
</script>
```

Add a `[[link]]` to any note and the graph grows after a moment; tick a task and the first chart shifts from orange to green. The same data comes from `prism.notes` with `include: ["tasks", "links", "backlinks"]` - no note text is ever parsed by the block.
