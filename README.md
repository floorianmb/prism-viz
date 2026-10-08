# Prism (`prism-viz`)

Sandboxed, theme-aware, interactive visualizations inside Obsidian notes – designed to be written by AI agents (Claude Code, Codex) and to give them feedback when something breaks.

````markdown
```viz chart height=320 title="Notes by type"
<div style="height:280px"><canvas id="c"></canvas></div>
<script>
prism.notes().then(notes => {
  const counts = {};
  for (const n of notes) counts[n.frontmatter.type ?? "(none)"] = (counts[n.frontmatter.type ?? "(none)"] || 0) + 1;
  new Chart(c, { type: "bar", data: { labels: Object.keys(counts), datasets: [{ data: Object.values(counts) }] },
                 options: { maintainAspectRatio: false, plugins: { legend: { display: false } } } });
});
</script>
```
````

## Features

- **`viz` code blocks** (Live Preview and Reading view): HTML fragment or full document, rendered in an iframe via `srcdoc`.
  Info line: library keywords `chart`, `d3`, `mermaid`, `three`, plus `height=N`, `title="…"`, `id=name`, `raw`, `eager`, `notoolbar`, `source`. Libraries are bundled in `libs/` and inlined, so everything works offline.
- **No-code blocks**: a ```` ```viz chart ```` block may contain a YAML spec instead of HTML (`type`, `source: ^table-id | table:<heading> | file.csv`, `x`, `y`, `series`, `filter`, `sort`, `stacked` …); ```` ```viz table ```` renders a searchable, sortable table with locale number formats, source links and confidence badges; ```` ```viz math ```` renders LaTeX with KaTeX (offline, fonts inlined, mhchem); plain Mermaid supports `A["[[Note]]"]` labels that open the note on click.
- **Notes as data**: `prism.note()` returns the block's own note – frontmatter, headings, links, backlinks, tasks and typed Markdown tables (German number formats, units, `–` as empty) – and `prism.onNoteChange` follows edits. `prism.notes({ include: ["links", "backlinks", "headings", "tasks"] })` adds those per note; tasks carry Tasks-plugin dates and priorities.
- **Explorable explanations**: `prism.shared` is state shared by all blocks of a note, `prism.state.bind` / `prism.shared.bind` two-way bind form controls.
- **Bases**: a "Prism chart" view for `.base` files (Obsidian 1.10+): group by a property, count or aggregate a value, split into series, stacked, sorted.
- **PDF export**: in Obsidian's PDF export each block is rendered in the light theme and replaced by a static PNG, so PDFs show the visualizations.
- **HTML files**: `![[file.html]]` embeds use the same renderer; `.html` files open in a Prism view. Options via `<meta name="prism" content="chart height=400">`, `<!-- prism: … -->` or `![[file.html|height=400]]`.
- **Security**: `sandbox="allow-scripts"` (no same-origin, top navigation, popups, forms, modals), CSP `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:;` plus `base-uri`/`form-action 'none'`. Network is off unless domains are allowlisted. Messages are accepted only from the block's own `contentWindow` with a per-render token; navigation away from the srcdoc is detected and reverted.
- **Theme bridge**: Obsidian's CSS variables (normalized colors, fonts, sizes, palette) on `:root` inside the frame, updated live on theme and light/dark changes (no reload). Default stylesheet and helper classes (`.card`, `.grid`, `.row`, `.kpi`, …); opt out with `raw`. Chart.js and Mermaid follow the theme automatically.
- **Auto-height** via `ResizeObserver`, cached per block so re-renders do not jump; loop guard for `100vh` content.
- **`window.prism`**: `theme`, `onTheme`, `palette`, `color`, `notes({folder, tag, limit, sort, order})` (read-only path/title/tags/frontmatter/mtime), `onNotesChange`, `openNote`, `state.get/set/delete` (persisted in the plugin data), `resize`, `toast`. `localStorage` is shimmed onto `prism.state`.
- **Data files**: `prism.data("folder/file.csv")` reads CSV/TSV (row objects, column-wise typed, `rows.columns`), JSON/GeoJSON, YAML and TXT – read-only and only from the folders listed under *Data folders* in the settings (empty = off; notes and hidden files are never readable). `prism.dataFiles(folder?)` lists them, `prism.onDataChange(cb)` fires when a file that was read changes, `prism.parseCsv(text)` parses inline CSV.
- **Render on demand for agents**: `obsidian://prism?render=<note path>[&id=…&snapshot=0&width=720&timeout=60]` renders every viz block of a note (or an HTML file) invisibly in the running app, without opening it, and writes `.prism/renders/<id>.json` and `latest.json` (status, errors with note lines, snapshot paths). The CLI wraps it:

  ```bash
  node .obsidian/plugins/prism-viz/scripts/prism-render.mjs "Folder/Note.md" [--no-snapshot] [--width 720] [--timeout 60]
  ```

  It prints the result JSON (with absolute `snapshotFile` paths) and exits with 0 = ok/warning, 1 = block errors, 2 = render failed, 3 = Obsidian not reachable. On macOS Obsidian stays in the background (`open -g`).
