// Starter blocks for "Prism: Insert starter".

export interface Starter {
	name: string;
	description: string;
	body: string;
}

const dashboard = String.raw`~~~viz chart title="Vault dashboard"
<div class="grid" id="kpis"></div>
<div class="grid" style="margin-top:12px">
  <div class="card">
    <div class="label">Notes per top-level folder</div>
    <div style="height:220px"><canvas id="folders"></canvas></div>
  </div>
  <div class="card">
    <div class="label">Recently changed</div>
    <table id="recent"><tbody></tbody></table>
  </div>
</div>
<script>
let chart;
async function draw() {
  const notes = await prism.notes({ limit: 5000 });
  const week = Date.now() - 7 * 864e5;
  const tags = new Set(notes.flatMap(n => n.tags));
  const kpis = [
    ["Notes", notes.length],
    ["Changed this week", notes.filter(n => n.mtime > week).length],
    ["Tags", tags.size],
  ];
  document.getElementById("kpis").innerHTML = kpis
    .map(([label, value]) => '<div class="card"><div class="label">' + label + '</div><div class="kpi">' + value + '</div></div>')
    .join("");

  const counts = {};
  for (const n of notes) {
    const top = n.folder.split("/")[0] || "(root)";
    counts[top] = (counts[top] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  chart?.destroy();
  chart = new Chart(document.getElementById("folders"), {
    type: "bar",
    data: { labels: entries.map(e => e[0]), datasets: [{ label: "Notes", data: entries.map(e => e[1]) }] },
    options: { indexAxis: "y", maintainAspectRatio: false, plugins: { legend: { display: false } } },
  });

  const tbody = document.querySelector("#recent tbody");
  tbody.innerHTML = "";
  for (const n of notes.slice(0, 8)) {
    const tr = tbody.insertRow();
    const a = Object.assign(document.createElement("a"), { href: "#", textContent: n.title });
    a.onclick = e => { e.preventDefault(); prism.openNote(n.path); };
    tr.insertCell().append(a);
    tr.insertCell().textContent = new Date(n.mtime).toLocaleDateString();
  }
}
draw();
prism.onNotesChange(draw);
</script>
~~~`;

const architecture = String.raw`~~~viz title="Architecture"
<style>
  svg { width: 100%; height: auto; font-family: var(--font-text); }
  .node rect { fill: var(--background-secondary); stroke: var(--interactive-accent); stroke-width: 1.5; }
  .node.store rect { stroke: var(--color-green); }
  .node text { fill: var(--text-normal); font-size: 14px; text-anchor: middle; dominant-baseline: middle; }
  .node .sub { fill: var(--text-muted); font-size: 11px; }
  .edge { stroke: var(--text-muted); stroke-width: 1.5; fill: none; marker-end: url(#arrow); }
  .edge-label { fill: var(--text-faint); font-size: 11px; text-anchor: middle; }
  #arrow path { fill: var(--text-muted); }
</style>
<svg viewBox="0 0 720 260" role="img" aria-label="Architecture">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z"/>
    </marker>
  </defs>
  <g class="node" transform="translate(20,100)"><rect width="150" height="60" rx="8"/><text x="75" y="24">Client</text><text class="sub" x="75" y="42">Browser / App</text></g>
  <g class="node" transform="translate(285,100)"><rect width="150" height="60" rx="8"/><text x="75" y="24">API</text><text class="sub" x="75" y="42">REST + Auth</text></g>
  <g class="node store" transform="translate(550,30)"><rect width="150" height="60" rx="8"/><text x="75" y="24">Database</text><text class="sub" x="75" y="42">PostgreSQL</text></g>
  <g class="node store" transform="translate(550,170)"><rect width="150" height="60" rx="8"/><text x="75" y="24">Cache</text><text class="sub" x="75" y="42">Redis</text></g>
  <path class="edge" d="M170,130 L283,130"/><text class="edge-label" x="226" y="120">HTTPS</text>
  <path class="edge" d="M435,120 C490,120 495,60 548,60"/><text class="edge-label" x="492" y="78">SQL</text>
  <path class="edge" d="M435,140 C490,140 495,200 548,200"/><text class="edge-label" x="492" y="186">get/set</text>
</svg>
~~~`;

