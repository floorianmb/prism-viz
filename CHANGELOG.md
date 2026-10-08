# Changelog

## 0.4.0 – 2026-10-08

### New
- **Page monitor**: ` ```viz monitor ` shows RAM in MB and CPU in % of the whole machine for the page it is on (the blocks in the same tab), updated every second while visible. Prism blocks are measured from inside: main-thread script time of their callbacks (animation frames, timers, events, observers, including code after awaits) and canvas/WebGL/image buffers. ` ```viz web ` blocks and Obsidian's processes are measured exactly through Electron's process metrics (desktop). `prism.perf.watch(cb)` gives per-block figures and Obsidian's process figures to custom blocks; `prism.monitor(target)` renders the standard view. Measurement code: `src/perf/`, `src/runtime/perf.ts`, `src/runtime/monitor.ts`.
- **Online access** (Settings → Prism → Online access, both off by default, each asks for consent with a list of consequences):
  - **API requests**: `prism.http(url, { method, headers, query, body })` and `prism.http.json(url)` send requests through Obsidian's `requestUrl` (no CORS, desktop and mobile). Per block: 60 requests per minute, 4 at a time, 30 s timeout, 10 MB responses. By default requests wait until the reader clicks **Run requests** below the block (once per render; never sent in command-line renders); *Ask before sending requests* turns this off after a consent dialog. `prism.online` (`{ http, confirm, web }`) lets blocks show the right state.
  - **Web pages**: `<iframe src="https://…">` inside blocks (CSP `frame-src`), and ` ```viz web ` blocks that show a website inline with back/forward/reload – desktop in an Electron `webview` (separate in-memory session), mobile in an iframe. Command-line renders and PDF export show a placeholder card. Web pages are shown in light mode like in a normal browser (Obsidian's dark mode is not passed on; `theme: dark` in a web block or `color-scheme:dark` on an iframe opts in).
  - Agent reference (PRISM.md, skill): "Live data from web APIs" section with states, caching, parameters and a complete example block.
  - All network code lives in `src/online/` and `src/runtime/online.ts`.

### Changed
- **Libraries are bundled into `main.js`**: Chart.js, D3, Mermaid, three.js, KaTeX and html-to-image no longer need a `libs/` folder next to the plugin, so the release is just `main.js`, `manifest.json` and `styles.css`.
- **License**: MIT (`LICENSE`); third-party notices in `THIRD_PARTY_LICENSES.txt`.

### Removed
- **Self-reload**: `obsidian://prism?reload` and `prism-render.mjs --reload` are gone. They used an undocumented Obsidian API. Reload Prism with Obsidian's plugin toggle instead.
- **`.prism/plugin.json`**: was only read by `--reload`, so it is no longer written.

### Internal
- Runtime code is typed without `any`: minimal interfaces for Chart.js, Mermaid, html-to-image and KaTeX as used by Prism.

## 0.3.0 – 2026-10-08