- **Agent skill** (`skill/`): `SKILL.md` with the plan → write → render → fix workflow, design checklist and error table, plus `reference.md` generated from the same source as `PRISM.md`. Install or update it for Codex and Claude Code with `npm run install-skill` (copies to `~/.codex/skills/prism`, `~/.claude-sso/skills/prism`, `~/.claude/skills/prism` where those folders exist).
- **Hover toolbar**: source, reload, fullscreen, PNG export, and a menu with copy as PNG (clipboard), SVG export, save as `.html`, copy source / errors.
- **Agent feedback**: `window.onerror`, unhandled rejections, `console.error`, CSP violations, Mermaid errors and timeouts appear as a badge and are written to `<vault>/.prism/errors.json` with note path and note line numbers. Optional PNG snapshots in `.prism/snapshots/`.
- **Robustness**: lazy rendering (`IntersectionObserver`), loops in user scripts are instrumented and stopped after 2 s of blocking (srcdoc frames share Obsidian's main thread), ready/heartbeat watchdog with a Stop button, crash guard that does not auto-run a block that froze Obsidian before, full cleanup on unload.
- **Commands**: *Insert starter* (dashboard, architecture diagram, timeline, chart from frontmatter, chart from a table, formula, blank), *Insert chart for the table under the cursor* (adds a `^id` if needed and a no-code chart block), *Generate agent rules* (writes `PRISM.md` with a snippet for `CLAUDE.md`/`AGENTS.md`), *Reload all blocks*, *Clear error log*.
- **CLI extras**: `prism-render.mjs --all [folder]` renders every note with viz blocks and prints a summary; `--reload` reloads Prism after a rebuild (`obsidian://prism?reload`), alone or before a render. `.prism/errors.json` marks blocks unloaded before they finished as `interrupted`; entries of deleted notes are removed, and so is their block state.

## Settings

Default height, maximum auto height, theme sync, lazy rendering, error log, snapshots, data folders, network allowlist.

## Build

```bash
npm install
npm run build   # tsc + libs (Chart.js, D3, Mermaid, three.js, KaTeX, html-to-image → libs/) + main.js
npm run dev     # watch mode
```

Runtime files: `manifest.json`, `main.js`, `styles.css`, `libs/`. `node_modules/` is only needed for building.

## Layout

```
main.ts               plugin: code block processor, commands, notes query, exports, snapshots
src/frame.ts          one rendered block: iframe lifecycle, message bridge, toolbar, errors, watchdogs
src/document.ts       srcdoc builder (CSP, theme, base CSS, libraries) and line map
src/runtime/prelude.ts  iframe runtime (window.prism), bundled to a string at build time
src/runtime/chartSpec.ts  declarative chart spec → Chart.js config
src/runtime/table.ts  interactive table for ```viz table / prism.table
src/noteInfo.ts       note tables, headings and tasks for prism.note() / prism.notes({ include })
src/basesView.ts      "Prism chart" view for Obsidian Bases
src/loopGuard.ts      infinite-loop instrumentation (acorn)
src/theme.ts          Obsidian theme → CSS variables
src/errorLog.ts       .prism/errors.json
src/htmlFile.ts       .html view and embeds
src/data.ts           data file path resolution and allowlist
scripts/prism-render.mjs  CLI for agents (render a note, print JSON)
scripts/build-skill.mjs   skill/reference.md from src/agentRules.ts (part of npm run build)
scripts/install-skill.mjs installs skill/ for Codex and Claude Code
src/options.ts, libs.ts, stores.ts, settings.ts, templates.ts, agentRules.ts, util.ts
```

## Limits

- `errors.json` reflects the last render: when a block was visible in Obsidian or rendered via `obsidian://prism?render=…`. The render command needs the desktop app running (it is launched by `open` if it is not).
- `![[file.html]]` embeds use Obsidian's internal embed registry; if it is unavailable, embeds fall back to Reading view only.
- PNG export/snapshots use html-to-image; WebGL canvases need `preserveDrawingBuffer: true`. Export needs the block to be visible.

Third-party licenses: `libs/THIRD_PARTY_LICENSES.txt`.
