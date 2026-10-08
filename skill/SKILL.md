---
name: prism
description: Create, fix and verify interactive visualizations in Obsidian notes with the Prism plugin (```viz code blocks with HTML/SVG/JS, Chart.js, D3, Mermaid, KaTeX/LaTeX formulas, declarative charts from Markdown tables, Bases chart views). Use whenever the user wants a chart, graph, diagram, dashboard, timeline, widget, formula or visual overview in an Obsidian vault that has .obsidian/plugins/prism-viz – also for "Diagramm", "Grafik", "Visualisierung", "Dashboard", "Auswertung", "Übersicht", "Formel", "LaTeX" – or mentions Prism, viz blocks or .prism/errors.json.
---

# Prism visualizations in Obsidian

Prism renders ```viz code blocks inline in notes: sandboxed iframe, bundled offline libraries, Obsidian theme colors, automatic height. Your loop: **plan → write the block → render it from the command line → read errors and look at the snapshot → fix**, until the render is clean.

## 0. Before you start

- **Vault root**: the nearest ancestor of the working directory that contains `.obsidian/plugins/prism-viz/`. If there is none, use `{{VAULT}}`. If Prism is not installed there, tell the user and do not write viz blocks.
- **Reference**: read `reference.md` next to this file before writing the first block of a session. It has the full syntax, the `window.prism` API, design rules and the error format.
- **Design**: read `design.md` next to this file before the first block of a session. It sets the quality bar (composition, color, controls, motion) and the polish pass in step 3.
- **Vault conventions win**: follow the vault's own `AGENTS.md` / `CLAUDE.md` for notes (frontmatter, indexes, logs, language). Prism blocks are content like any other paragraph.
- **Never** edit or delete anything in `<vault>/.prism/` (Prism owns these files) or the plugin's `data.json` (user settings and widget state).

## 1. Plan

**Where**: as a new section in the note the user means, or a new note if asked. Do not change other existing blocks unless that is the task.

**Data source**: pick exactly one per block:

| Data | Use | Never |
| --- | --- | --- |
| Note metadata (type, status, tags, dates, folders) | `prism.notes({ folder, tag, limit })` | copying note lists into the block |
| Links, backlinks, headings or tasks across notes | `prism.notes({ include: ["tasks"] })` (also `"links"`, `"backlinks"`, `"headings"`) | parsing note text yourself |
| A small table the reader should see and edit | a Markdown table in the note + `^id` line, charted with a declarative ```` ```viz chart ```` block (`source: ^id`) or `(await prism.note()).table("^id")` | duplicating the numbers inside the block |
| Parameters of this note (e.g. a coefficient in frontmatter) | `(await prism.note()).frontmatter` | hard-coding the value in several blocks |
| CSV / TSV / JSON / YAML / TXT files in the vault | `prism.data("path/file.csv")` | pasting the file content into the block |
| A few values the user gives you | inline array in the script | – |
| Anything on the internet | not available (network is blocked) | `fetch`, CDN `<script src>`, remote images |

For `prism.data`: check `settings.dataFolders` in `<vault>/.obsidian/plugins/prism-viz/data.json` (read only). If the file's folder is not listed, ask the user to add it under *Settings → Prism → Data folders* – do not change the setting yourself.

**Library** (fence keywords): `chart` for standard charts (bar, line, pie, scatter) – prefer the **declarative YAML form** (no HTML, see reference) when the data is a table or CSV; `d3` for custom layouts, timelines, networks, maps from GeoJSON; `mermaid` for flowcharts, sequence diagrams, Gantt, mind maps written as text; `math` (KaTeX) for formulas – a ```` ```viz math ```` block with plain LaTeX, or `$…$` inside HTML blocks; plain SVG without keyword for architecture and box-and-arrow diagrams; `three` only for explicit 3D requests.

**Interactive explanations**: put controls (sliders, selects) in one block and bind them with `prism.shared.bind("#slider", "key", default, onValue)`; other blocks of the same note read `prism.shared.get("key")` and redraw in `prism.shared.onChange(draw)`. Text between the blocks explains what changes.

**Scenes and animations**: use the building blocks instead of hand-written boilerplate – `prism.canvas` (crisp, resizing canvas), `prism.animate` (frame loop that pauses off screen and respects reduced motion), `prism.segmented` (mode switch), and the classes `.toolbar`, `.stage`, `.hud`, `button.chip`, `button.icon-button`, `.caption`. Blocks stay short, which also makes them faster to write.

**Several views of the same data**: `prism.variants` (e.g. bar / line / table) instead of picking one.

**Scrollytelling** (a visual that follows the text): one block above a few short sections reacts to `prism.onSection(cb)`, which reports the heading the reader is at. Name the sections so the block can map them (e.g. "Step 1: …").

**Tables of data** (e.g. CSV files with `source`/`confidence` columns): a ```` ```viz table ```` block with `source: path/file.csv` gives search, sorting, number formatting and clickable sources without code.

**Diagrams that navigate**: in Mermaid labels write `A["[[Note name]]"]`; clicking the node opens the note.

**Bases**: for a chart over a filtered set of notes the user maintains as a `.base` file, suggest the built-in Bases view "Prism chart" (no code) instead of a viz block.

## 2. Write

Checklist for every block:

- Fence: ```` ```viz <libraries> title="Short caption" ````. Add `id=<slug>` whenever the block uses `prism.state` (otherwise state is keyed by block position and moves when blocks are inserted above).
- Do not add `eager`: it disables lazy rendering, so every block of the note runs at once. Use it only when a block must run before it is scrolled into view, and say why.
- Colors only from Obsidian CSS variables (`var(--text-normal)`, `var(--interactive-accent)`, `var(--color-blue)` …) or `prism.palette`. No hex colors, no white or black backgrounds; the page background stays transparent; use `.card`, `.grid`, `.row`, `.kpi`, `.label`, `.muted`. Only exception: a dark *stage* for scenes such as simulations (see `design.md`).
- Chart.js: put the canvas in a container with explicit height, e.g. `<div style="height:280px"><canvas id="c"></canvas></div>`, and set `maintainAspectRatio: false`. Leave dataset colors unset; Prism applies the theme palette.
- No `100vh`, no `height:100%` on html/body, no `position:fixed`. SVG: `viewBox` plus `width:100%; height:auto`, styled through a `<style>` block, not `fill="var(...)"` attributes.
- Handle empty or missing data with a visible message instead of an empty chart.
- With `prism.notes`, `prism.data` or `prism.note`, redraw on `prism.onNotesChange(draw)`, `prism.onDataChange(draw)` or `prism.onNoteChange(draw)` and destroy old Chart instances before redrawing (`chart?.destroy()`). Declarative charts redraw by themselves.
- In the note text before the block: one sentence on what it shows and, for file data, a relative Markdown link to the data file as its source. Labels and text in the note's language.

## 3. Verify (mandatory after every edit)

```bash
node "<vault>/.obsidian/plugins/prism-viz/scripts/prism-render.mjs" "<note path relative to the vault>"
```

The note does not need to be open; Obsidian stays in the background. Output is JSON: `status` and per block `status`, `errors[{ kind, line, message }]`, `snapshotFile`.

- **Exit 0** (ok/warning): read any warnings and fix the ones you caused.
- **Exit 1** (block errors): `line` is the 1-based line in the note. Fix each error, then render again.
- **Exit 2** (failed): read `message` (wrong path, no viz blocks).
- **Exit 3** (Obsidian not reachable): ask the user to open Obsidian with this vault and Prism enabled, then retry. If that is not possible, tell the user the block is unverified; after they open the note, `.prism/errors.json` → `blocks["<note path>#<index>"]` shows the result (check that `renderedAt` is newer than your edit).
- **Look at every `snapshotFile`** (open the PNG): Is the chart empty? Labels cut off or overlapping? Legend covering data? Text unreadable against the background? Fix the layout and render again.
- **Polish pass**: once the render is clean, run the checklist at the end of `design.md` on the snapshot and do one improvement round. For interactive blocks, also render the other states (temporarily change the defaults, then restore them).
- Stop after three fix rounds and report what is still wrong instead of looping.
- To check the whole vault (e.g. after a Prism update), run the script with `--all`; it prints one line per note and a JSON summary.

Common errors:

| Message | Cause | Fix |
| --- | --- | --- |
| `Chart is not defined` / `d3` / `mermaid` / `THREE` | library keyword missing | add `chart` / `d3` / `mermaid` / `three` to the fence |
| `csp` … `Blocked by Content-Security-Policy` | network access | use `prism.data` / `prism.notes` or inline the data |
| `prism.data is off` / `outside the data folders` | folder not allowlisted | ask the user to add the folder in Prism settings |
| `.md files are not readable` | `prism.data` on a note | use `prism.notes` for metadata, `prism.note()` for tables/frontmatter of the block's own note |
| `prism.note().table(…): no such table` | wrong id/heading, or `^id` not on its own line after the table | the message lists the tables; put `^id` on its own line after a blank line |
| `prism.chart: column "…" not found` | YAML spec names a column that is not in the header | use the exact header text (case-sensitive) |
| `KaTeX: …` | LaTeX syntax | fix the formula; `\` and `{}` must be balanced |
| `Mermaid: Parse error on line N` | Mermaid syntax | N counts lines inside the block (note line = fence line + N); quote labels with special characters: `A["Label (x)"]` |
| `Auto-height stopped` | `100vh` / `height:100%` | remove it, or set `height=N` on the fence |
| `Prism stopped a loop` | loop never ends or blocks > 2 s | fix the loop condition; split heavy work |
| `timeout` | slow or blocking code | simplify, reduce data, avoid synchronous heavy work |

## 4. Report

Tell the user briefly: what you added and where (note and section), the data source, the final render status and the snapshot path. Interactive behavior (clicks, sliders) is not covered by the snapshot – say so if the block is interactive.

## Patterns

Chart from a CSV file:

````markdown
```viz chart title="Units per year"
<div style="height:280px"><canvas id="c"></canvas></div>
<p class="muted" id="msg"></p>
<script>
let chart;
async function draw() {
  const rows = await prism.data("Projects/data/units.csv");
  if (!rows.length) { document.getElementById("msg").textContent = "No data."; return; }
  chart?.destroy();
  chart = new Chart(document.getElementById("c"), {
    type: "line",
    data: { labels: rows.map(r => r.year), datasets: [{ label: "Units", data: rows.map(r => r.units) }] },
    options: { maintainAspectRatio: false },
  });
}
draw();
prism.onDataChange(draw);
</script>
```
````

Overview from note metadata:

````markdown
```viz title="Open drafts"
<div class="grid" id="cards"></div>
<script>
async function draw() {
  const notes = (await prism.notes({ folder: "Projects" })).filter(n => n.frontmatter.status === "draft");
  document.getElementById("cards").replaceChildren(...notes.slice(0, 12).map(n => {
    const card = Object.assign(document.createElement("div"), { className: "card" });
    const link = Object.assign(document.createElement("a"), { href: "#", textContent: n.title });
    link.onclick = e => { e.preventDefault(); prism.openNote(n.path); };
    card.append(link, Object.assign(document.createElement("div"), { className: "label", textContent: n.folder }));
    return card;
  }));
}
draw();
prism.onNotesChange(draw);
</script>
```
````

Animated scene with a mode switch (building blocks):

````markdown
```viz id=scene title="Short caption"
<div class="toolbar"><div id="mode"></div><button class="icon-button" id="play"></button></div>
<div class="stage" id="stage"><div class="hud"><span id="hud"></span></div></div>
<p class="caption">What the reader should notice.</p>
<script>
const scene = prism.canvas("#stage");
let mode = "A", loop; // declared before segmented(): onChange runs at once
prism.segmented("#mode", ["A", "B"], { key: "mode", onChange: (v) => { mode = v; loop?.redraw(); } });
loop = prism.animate((dt, t) => {
  const { ctx, width, height } = scene;
  scene.clear();
  // draw the frame for `mode` at time t (dt = 0 on the first call)
  document.getElementById("hud").innerHTML = `t = <b>${prism.format(t, "number", 1)}</b>`;
});
const play = document.getElementById("play");
const icon = (on) => (play.innerHTML = on ? '<svg viewBox="0 0 16 16"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>' : '<svg viewBox="0 0 16 16"><path d="M4.5 2.5v11l9-5.5z"/></svg>');
loop.onChange(icon); icon(loop.playing); play.onclick = () => loop.toggle();
scene.onResize(() => loop.redraw());
</script>
```
````

Diagram as text:

````markdown
```viz mermaid
flowchart LR
  A[Source] --> B{Check} -->|ok| C[Publish]
  B -->|error| A
```
````