const timeline = String.raw`~~~viz title="Timeline"
<style>
  .timeline { position: relative; margin-left: 10px; padding-left: 20px; border-left: 2px solid var(--background-modifier-border); }
  .month { margin: 14px 0 6px; font-weight: var(--font-semibold); color: var(--text-muted); font-size: var(--font-ui-small); }
  .item { position: relative; margin: 6px 0; }
  .item::before { content: ""; position: absolute; left: -27px; top: .45em; width: 10px; height: 10px; border-radius: 50%; background: var(--interactive-accent); border: 2px solid var(--background-primary); }
  .item a { text-decoration: none; }
  .item .when { color: var(--text-faint); font-size: .85em; margin-left: 6px; }
</style>
<div class="row"><span class="label">Folder</span><input id="folder" placeholder="(whole vault)"></div>
<div class="timeline" id="list"></div>
<script>
// Uses a date from frontmatter (date, meeting_date, created) and falls back to the modification time.
const DATE_FIELDS = ["date", "meeting_date", "created"];
const input = document.getElementById("folder");
input.value = prism.state.get("folder", "");
input.onchange = () => { prism.state.set("folder", input.value); draw(); };

function dateOf(n) {
  for (const f of DATE_FIELDS) {
    const v = n.frontmatter[f];
    const d = v ? new Date(v) : null;
    if (d && !isNaN(d)) return d;
  }
  return new Date(n.mtime);
}

async function draw() {
  const notes = await prism.notes({ folder: input.value || undefined, limit: 300 });
  const items = notes.map(n => ({ n, d: dateOf(n) })).sort((a, b) => b.d - a.d).slice(0, 40);
  const list = document.getElementById("list");
  list.innerHTML = "";
  let month = "";
  for (const { n, d } of items) {
    const m = d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
    if (m !== month) { month = m; list.append(Object.assign(document.createElement("div"), { className: "month", textContent: m })); }
    const item = document.createElement("div");
    item.className = "item";
    const a = Object.assign(document.createElement("a"), { href: "#", textContent: n.title });
    a.onclick = e => { e.preventDefault(); prism.openNote(n.path); };
    item.append(a, Object.assign(document.createElement("span"), { className: "when", textContent: d.toLocaleDateString() }));
    list.append(item);
  }
  if (!items.length) list.textContent = "No notes found.";
}
draw();
prism.onNotesChange(draw);
</script>
~~~`;

const frontmatterChart = String.raw`~~~viz chart title="Notes by frontmatter field"
<div class="row">
  <span class="label">Field</span>
  <select id="field"><option>type</option><option>status</option><option>tags</option></select>
  <span class="label">Folder</span><input id="folder" placeholder="(whole vault)">
</div>
<div style="height:260px; margin-top:8px"><canvas id="chart"></canvas></div>
<script>
const field = document.getElementById("field");
const folder = document.getElementById("folder");
field.value = prism.state.get("field", "type");
folder.value = prism.state.get("folder", "");
let chart;

async function draw() {
  prism.state.set("field", field.value);
  prism.state.set("folder", folder.value);
  const notes = await prism.notes({ folder: folder.value || undefined, limit: 5000 });
  const counts = {};
  for (const n of notes) {
    let v = field.value === "tags" ? n.tags : n.frontmatter[field.value];
    for (const key of [].concat(v ?? "(none)")) counts[key] = (counts[key] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  chart?.destroy();
  chart = new Chart(document.getElementById("chart"), {
    type: "doughnut",
    data: { labels: entries.map(e => e[0]), datasets: [{ data: entries.map(e => e[1]) }] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: "right" } } },
  });
}
field.onchange = folder.onchange = draw;
draw();
prism.onNotesChange(draw);
</script>
~~~`;

const tableChart = String.raw`| Kategorie | Wert |
| --- | ---: |
| A | 12 |
| B | 7 |
| C | 9 |

^prism-daten

~~~viz chart title="Chart aus der Tabelle oben"
type: bar
source: ^prism-daten
x: Kategorie
y: Wert
~~~`;

const formula = String.raw`~~~viz math
E = \sum_{i=1}^{n} p_i \cdot x_i
~~~`;

const blank = String.raw`~~~viz
<div class="card">
  <h3>Hello Prism</h3>
  <p class="muted">Edit this block. It is sandboxed, follows the theme and sizes itself.</p>
</div>
~~~`;

// Written with ~~~ fences (String.raw cannot contain backticks); inserted with ```.
const fence = (body: string) => body.replace(/^~~~/gm, "```");

export const STARTERS: Starter[] = [
	{ name: "Dashboard from notes", description: "KPIs, chart and recent notes via prism.notes()", body: fence(dashboard) },
	{ name: "Architecture diagram", description: "Themed SVG boxes and arrows", body: fence(architecture) },
	{ name: "Timeline", description: "Notes on a timeline by frontmatter date", body: fence(timeline) },
	{ name: "Chart from frontmatter", description: "Doughnut chart of a frontmatter field (Chart.js)", body: fence(frontmatterChart) },
	{ name: "Chart from a table in this note", description: "Markdown table + declarative chart (no code), updates when the table changes", body: fence(tableChart) },
	{ name: "Formula (LaTeX)", description: "KaTeX display formula, offline", body: fence(formula) },
	{ name: "Blank block", description: "Minimal viz block", body: fence(blank) },
];
