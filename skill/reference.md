# Prism – visualizations in notes (reference for agents)

Prism (Obsidian plugin `prism-viz`, v0.5.1) renders HTML/SVG/CSS/JS from `viz` code blocks inline in notes: sandboxed, offline, themed, auto-sized.

## Syntax

````
```viz [library keywords] [height=420] [title="Caption"] [id=name] [raw] [eager] [notoolbar] [source]
<div class="card">HTML fragment or a full <!doctype html> document</div>
<script>/* plain JS, runs in the block */</script>
```
````

- Body: HTML fragment (preferred) or a complete document. `<style>` and `<script>` inline. No ES module imports from URLs.
- Library keywords (bundled, offline, loaded before your scripts):
  - `chart` (`chartjs`, `chart.js`): Chart.js 4 (global `Chart`); defaults follow the theme, datasets without colors use the theme palette.
  - `d3`: D3 v7 (global `d3`).
  - `mermaid`: Mermaid 11 (global `mermaid`); `.mermaid` elements render automatically with theme colors. A block whose body is plain Mermaid text (not HTML) is rendered as a diagram.
  - `katex` (`math`, `latex`, `tex`): KaTeX (global `katex`, with mhchem). `$…$`, `$$…$$`, `\(…\)` and `\[…\]` in the block render as formulas automatically; call `prism.math(element)` after inserting new text with formulas.
  - `three` (`threejs`, `three.js`): three.js (global `THREE`, includes `THREE.OrbitControls`).