### New
- **Building blocks**: `prism.canvas(target)` (crisp 2D canvas following its element's size), `prism.animate(frame)` (real elapsed time, pauses off screen and in background tabs, starts paused under reduced motion; `play`/`pause`/`toggle`/`reset`/`redraw`/`onChange`), `prism.segmented(target, options, { key })` (persisted segmented control), `prism.reducedMotion`; CSS classes `.toolbar`, `.segmented`, `.chip`, `.icon-button`, `.stage`, `.hud`, `.caption`.
- **Variants**: `prism.variants(target, [{ label, render }])` shows alternative views of the same content with a persisted switcher.
- **Scrollytelling**: `prism.section` / `prism.onSection(cb)` report the heading the reader is at while scrolling (Reading view and Live Preview).
- **Page previews**: note links and Mermaid `[[links]]` in blocks show Obsidian's hover preview; `prism.hoverNote(path, target)` / `prism.hoverEnd()` for custom hit areas.
- **Fullscreen awareness**: `prism.displayMode`, `prism.onDisplayMode(cb)`, class `is-fullscreen` on `html`; `.stage` grows in fullscreen.
- **Record video**: block menu → *Record video (5 s)* saves the block's main canvas as WebM next to the note and copies the embed link.
- **Copy prompt for agent**: block menu and error panel copy a ready-to-paste prompt (location, problems, source, render command).
- **Gallery view**: *Open gallery* command and ribbon icon; cards with snapshot, status and a *Problems* filter; *Render previews* renders all notes with viz blocks.
- Agent skill: `design.md` (composition, color, controls, motion, polish pass) next to `SKILL.md` and `reference.md`.

### Fixed
- Headless renders while Obsidian is in the background: Chromium stopped rendering the window, so block frames laid out at 0×0 (empty snapshots), animation frames never ran (blank Chart.js charts, Mermaid "svg element not in render tree") and image decoding never finished (snapshots waited 30 s per block). Renders now keep the window rendering for their duration, headless frames fall back to timer-driven animation frames, exports no longer wait for decoding, snapshots time out after 10 s, and empty images are never stored.
- `skill/reference.md` and `PRISM.md` were garbled: `$` sequences in the KaTeX description were expanded as replacement patterns, dropping the library list.
- `prism.chart` / `prism.table` stop following note and data changes once their element is removed (e.g. another variant is shown).

## 0.2.0 – 2026-10-06

### New
- **Declarative charts**: a ```` ```viz chart ```` block may contain a YAML/JSON spec instead of HTML (`type`, `source: ^table-id | table:<heading> | file.csv`, `rows`, `x`, `y`, `series`, `filter`, `sort`, `limit`, `stacked`, `title`, `height`, `options`). Also `prism.chart(target, spec)` in HTML blocks. Redraws when the note table or data file changes; unknown keys and missing columns are reported as warnings.
- **Interactive tables**: ```` ```viz table ```` (and `prism.table`) with search, click-to-sort, locale number/currency/percent/date formats, source links, confidence badges, paging; sort and search persist.
- **LaTeX**: `katex` library (aliases `math`, `latex`, `tex`), offline with inlined fonts, auto-render of `$…$` / `$$…$$` / `\(…\)` / `\[…\]`, mhchem. ```` ```viz math ```` with plain LaTeX renders a display formula. `prism.math(target)` for dynamic content.
- **`prism.note()`**: the block's own note – frontmatter, tags, headings, links, backlinks, tasks and typed Markdown tables (`note.table("^id" | heading | index)`); `prism.onNoteChange`.
- **`prism.notes({ include })`**: optional `links`, `backlinks`, `headings`, `tasks` (Tasks-plugin dates 📅 ⏳ 🛫 ✅ and priorities parsed).
- **`prism.shared`**: state shared by all blocks of a note; `prism.state.bind` / `prism.shared.bind` for two-way binding of form controls.
- **Mermaid note links**: `A["[[Note]]"]` / `A["[[Note|Text]]"]` labels open the note on click.
- **Bases view "Prism chart"** for `.base` files (Obsidian 1.10+): group by, count/sum/avg/min/max, series, stacked, sort, limit, height.
- **PDF export**: blocks render in the export window's light theme and are replaced by a static PNG.
- **Commands / UI**: "Insert chart for the table under the cursor"; starters "Chart from a table in this note" and "Formula (LaTeX)"; "Copy as PNG" in the block menu; one-click "Allow folder" notice when a block reads outside the data folders.
- **`prism.format(value, kind, digits)`** and `prism.locale` (Obsidian's UI language).
- **CLI**: `prism-render.mjs --all [folder]` (vault-wide check with summary; notes with only quoted examples are skipped), `--reload` (reloads Prism via `obsidian://prism?reload`, waits for `.prism/plugin.json`).
- Markdown table typing: German number formats (`1.500,50`, `0,385`), units (`€`, `%`, `$`), `–` as empty.

### Fixed
- Mermaid labels lost their last characters in PNG/SVG exports and snapshots (no slack in label boxes; Prism's `.label` helper class leaked into Mermaid labels).
- `.prism/errors.json` kept blocks in `"rendering"` forever after Live Preview re-attached a section or a block was unloaded early. New status `interrupted`; renders are owned by the frame that started them; stale entries are converted on load.
- Block state and error-log entries of deleted notes are removed (also pruned on startup).
- Currency columns keep cents when the data has them.

### Docs
- Agent reference (`PRISM.md` / `skill/reference.md`) and `skill/SKILL.md` cover all new APIs; guidance to avoid `eager`.

## 0.1.0

- Initial version: sandboxed ```` ```viz ```` blocks, theme bridge, Chart.js / D3 / Mermaid / three.js, `prism.notes`, `prism.data`, `prism.state`, HTML file embeds, error log, snapshots, headless render CLI, agent skill.
