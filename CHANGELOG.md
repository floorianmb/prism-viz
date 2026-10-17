# Changelog

## 0.7.0 – 2026-10-18

### New
- **Calendar heatmaps** (`type: calendar`): one cell per day, a row per weekday and a strip per year, like a contribution graph. Good for daily notes, habits and tasks done.
  - `x` is the date column (values starting with `YYYY-MM-DD`). With `source: notes` the default is the note title, so daily notes named by date need no `x`.
  - The value is the number of rows per day, or the sum of `y` (`aggregate: avg | min | max` to change it). `true`/`false` count as 1 and 0.
  - With `source: notes` or `source: tasks`, a click on a day opens its note and hovering shows the page preview.
  - Calendars and maps look the same in PNG/SVG exports, snapshots, baked images and the PDF export, and follow theme changes.
  - Details: [`docs/calendar-and-map.md`](https://github.com/floorianmb/prism-viz/blob/main/docs/calendar-and-map.md).
- **Maps** (`type: map`): colors the regions of a GeoJSON file from your data folders (`geo: data/europe.geojson`) by value.
  - Prism finds the feature property that matches the `x` values (names or codes) by itself; `geoKey` picks one.
  - Values without a region are listed in a warning.
  - Prism ships no map data. The example vault has the countries of Europe from Natural Earth (public domain).
- **Charts and tables from tasks** (`source: tasks`): one row per task of your notes, narrowed with `folder` and `tag`. Columns: `text`, `done`, `status`, `due`, `scheduled`, `start`, `doneDate`, `priority`, `tags`, and `note`, `path`, `folder`, `line` for the note it is in. Open tasks per project or tasks done per day take a few lines of YAML now. Details: [`docs/frontmatter-charts.md`](https://github.com/floorianmb/prism-viz/blob/main/docs/frontmatter-charts.md).
- **Cross-filter without code**: with `select: genre` on a chart, a click on a bar, pie segment, day or region sets `prism.shared.genre`. A second click clears it, and the other labels fade while something is selected. `filter: { genre: $shared.genre }` in any chart or table of the same note then shows only the matching rows; while nothing is selected, all rows show. Charts with `select` can also be used with the keyboard. Details: [`docs/cross-filter.md`](https://github.com/floorianmb/prism-viz/blob/main/docs/cross-filter.md).
- **Export CSV** in the block menu of charts and tables written as YAML: saves the numbers the block shows (after filter, search and sort) next to the note.
  - In German and other languages with a decimal comma, the file uses `;` and `1,5`, so Excel opens it correctly.
  - Cells that a spreadsheet would run as a formula are marked as text.
- **The render command shows what changed**: when a block had a snapshot before (same theme), its result has `change`: how many pixels of the snapshot differ in percent, plus the size before and after. An agent can see that a layout broke even when no error was reported. `--all --snapshot` lists the changed blocks per note, which is useful after a Prism update.
- Example notes 18 (calendar and tasks), 19 (cross-filter), 20 (map) and 21 (all new features in one note).

### Fixed
- **`filter` in ` ```viz table ` matches list values** such as `tags` by containment, like charts always did: `filter: { tags: project }` keeps the notes whose tags include `project`. Before, such a table stayed empty.

### Compatibility
Existing blocks render as before. The new keys (`select`, `geo`, `geoKey`) and sources (`tasks`) were unknown before, so no existing spec uses them. Filter values written as `$shared.<key>` are the only new meaning of an existing key. The warning for `folder`/`tag` now also accepts `source: tasks`.

### Agent skill
- The skill and the reference describe `source: tasks`, `type: calendar`, `type: map`, cross-filters, CSV export and `change` in render results, with patterns and new rows in the error table. Run *Prism: Install agent skill* again to update it.

### Internal
- Unit tests for task rows, shared filters, calendar days, GeoJSON regions, CSV export and the snapshot comparison (121 tests).
- Checked in Obsidian 1.14 with the example vault: every note renders without errors, and the snapshot comparison reports 0 % for unchanged blocks.

## 0.6.5 – 2026-10-17

### Security
- **Blocks can no longer get around the network block.** In a block written as a whole HTML page (`<!doctype html>…`) or in an `.html` file, some markup in front of `<head>` (or a `<head>` inside a comment) made the browser ignore Prism's Content-Security-Policy, so the block could load from and send to any server. Prism now puts the policy in front of everything the block contains. Blocks and files that load nothing from the network, or only from hosts in the network allowlist, work as before. If a block loaded scripts, images or fonts from elsewhere without being allowlisted, it now shows a CSP error like any other block: add the host under *Settings → Prism → Network allowlist*.
- **Exports only accept images.** The image a block hands over for the PDF export, *Export PNG/SVG*, *Copy as PNG* and recordings is now checked before Obsidian uses it. An empty export shows an error instead of saving an empty file, and the PDF keeps the live block instead of a broken image.

### Fixed
- **`prism.edit.addRow` keeps a table's block id** when the id ends the table's last row (`| Mon | 1 | ^habits`). The id used to stay on that row, so the table lost its id: the next `addRow`, `note.table("^habits")` and charts with `source: ^habits` failed. The id now moves to the new last row. Tables with the id on its own line (as the docs recommend) are changed exactly as before.
- **Toggling a task with a custom status** (`setTask(task)` without `done`) on `[/]`, `[-]` and similar now checks it off (`[x]`), matching `prism.note()`, which reports these tasks as not done. It used to uncheck them (`[ ]`). `[x]`, `[ ]` and calls with `done: true/false` behave as before.
- **`modified` in `source: notes` is the local date.** It was the UTC date, so notes edited around midnight counted for the wrong day. Charts grouped by `modified` can move such notes to their correct day. The example notes for tasks and the habit tracker use the local date for "today" too.
- **Faster series charts**: charts with `series:` over many rows (e.g. `source: notes` in a large vault) no longer freeze for seconds. The output is unchanged.

### Agent skill
- The install command in *Prism: Install agent skill* now installs the skill for your Prism version instead of the newest development state.
- From this version on, the skill checks whether it matches the installed Prism and tells you when it is outdated. **Skills installed before 0.6.5 cannot check this yet; update yours once.** Run *Prism: Install agent skill* in Obsidian and copy the command shown there (your vault path is filled in), or run this in a terminal (Node.js and git needed):
  ```bash
  d="$(mktemp -d)" && (git clone --depth 1 --branch 0.6.5 https://github.com/floorianmb/prism-viz.git "$d" 2>/dev/null || (rm -rf "$d" && git clone --depth 1 https://github.com/floorianmb/prism-viz.git "$d")) && node "$d/scripts/install-skill.mjs" --vault '<path to your vault>' && rm -rf "$d"
  ```
  Then restart your agent.
- The skill describes the toggle rule of `setTask`, the local date of `modified`, and how to compute "today" in a block.

### Internal
- Unit tests (`npm test`) for the block document, note edits, table lookup, charts, data paths and widget state; they run in CI and before every release. CI also checks that `skill/reference.md` was regenerated.
- One table lookup for `prism.note().table()` and `prism.edit`, so a block always writes the table it reads.

## 0.6.4 – 2026-10-16

### New
- **Link preview delay**: the page preview of a note link inside a block now waits until the pointer has rested on the link for a moment (default 0.6 s), so moving the mouse across a block no longer pops up previews. Set the time with the slider in *Settings → Prism → Link preview delay* (0 to 2 s; 0 opens at once). Moving away before the time is up opens nothing. This applies to links, Mermaid nodes with `[[links]]` and `prism.hoverNote`.

### Fixed
- **Embedded HTML files show up again**: `![[file.html]]` stayed empty. The embed failed with "this._loaded is not a function", because Obsidian keeps a property of the same name on every component and it hid Prism's method. Also, Obsidian 1.14 claims `.html` embeds itself and shows them without scripts (also empty); Prism now takes the extension over and hands it back when it is turned off.
- **No more jumping height while a block loads**: a block whose content arrives a little later (for example after `prism.note()` or `prism.notes()`) used to shrink to a few pixels and then grow again each time the note opened. A block that has been shown before now keeps its last height for a moment and only grows; if it really ends up smaller, it shrinks once its content is there.

## 0.6.3 – 2026-10-15

### Fixed
- **Blocks are see-through again**: rounded corners, gaps between cards and every other transparent area of a block showed a dark rectangle in dark mode. The block's document declares the theme's `color-scheme`, the frame element did not, and Chromium paints an opaque background behind frames whose color scheme differs from their content's. The frame now uses the same scheme as its block.

## 0.6.2 – 2026-10-11

### Fixed
- **Blocks in pop-out windows get answers again** ([#7](https://github.com/floorianmb/prism-viz/issues/7)). `prism.notes()`, `prism.note()`, `prism.data()`, `prism.state` and the other requests failed after 20 s with "no response from Obsidian" when the note was open in a pop-out window, and blocks did not follow theme or state changes there. This also works for a tab moved to a new window.

## 0.6.1 – 2026-10-10

Fixes from the community directory review of 0.6.0.

### Changed
- **`main.js` is 2.7 MB instead of 5.8 MB.** Users on the Obsidian Sync Standard plan can only sync files up to 5 MB. The bundled libraries (Chart.js, D3, Mermaid, three.js, KaTeX, html-to-image) are now stored compressed and unpacked when a block first needs one, about 20 ms for Mermaid. They also no longer take up memory before they are used. The release build stays reproducible: compression uses [fflate](https://github.com/101arrowz/fflate) (MIT, in `THIRD_PARTY_LICENSES.txt`), not Node's zlib.
- **Agent skill**: error messages of `prism.edit` and `source: notes` in the error table, copyable patterns for a no-code frontmatter chart and a checklist that edits its note, and what to tell the user about "Allow edits". Run *Prism: Install agent skill* again to update an installed skill.

- **Block menu instead of a hover toolbar**: the row of five tools that appeared over the top right of a block on hover often covered its controls. It is now one small ⋯ button that opens a menu with all actions (show source, reload, fullscreen, exports, copy actions). In blocks with a `title` the button sits in the title row and never covers the content; in blocks without a title it is a single button in the corner. *Reset zoom* shows next to it while a block is zoomed.

### Fixed
- The wavy underline of errors in the editor no longer uses `text-decoration` styles that older Obsidian versions only partly support. It is drawn with gradients.
- Baked images are hidden without the `:has()` selector, which can slow down large notes. A small Reading view post-processor marks their paragraph instead.

### Internal
- `@codemirror/state` and `@codemirror/view` are listed as dependencies. They stay external: Obsidian provides them at runtime.
- No inline style assignment in the bake renderer, no `this` alias in `src/editorErrors.ts`, no unnecessary type assertions in `src/noteEdit.ts`.

## 0.6.0 – 2026-10-10

### New
- **Widgets that edit their note** (`prism.edit`): a block can check off tasks (`setTask`), set table cells (`setCell`), add table rows (`addRow`) and set frontmatter properties (`setProperty`) in its own note. This makes habit trackers, checklists, task boards and quick-entry forms possible, with the data kept in plain Markdown.
  - Each block asks once before its first edit (*Allow edits* / *Don't allow*) and asks again when its code changes. Other notes are never changed.
  - Edits go through the editor when the note is open there: Cmd/Ctrl+Z undoes them, and the view does not scroll.
  - Command-line renders and PDF export never edit.
  - *Settings → Prism → Blocks may edit their note* turns it off.
  - Example: `examples/16 Habit tracker.md`. Details: [`docs/note-edits.md`](https://github.com/floorianmb/prism-viz/blob/main/docs/note-edits.md).
- **Blocks follow the note as you type**: `prism.onNoteChange` fires about 250 ms after a change in the editor, and right after a `prism.edit`. It no longer waits for Obsidian to save and index the note. `prism.note()` reads tasks and tables from the editor text while it has unsaved changes, so a task checked off by hand shows up in the block almost at once.
- **Charts from frontmatter without code**: `source: notes` in ` ```viz chart ` and ` ```viz table ` blocks gives one row per note: title, every property, folder, path, modified and tags.
  - `folder:` and `tag:` narrow the notes.
  - New `aggregate: count | sum | avg | min | max` groups rows by `x` (and `series`). It also works with tables and CSV files.
  - List values such as tags count once per item, and `filter` matches them by containment.
  - Example: `examples/17 Charts from frontmatter.md`. Details: [`docs/frontmatter-charts.md`](https://github.com/floorianmb/prism-viz/blob/main/docs/frontmatter-charts.md).
- **Errors in the editor**: lines that caused an error or warning are underlined (red or yellow) in Live Preview and source mode, with the message at the end of the line and all messages on hover. Errors without a line go on the block's opening fence. *Settings → Prism → Errors in the editor* turns it off. Details: [`docs/editor-errors.md`](https://github.com/floorianmb/prism-viz/blob/main/docs/editor-errors.md).
- **Baked images for Publish, GitHub and other apps**: *Prism: Bake blocks as images* saves a PNG of every block of the current note and links it as a plain Markdown image below the block.
  - Where Prism does not run (Obsidian Publish, GitHub, other Markdown apps, Prism switched off), readers see the image. In Obsidian with Prism it is hidden.
  - Baking again replaces the images. *Prism: Remove baked images* removes the lines and moves the files to the trash.
  - Details: [`docs/bake.md`](https://github.com/floorianmb/prism-viz/blob/main/docs/bake.md).

### Fixed
- **False "This block stopped responding"** after a note was in a background tab or window for a while. Chromium throttles timers of hidden frames to about once a minute, and they stay throttled for a while after the frame is shown again, so the block's heartbeat was missing. Prism now pings the block directly (messages are not throttled, while a block in a busy loop still cannot answer), starts counting again when a block becomes visible, and takes the notice back as soon as the block answers.
- **Run requests approves only the hosts it names.** Before, one click on *Run requests* released every request of the block's current render, also to hosts that the bar had not shown. A block could name a public API in the bar and, after the click, send requests to a service on your computer or local network. Now the click approves the hosts named in the bar; a request to any other host (`localhost:27124` and `localhost` count as different hosts) shows the bar again: *This block also wants to send requests to …*. Requests to several hosts at once still need just one click. See [`docs/online-access.md`](https://github.com/floorianmb/prism-viz/blob/main/docs/online-access.md).
- **`prism.state` stays with its block.** Blocks without `id=` store their state by position. Inserting a block above gave the new block the state of the old one, and every block below got its predecessor's state. Prism now records the blocks of such notes and moves the state along when blocks are inserted, removed or edited:
  - A deleted block's state is kept aside and comes back when the same block appears again (cut and paste, undo).
  - Adding `id=` to a block keeps its state.
  - Open blocks switch to their new state right away.
  - `id=` stays the reliable way to keep state; the agent skill sets it on every block that uses `prism.state`. Details and limits: [`docs/block-state.md`](https://github.com/floorianmb/prism-viz/blob/main/docs/block-state.md).

### Internal
- `prism.version` and the version in `PRISM.md` come from `manifest.json` at build time instead of a constant in `src/protocol.ts`, which was forgotten once (0.4.0 reported 0.3.0).
- `npm run check-version` checks that `manifest.json`, `package.json`, `package-lock.json`, `versions.json` and `CHANGELOG.md` agree on the version. CI and the release workflow run it.
- New docs: `docs/block-state.md`, `docs/online-access.md`, `docs/note-edits.md`, `docs/frontmatter-charts.md`, `docs/editor-errors.md`, `docs/bake.md`; release steps in the README.

## 0.5.2 – 2026-10-09

### New
- **Pinch to zoom in every block**: pinch on the trackpad (or with two fingers on a touch screen) to zoom into a chart, diagram or widget, up to 500 %. Prism zooms around the point under your fingers or the cursor.
  - **Only pinching zooms.** Scrolling with two fingers or the mouse wheel keeps scrolling the note, so you never get stuck in a chart while scrolling, and a chart never zooms by accident.
  - **No empty space around the content**: you cannot zoom out below 100 %, and a zoomed block stays flush with its edges while you move it.
  - **Move around while zoomed**: drag with the mouse (the cursor turns into a hand). Buttons, sliders, links, form fields and blocks with their own drag or zoom (e.g. `d3.zoom`) keep working as before.
  - **Back to 100 %**: pinch out again, or use the new *Reset zoom* button in the hover toolbar (only shown while zoomed). A reload of the block also resets the zoom.
  - **Stays interactive**: tooltips, hover, clicks and note page previews keep working while zoomed. Chart.js charts are redrawn sharp at the new size once the gesture ends.
  - Ctrl + mouse wheel zooms as well, since that is how browsers report a trackpad pinch.

## 0.5.1 – 2026-10-09

### Fixed
- **README banner on the Obsidian plugin page**: the plugin page drops `<picture>` elements, so the banner is now a plain `<img>` (PNG). All README images use absolute URLs.

## 0.5.0 – 2026-10-09

### New
- **Install guide and changelog page**: after Prism is installed or updated, a page opens with the command that installs the agent skill for this vault (vault path filled in, macOS/Linux or Windows), a prompt that lets the agent install it, and this changelog below. Commands *Prism: Install agent skill* and *Prism: Show changelog* open it again; *Settings → Prism → Show changelog after updates* turns the automatic opening off.
- **`install-skill.mjs --vault <path>`**: works from a temporary clone, writes that vault path into the skill and copies `prism-render.mjs` into the vault's plugin folder, which community plugin installs do not contain.

## 0.4.3 – 2026-10-09

### Fixed
- **README banner on the Obsidian plugin page**: the banner is now a PNG (`docs/media/banner-dark.png`, `banner-light.png`, rendered from the SVGs), because the community plugin page did not load the SVG. The fallback image uses an absolute URL.

## 0.4.2 – 2026-10-09

Fixes from the community directory review of 0.4.1.

### Changed
- **No runtime script injection**: html-to-image (14 KB) is part of every block's srcdoc, so PNG/SVG export and snapshots no longer load it on demand through a `<script>` element.
- **KaTeX 0.19** (security advisory for versions below 0.18.2). Mermaid is now bundled from its ES modules so it uses the same KaTeX instead of the older copy in its prebuilt file; `mermaid.min.js` also got about 120 KB smaller.
- **Release files are attested**: the release workflow adds GitHub artifact attestations for `main.js`, `manifest.json` and `styles.css`.
- **Obsidian DOM helpers**: host code uses `createEl`/`createDiv`; the block runtime has its own small stand-ins (`src/runtime/dom.ts`) because Obsidian's globals do not exist in the sandbox.
- **Local storage** only through Obsidian's per-vault API (the `window.localStorage` fallback for old Obsidian versions is gone).
- **README**: the privacy section also covers the vault index, the clipboard and local storage.

### Internal
- `builtin-modules` replaced by Node's `builtinModules`; no `!important` in `styles.css`; `LibraryInfo.global` renamed to `globalName`.

## 0.4.1 – 2026-10-09

Preparation for the Obsidian community plugin directory.

### Changed
- **Requires Obsidian 1.10** (`minAppVersion`): Prism uses APIs from 1.8.7 (local storage, `getLanguage`) and 1.10 (Bases views), so the old 1.5.0 minimum was wrong.
- **Widget stylesheets ship with every block**: the CSS of `prism.table`, `prism.monitor` and note links in diagrams is part of each block's srcdoc (`src/widgetCss.ts`). The runtime no longer creates `<style>` elements itself.
- **Electron is only touched on desktop**: background-render throttling and process metrics check `Platform.isDesktopApp` first.
- **README**: new *Network use and privacy* section (opt-in network, no telemetry, which files are read and written), community plugin install instructions.
- **Description** in `manifest.json` starts with a verb and has no parentheses.

### Fixed
- `prism.version` and `PRISM.md` reported 0.3.0.
- Table cells, table search and sorting, `prism.format` and Bases series showed `[object Object]` for object values; they now show JSON (arrays stay comma-separated).
- *Copy as PNG* no longer uses `fetch` on a data URL.

### Internal
- Passes `eslint-plugin-obsidianmd` (recommended config) without errors: no inline style assignments, no unchecked `any`, no unnecessary type assertions, window-bound timers in the block runtime.

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