- `height=N` fixes the height in px; default is auto-height. `title="…"` shows a caption. `id=name` keeps `prism.state` stable even if blocks are reordered (otherwise state is keyed by note path + block position). `raw` disables the default stylesheet. `eager` renders without waiting for the block to scroll into view (avoid it: it disables lazy rendering for that block). `source` shows the source below the rendering.
- Plain Mermaid: ```viz mermaid` with Mermaid text as body (no HTML) renders the diagram directly. Node labels may contain wiki links – `A["[[Note name]]"]` or `A["[[Note name|Shown text]]"]` (quoted; `A[[…]]` unquoted is Mermaid's subroutine shape): the label shows the text and clicking the node opens the note.
- Data table: ```viz table` with a YAML/JSON spec renders a searchable, sortable table – `source` (`^block-id`, `table:<heading>` or a data file path) or `rows`, optional `columns` (keys or `{ key, label, format, digits }`), `format: { col: eur }`, `sort: -col`, `filter`, `pageSize` (25), `search`, `title`. Formats: `text`, `number`, `integer`, `percent`, `eur`, `usd`, `date`, `link`, `badge`; guessed from column names and values (`source`/URLs → link, `confidence`/`status` → colored badge, years stay plain). Numbers use Obsidian's language. Sort order and search text persist.
- Plain LaTeX: ```viz math` (alias of `katex`) with LaTeX as body renders one display formula; a body containing `$…$` / `$$…$$` is text with formulas (blank line = new paragraph). Chemistry via `\ce{…}` (mhchem).
- Declarative chart: ```viz chart` with a YAML/JSON object as body instead of HTML draws a Chart.js chart without any code:

````
```viz chart title="Umsatz je Quartal"
type: bar            # bar | hbar | line | area | pie | doughnut | scatter | radar | polarArea | bubble
source: ^quartale    # "^block-id" / "table:<heading>" / "#0" = Markdown table of this note, or a data file path, or use rows: [...]
x: Quartal           # label column (default: first column)
y: [Basis, Ziel]     # value columns (default: all numeric columns)
series: model_line   # optional: long format, one dataset per value of this column (values from the first y column)
filter: { year: 2024 }   # optional; sort: -Ziel, limit: 10, stacked: true, height: 300, options: {Chart.js options}
```
````

  The chart redraws when the table or data file changes. Unknown keys and missing columns are reported as warnings. The same spec works in HTML blocks: `await prism.chart("#el", spec)` (returns the Chart.js instance).
- Web page: ```viz web height=600` with a URL as body (or YAML `url: https://…`, optional `mode: auto | webview | iframe`, `theme: light | dark` – default `light`, Obsidian's dark mode is not passed on) shows a website inline with back/forward/reload and "open in browser". Desktop uses a full browser view (works for sites that refuse to be framed), mobile an iframe. Needs the user setting Online access → Web pages; otherwise the block shows how to enable it. Command-line renders show a placeholder card instead of the page.
- Page monitor: ```viz monitor` (empty body) shows two live numbers for the page it is on (the blocks in the same tab): RAM in MB and CPU in % of the whole machine (all cores), updated every second while visible. Blocks share Obsidian's process, so their CPU is the main-thread time of their scripts and their RAM the canvas/WebGL/image buffers; ```viz web` blocks run in their own process and are measured exactly. Use it when the user asks how heavy a note is. Per-block figures: `prism.perf.watch`.
- HTML files: `![[file.html]]` embeds a vault HTML file with the same renderer; options go into `<meta name="prism" content="chart height=400">` or `<!-- prism: chart height=400 -->`, or the embed alias `![[file.html|height=400]]`.

## Sandbox and limits

- `sandbox="allow-scripts"`, opaque origin. No access to Obsidian, the vault, cookies or the host DOM.
- CSP: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:`. Network (fetch, CDN scripts, remote images, web fonts) is blocked unless the user allowlists a domain in the settings. Inline data, use the bundled libraries, embed images as `data:` URIs.
- Online access (Settings → Prism → Online access; both switches are off by default and only the user turns them on – never ask to enable them as a workaround): **API requests** enables `prism.http` (requests sent by Obsidian, no CORS, 60 per minute and 4 at a time per block, 30 s timeout, 10 MB response limit). By default the reader must click "Run requests" below the block before its requests are sent (once per render). `prism.online` tells the block what is allowed – see "Live data from web APIs" below. **Web pages** allows `<iframe src="https://…">` inside blocks and ```viz web` blocks. Iframes inside blocks show pages in light mode (set `style="color-scheme:dark"` on the iframe for dark) and inherit the block sandbox (no cookies or storage, many sites refuse to be framed); use ```viz web` to show whole websites. Never put API keys or passwords in a block unless the user asks for it – they would be stored in plain text in the note. When a feature is off, calls reject with a message that says so; show it in the block.
- `alert` → toast; `confirm` → false; `prompt` → null. `localStorage` works but is persisted through `prism.state`. Forms do not submit; `submit` events are still dispatched, so call `event.preventDefault()` and handle them in JS.
- Loops in inline scripts are guarded: a loop that blocks the thread for more than 2 s is stopped with an error (blocks share Obsidian's main thread). Split long work with `setTimeout`/`requestAnimationFrame`.
- Links: `<a href="Note name">` opens a note in Obsidian; `https://…` opens the system browser; the block itself never navigates.

## Runtime API: `window.prism`

| API | Description |
| --- | --- |
| `prism.theme` | `{ dark, mode, vars, palette }` – current Obsidian theme. |
| `prism.onTheme(cb)` | Called with `prism.theme` after theme or light/dark changes. Returns an unsubscribe function. CSS variables update automatically; use this only for canvas/JS-drawn colors. |
| `prism.palette` | 8 categorical colors from the theme (also `--prism-series-1`…`--prism-series-8`). |
| `prism.color("--text-accent")` | Resolved value of a theme variable. |
| `prism.notes({ folder?, tag?, limit?, sort?, order? })` | Promise of `[{ path, name, folder, title, tags, frontmatter, mtime }]` (read-only metadata, no note contents). `folder` = path prefix, `tag` matches nested tags, `limit` ≤ 5000 (default 1000), `sort` = `"mtime"` (default) / `"path"` / `"title"`, `order` = `"desc"` / `"asc"`. |
| `prism.notes({ …, include: ["links", "backlinks", "headings", "tasks"] })` | Adds per note: `links` (resolved vault paths; unresolved links as written), `backlinks` (paths linking here), `headings` (`[{ level, text, line }]`), `tasks` (`[{ text, status, done, line, due?, scheduled?, start?, doneDate?, priority?, tags }]` – Tasks-plugin emoji fields 📅 ⏳ 🛫 ✅ and priorities 🔺⏫🔼🔽⏬ are parsed out of `text`). Only request what you need. |
| `prism.onNotesChange(cb)` | Called (debounced) when vault metadata changes; re-query inside. |
| `prism.note()` | Promise of the block's own note: `{ path, title, tags, frontmatter, mtime, headings, links, backlinks, tasks, tables }`. `tables[i]` = `{ index, id, heading, lines, columns, rows }` with typed rows (numbers incl. `0,385`, booleans, empty → `null`; link/emphasis markup stripped). `note.table(ref)` returns the rows of a table by `"^block-id"`, heading text or index and throws a list of the available tables if none matches. Put `^id` on its own line after the table (blank line before it) to name a table. Use this to keep data visible and editable as a Markdown table, and frontmatter values as parameters. |
| `prism.onNoteChange(cb)` | Called when the block's own note changes (text, tables, frontmatter); re-read with `prism.note()`. |
| `prism.chart(target, spec)` | Declarative Chart.js chart, see "Declarative chart" above. Needs the `chart` keyword. |
| `prism.table(target, spec)` | The table of ```viz table` inside HTML blocks (same spec). |
| `prism.format(value, kind?, digits?)` | Formats in Obsidian's language: `kind` = `"number"` (default), `"integer"`, `"percent"` (0.12 or 12 → 12 %), `"eur"`, `"usd"`, `"date"`. `prism.locale` is the language tag. |
| `prism.math(target?)` | Renders `$…$` / `$$…$$` in an element (after you inserted text); initial content renders automatically. Needs `katex`/`math`. |
| `prism.data(path, opts?)` | Promise of a data file's content, read-only: CSV/TSV → array of row objects (numbers/booleans typed, empty → `null`, `rows.columns` = header), JSON/GeoJSON → parsed, YAML → parsed, TXT → string. `path` is vault-relative or `./`/`../` relative to the note. Only files inside the data folders set in Prism's settings; otherwise the promise rejects with the reason. `opts`: `{ typed: false }`, `{ header: false }` (arrays), `{ delimiter: ";" }`, `{ format: "text" }`. |
| `prism.dataFiles(folder?)` | Promise of `[{ path, name, folder, ext, size, mtime }]` – the data files the block may read. |
| `prism.onDataChange(cb)` | Called with the path when a data file this block read changes; re-read inside. |
| `prism.parseCsv(text, opts?)` | The same CSV parser for inline CSV text. |
| `prism.http(url, { method?, headers?, query?, body? })` | Only with Online access → API requests. Promise of `{ url, status, ok, headers, text, json() }` (non-2xx statuses resolve, check `ok`). `body`: string, or object/array sent as JSON. `prism.http.json(url, opts?)` returns the parsed JSON and rejects on non-2xx. Show a loading state and the error message in the block; cache with `prism.state` if the data changes rarely. |
| `prism.perf.watch(cb)` | Calls `cb(snapshot)` every second while the block is visible; returns an unsubscribe function. `snapshot` = `{ time, page: { cpu, memory, blocks }, blocks: [{ key, label, kind: "block"|"web"|"monitor", line, state, cpu, memory, nodes, startupMs, exact }], obsidian: { window, gpu, app, heapBytes } }` – `cpu` in % of one core (divide by `navigator.hardwareConcurrency` for % of the machine), `memory` in bytes, `window`/`gpu`/`app` = `{ cpu, memory }` or `null` (mobile). Build custom monitors with it; for the standard view use ```viz monitor`. |
| `prism.monitor(target)` | The ```viz monitor` view (RAM in MB, CPU in % of all cores) inside an HTML block. Returns a stop function. |
| `prism.online` | `{ http, confirm, web }` – what the user allowed under Online access. `confirm`: requests wait for the reader's click on "Run requests" (and are never sent in command-line renders). |
| `prism.openNote(path, newTab?)` | Opens a note (path or link text). |
| `prism.state.get(key, fallback?)` | Synchronous read of persisted per-block state. |
| `prism.state.set(key, value)` | Persists a JSON value (Promise). `delete(key)`, `keys()`, `all()`, `onChange(cb)`. Max 512 KB per block. |
| `prism.state.bind(input, key, fallback?, onValue?)` | Two-way binds a form control (element or selector; text, number, range, select, checkbox) to a state key: restores the value, saves on input, calls `onValue(value)` initially and on every change. Returns an unbind function. |
| `prism.shared` | Same API as `prism.state` (`get`, `set`, `delete`, `keys`, `all`, `onChange((all, key) => …)`, `bind`), but shared by all blocks of the same note and persisted. One block holds the controls, other blocks react – e.g. a slider block and a chart block. `set` also runs the listeners of the setting block. |
| `prism.resize()` | Re-measure the height now (normally automatic). |
| `prism.toast(msg)` | Shows an Obsidian notice. |
| `prism.canvas(target)` | Crisp 2D canvas that follows its element's size: `{ canvas, ctx, width, height, dpr, onResize(cb), clear() }`. `target` is a canvas or a container with a height (e.g. `.stage`); draw in CSS pixels. |
| `prism.animate(frame, { autoplay?, maxDt? })` | Calls `frame(dt, t)` every display frame with real elapsed seconds (clamped, `dt = 0` on the first call). Pauses off screen and in background tabs, starts paused under reduced motion. Returns `{ play, pause, toggle, playing, time, reset, redraw, onChange(cb) }`. |
| `prism.segmented(target, options, { key?, shared?, value?, onChange?, label? })` | Renders a segmented control (pill group) into `target` for 2–6 exclusive options (strings or `{ value, label }`); with `key` the choice persists in `prism.state` (or `prism.shared`). `onChange(value)` runs at once and on every change. Returns `{ value, set(v), el }`. |
| `prism.variants(target, [{ label, render(el) }], { key? })` | Alternative views of the same content (e.g. bar / line / table) with a switcher; `render` may return a cleanup function (or a Promise of one). The choice persists. |
| `prism.reducedMotion` | True when the reader asked the system to reduce motion. |
| `prism.displayMode`, `prism.onDisplayMode(cb)` | `"inline"` or `"fullscreen"` (the block's fullscreen button); `html` has class `is-fullscreen` there. Show more detail in fullscreen. |
| `prism.section`, `prism.onSection(cb)` | Scrollytelling: the heading of the note the reader is at (`{ index, heading, level, line }` or `null`), updated while scrolling. Put the block above short sections whose headings drive it. `null` in command-line renders. |
| `prism.hoverNote(path, target)`, `prism.hoverEnd()` | Shows Obsidian's page preview of a note next to an element, rectangle or mouse event (for canvas/SVG hit areas). Links (`<a href="Note">`) and Mermaid `[[links]]` get it automatically. |

## Live data from web APIs (Online access)

Use this when the user asks for live or current data from a web service (weather, prices, GitHub, a company API, status pages). Prefer `prism.data` when the data already exists as a file in the vault.

**Choose the tool:** `prism.http` to fetch data and visualize it with Prism (charts, KPIs, tables); ```viz web` to show an existing website or web app as it is; `<iframe>` inside an HTML block for embeddable widgets (maps, videos, embed URLs) next to your own controls.

**Rules for API blocks:**
- The block must render something useful in every state: `prism.online.http` false → one line saying that Online access → API requests is off (do not ask the user to enable it; it is their decision); `prism.online.confirm` true → "Click Run requests below this block" until the data arrives; loading; error (show `err.message`); data. Never leave an empty area.
- Cache the last response with its time in `prism.state` and show it immediately on load; only fetch again when it is older than a sensible age or the reader clicks a refresh button. This keeps quotas low and makes the block useful without a click.
- Never call `prism.http` in loops, animation frames or on every input event; debounce inputs (≥ 500 ms) and request only what is shown.
- Parameters (city, repository, ids, date range) belong in the note's frontmatter (`(await prism.note()).frontmatter`) or in a control bound with `prism.state.bind` / `prism.shared.bind` – not hard-coded in several places.
- Use public endpoints without keys where possible. Never write API keys, tokens or passwords into a block on your own; if an API needs one, tell the user it would be stored in plain text in the note and let them decide.
- Name the source (host and time of the data) in a `.caption` under the visual.
- Command-line renders: with `prism.online.confirm` (default) no request is sent, so the snapshot shows the waiting (or cached) state. That is expected, not an error – check that this state looks right, then tell the user to click "Run requests" in Obsidian.

````
```viz id=weather title="Wetter jetzt"
<div class="toolbar"><span class="label" id="place"></span><button class="chip" id="refresh">Aktualisieren</button></div>
<div class="grid" id="out"></div>
<p class="caption" id="msg"></p>
<script>
const out = document.getElementById("out"), msg = document.getElementById("msg");
const MAX_AGE = 15 * 60 * 1000;
function show(entry) {
  const c = entry.data.current;
  out.innerHTML = "";
  for (const [label, value] of [["Temperatur", prism.format(c.temperature_2m, "number", 1) + " °C"], ["Wind", prism.format(c.wind_speed_10m, "number", 0) + " km/h"]]) {
    const card = out.appendChild(document.createElement("div"));
    card.className = "card";
    card.innerHTML = '<div class="label"></div><div class="kpi"></div>';
    card.children[0].textContent = label;
    card.children[1].textContent = value;
  }
  msg.textContent = "Quelle: api.open-meteo.com · Stand " + new Date(entry.at).toLocaleTimeString(prism.locale);
}
async function load(force) {
  const fm = (await prism.note()).frontmatter;
  const lat = fm.lat ?? 49.41, lon = fm.lon ?? 8.69;
  document.getElementById("place").textContent = fm.ort ?? "Heidelberg";
  const cached = prism.state.get("cache");
  if (cached) show(cached);
  if (cached && !force && Date.now() - cached.at < MAX_AGE) return;
  if (!prism.online.http) { if (!cached) msg.textContent = "Live-Daten sind aus (Einstellungen → Prism → Online access → API requests)."; return; }
  if (!cached) msg.textContent = prism.online.confirm ? "Klicke unter dem Block auf „Run requests“, um die Daten zu laden." : "Lade …";
  try {
    const data = await prism.http.json("https://api.open-meteo.com/v1/forecast", { query: { latitude: lat, longitude: lon, current: "temperature_2m,wind_speed_10m" } });
    const entry = { at: Date.now(), data };
    await prism.state.set("cache", entry);
    show(entry);
  } catch (err) {
    msg.textContent = "Fehler: " + err.message;
  }
}
document.getElementById("refresh").onclick = () => load(true);
load(false);
</script>
```
````

**Web page blocks:** ```viz web height=600` with the URL as body (add `theme: dark` only if asked). Put one sentence above it saying what the page is. When Online access → Web pages is off the block explains that itself. Command-line renders show a placeholder card.

## Theme and design rules

- Never hard-code colors. Use Obsidian variables, all available on `:root`: `--background-primary`, `--background-secondary`, `--background-modifier-border`, `--text-normal`, `--text-muted`, `--text-faint`, `--text-accent`, `--interactive-accent`, `--text-on-accent`, `--text-error`, `--text-success`, `--text-warning`, `--color-red|orange|yellow|green|cyan|blue|purple|pink`, `--font-text`, `--font-monospace`, `--radius-m` and more. `html` has class `theme-dark` / `theme-light`.
- The page background is transparent so the block blends into the note. Keep it that way; use `.card` for surfaces. Exception: scenes such as simulations or particle animations may sit on a dark, rounded "stage" element that stays dark in both themes, with its own light colors.
- Canvas animations: use `prism.canvas` and `prism.animate`; they handle `devicePixelRatio`, resizing, real elapsed time, pausing off screen and reduced motion. Redraw on `scene.onResize` with `loop.redraw()`.
- Default stylesheet styles headings, tables, buttons, inputs, code. Helper classes: `.card`, `.grid` (responsive auto-fit columns), `.row` (wrapping flex), `.stack`, `.kpi` (big number), `.label`, `.muted`, `.faint`, `.badge`, `.accent`, `.error`, `.success`, `.warning`. `button.primary` is the accent button.
- Building blocks for interactive scenes (use them instead of writing the CSS yourself): `.toolbar` (row of controls above the visual), `.segmented` (made by `prism.segmented`), `button.chip` with `aria-pressed` (toggle), `button.icon-button` with an inline `<svg viewBox="0 0 16 16">` (play, pause, reset), `.stage` (dark rounded scene surface, about 240–360 px high, taller in fullscreen), `.hud` inside a stage (monospace values in its bottom corners, `<b>` for values), `.caption` (muted line below the visual).
- Width is the note column (often 600–900 px; mobile ~360 px). Use relative widths, `viewBox` for SVG (`width:100%;height:auto`), wrap text.
- Auto-height measures `body`. Never use `100vh`, `height:100%` on `html/body` or `position:fixed` layouts; give charts an explicit container height, e.g. `<div style="height:260px"><canvas></canvas></div>` with Chart.js `maintainAspectRatio:false`. Use `height=N` for canvas/WebGL scenes.
- SVG presentation attributes do not resolve `var()` reliably; style SVG through a `<style>` block (`.node rect { fill: var(--background-secondary) }`).
- Chart.js: datasets without colors get the theme palette and charts update on theme change. Mermaid: `.mermaid` elements render with theme colors. D3: use `prism.palette` for ordinal scales.
- Keep blocks self-contained and small. Load data with `prism.notes()` / `prism.data()` instead of hard-coding vault data; cite the data file in the note text.

## Render check from the command line (use after every edit)

```bash
node .obsidian/plugins/prism-viz/scripts/prism-render.mjs "Folder/Note.md"
```

Renders all `viz` blocks of the note in the running Obsidian app (the note does not need to be open) and prints JSON: `{ status, blocks: [{ block, lines, status, errors: [{ kind, line, message }], height, snapshot, snapshotFile }] }`. `status` is `ok`, `warning`, `error` or `failed`; exit code 0 = ok/warning, 1 = block errors, 2 = render failed, 3 = Obsidian not reachable. `snapshotFile` is an absolute path to a PNG of the block – open it to check the visual result. Options: `--no-snapshot`, `--width 720`, `--timeout 60`. Equivalent URI: `obsidian://prism?vault=<name>&render=<path>&id=<id>`, result in `.prism/renders/<id>.json` and `.prism/renders/latest.json`.

Workflow: write the block → run the command → fix every error at the reported note line → look at the snapshot → repeat until `status` is `ok`.

More: `--all [folder]` renders every note with viz blocks and prints a summary (`{ notes, ok, results: [{ note, status, blocks, problems }] }`; add `--snapshot` for PNGs).
Markdown tables in notes (for `prism.note()`, `source: ^id`): numbers may be written the German way (`1.500,50`, `0,385`), with units (`1.500 €`, `12 %` – the table then formats the column as currency/percent) and `–` for "no value".

## Errors and self-check

- Errors in blocks (`window.onerror`, unhandled rejections, `console.error`, CSP violations, Mermaid parse errors, timeouts) appear as a badge on the block and are written to `.prism/errors.json` in the vault root:
  - `blocks["<note path>#<index>"]` → `{ status: "ok"|"error"|"warning"|"rendering"|"interrupted", renderedAt, errors, warnings, lines: { start, end }, snapshot? }`. `interrupted` means the block was unloaded before it finished loading – that is not a verdict; render the note with the command below.
  - `errors[]` → `{ block, notePath, lines, line, blockLine, kind, message, origin, time }`, newest first. `line` is the 1-based line in the note; `origin` is `"block"` for your code, `"lib:<name>"` for a bundled library.
- Index = 0-based position of the `viz` block in the note; with `id=name` the key is `<note path>#<name>`. HTML files use `file:<path>`.
- A block's entries are refreshed every time it renders: when it is visible in Obsidian or via the render command above. Prefer the render command; when reading `errors.json` directly, check that `renderedAt` is newer than your edit.
- Snapshots (optional setting): a PNG of each successfully rendered block at `.prism/snapshots/<hash>.png`; the path is in `blocks[…].snapshot` and `.prism/snapshots/index.json`.

