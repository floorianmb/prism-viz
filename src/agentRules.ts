// Content of PRISM.md, the reference for AI agents ("Prism: Generate agent rules").

import { LIBRARIES } from "./libs";
import { PRISM_VERSION } from "./protocol";

export const RULES_MARKER = "<!-- prism:agent-rules -->";

// "§" stands for a backtick (the text lives in a template literal).
const TEXT = String.raw`
# Prism – visualizations in notes (reference for agents)

@@MARKER@@
Prism (Obsidian plugin §prism-viz§, v@@VERSION@@) renders HTML/SVG/CSS/JS from §viz§ code blocks inline in notes: sandboxed, offline, themed, auto-sized. Regenerate this file with the command "Prism: Generate agent rules".

## Syntax

§§§§
§§§viz [library keywords] [height=420] [title="Caption"] [id=name] [raw] [eager] [notoolbar] [source]
<div class="card">HTML fragment or a full <!doctype html> document</div>
<script>/* plain JS, runs in the block */</script>
§§§
§§§§

- Body: HTML fragment (preferred) or a complete document. §<style>§ and §<script>§ inline. No ES module imports from URLs.
- Library keywords (bundled, offline, loaded before your scripts):
@@LIBS@@
- §height=N§ fixes the height in px; default is auto-height. §title="…"§ shows a caption. §id=name§ keeps §prism.state§ stable even if blocks are reordered (otherwise state is keyed by note path + block position). §raw§ disables the default stylesheet. §eager§ renders without waiting for the block to scroll into view (avoid it: it disables lazy rendering for that block). §source§ shows the source below the rendering.
- Plain Mermaid: §§§viz mermaid§ with Mermaid text as body (no HTML) renders the diagram directly. Node labels may contain wiki links – §A["[[Note name]]"]§ or §A["[[Note name|Shown text]]"]§ (quoted; §A[[…]]§ unquoted is Mermaid's subroutine shape): the label shows the text and clicking the node opens the note.
- Data table: §§§viz table§ with a YAML/JSON spec renders a searchable, sortable table – §source§ (§^block-id§, §table:<heading>§ or a data file path) or §rows§, optional §columns§ (keys or §{ key, label, format, digits }§), §format: { col: eur }§, §sort: -col§, §filter§, §pageSize§ (25), §search§, §title§. Formats: §text§, §number§, §integer§, §percent§, §eur§, §usd§, §date§, §link§, §badge§; guessed from column names and values (§source§/URLs → link, §confidence§/§status§ → colored badge, years stay plain). Numbers use Obsidian's language. Sort order and search text persist.
- Plain LaTeX: §§§viz math§ (alias of §katex§) with LaTeX as body renders one display formula; a body containing §$…$§ / §$$…$$§ is text with formulas (blank line = new paragraph). Chemistry via §\ce{…}§ (mhchem).
- Declarative chart: §§§viz chart§ with a YAML/JSON object as body instead of HTML draws a Chart.js chart without any code:

§§§§
§§§viz chart title="Umsatz je Quartal"
type: bar            # bar | hbar | line | area | pie | doughnut | scatter | radar | polarArea | bubble
source: ^quartale    # "^block-id" / "table:<heading>" / "#0" = Markdown table of this note, or a data file path, or use rows: [...]
x: Quartal           # label column (default: first column)
y: [Basis, Ziel]     # value columns (default: all numeric columns)
series: model_line   # optional: long format, one dataset per value of this column (values from the first y column)
filter: { year: 2024 }   # optional; sort: -Ziel, limit: 10, stacked: true, height: 300, options: {Chart.js options}
§§§
§§§§

  The chart redraws when the table or data file changes. Unknown keys and missing columns are reported as warnings. The same spec works in HTML blocks: §await prism.chart("#el", spec)§ (returns the Chart.js instance).
- HTML files: §![[file.html]]§ embeds a vault HTML file with the same renderer; options go into §<meta name="prism" content="chart height=400">§ or §<!-- prism: chart height=400 -->§, or the embed alias §![[file.html|height=400]]§.

## Sandbox and limits

- §sandbox="allow-scripts"§, opaque origin. No access to Obsidian, the vault, cookies or the host DOM.
- CSP: §default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:§. Network (fetch, CDN scripts, remote images, web fonts) is blocked unless the user allowlists a domain in the settings. Inline data, use the bundled libraries, embed images as §data:§ URIs.
- §alert§ → toast; §confirm§ → false; §prompt§ → null. §localStorage§ works but is persisted through §prism.state§. Forms do not submit; §submit§ events are still dispatched, so call §event.preventDefault()§ and handle them in JS.
- Loops in inline scripts are guarded: a loop that blocks the thread for more than 2 s is stopped with an error (blocks share Obsidian's main thread). Split long work with §setTimeout§/§requestAnimationFrame§.
- Links: §<a href="Note name">§ opens a note in Obsidian; §https://…§ opens the system browser; the block itself never navigates.

## Runtime API: §window.prism§

| API | Description |
| --- | --- |
| §prism.theme§ | §{ dark, mode, vars, palette }§ – current Obsidian theme. |
| §prism.onTheme(cb)§ | Called with §prism.theme§ after theme or light/dark changes. Returns an unsubscribe function. CSS variables update automatically; use this only for canvas/JS-drawn colors. |
| §prism.palette§ | 8 categorical colors from the theme (also §--prism-series-1§…§--prism-series-8§). |
| §prism.color("--text-accent")§ | Resolved value of a theme variable. |
| §prism.notes({ folder?, tag?, limit?, sort?, order? })§ | Promise of §[{ path, name, folder, title, tags, frontmatter, mtime }]§ (read-only metadata, no note contents). §folder§ = path prefix, §tag§ matches nested tags, §limit§ ≤ 5000 (default 1000), §sort§ = §"mtime"§ (default) / §"path"§ / §"title"§, §order§ = §"desc"§ / §"asc"§. |
| §prism.notes({ …, include: ["links", "backlinks", "headings", "tasks"] })§ | Adds per note: §links§ (resolved vault paths; unresolved links as written), §backlinks§ (paths linking here), §headings§ (§[{ level, text, line }]§), §tasks§ (§[{ text, status, done, line, due?, scheduled?, start?, doneDate?, priority?, tags }]§ – Tasks-plugin emoji fields 📅 ⏳ 🛫 ✅ and priorities 🔺⏫🔼🔽⏬ are parsed out of §text§). Only request what you need. |
| §prism.onNotesChange(cb)§ | Called (debounced) when vault metadata changes; re-query inside. |
| §prism.note()§ | Promise of the block's own note: §{ path, title, tags, frontmatter, mtime, headings, links, backlinks, tasks, tables }§. §tables[i]§ = §{ index, id, heading, lines, columns, rows }§ with typed rows (numbers incl. §0,385§, booleans, empty → §null§; link/emphasis markup stripped). §note.table(ref)§ returns the rows of a table by §"^block-id"§, heading text or index and throws a list of the available tables if none matches. Put §^id§ on its own line after the table (blank line before it) to name a table. Use this to keep data visible and editable as a Markdown table, and frontmatter values as parameters. |
| §prism.onNoteChange(cb)§ | Called when the block's own note changes (text, tables, frontmatter); re-read with §prism.note()§. |
| §prism.chart(target, spec)§ | Declarative Chart.js chart, see "Declarative chart" above. Needs the §chart§ keyword. |
| §prism.table(target, spec)§ | The table of §§§viz table§ inside HTML blocks (same spec). |
| §prism.format(value, kind?, digits?)§ | Formats in Obsidian's language: §kind§ = §"number"§ (default), §"integer"§, §"percent"§ (0.12 or 12 → 12 %), §"eur"§, §"usd"§, §"date"§. §prism.locale§ is the language tag. |
| §prism.math(target?)§ | Renders §$…$§ / §$$…$$§ in an element (after you inserted text); initial content renders automatically. Needs §katex§/§math§. |
| §prism.data(path, opts?)§ | Promise of a data file's content, read-only: CSV/TSV → array of row objects (numbers/booleans typed, empty → §null§, §rows.columns§ = header), JSON/GeoJSON → parsed, YAML → parsed, TXT → string. §path§ is vault-relative or §./§/§../§ relative to the note. Only files inside the data folders set in Prism's settings; otherwise the promise rejects with the reason. §opts§: §{ typed: false }§, §{ header: false }§ (arrays), §{ delimiter: ";" }§, §{ format: "text" }§. |
| §prism.dataFiles(folder?)§ | Promise of §[{ path, name, folder, ext, size, mtime }]§ – the data files the block may read. |
| §prism.onDataChange(cb)§ | Called with the path when a data file this block read changes; re-read inside. |
| §prism.parseCsv(text, opts?)§ | The same CSV parser for inline CSV text. |
| §prism.openNote(path, newTab?)§ | Opens a note (path or link text). |
| §prism.state.get(key, fallback?)§ | Synchronous read of persisted per-block state. |
| §prism.state.set(key, value)§ | Persists a JSON value (Promise). §delete(key)§, §keys()§, §all()§, §onChange(cb)§. Max 512 KB per block. |
| §prism.state.bind(input, key, fallback?, onValue?)§ | Two-way binds a form control (element or selector; text, number, range, select, checkbox) to a state key: restores the value, saves on input, calls §onValue(value)§ initially and on every change. Returns an unbind function. |
| §prism.shared§ | Same API as §prism.state§ (§get§, §set§, §delete§, §keys§, §all§, §onChange((all, key) => …)§, §bind§), but shared by all blocks of the same note and persisted. One block holds the controls, other blocks react – e.g. a slider block and a chart block. §set§ also runs the listeners of the setting block. |
| §prism.resize()§ | Re-measure the height now (normally automatic). |
| §prism.toast(msg)§ | Shows an Obsidian notice. |

## Theme and design rules

- Never hard-code colors. Use Obsidian variables, all available on §:root§: §--background-primary§, §--background-secondary§, §--background-modifier-border§, §--text-normal§, §--text-muted§, §--text-faint§, §--text-accent§, §--interactive-accent§, §--text-on-accent§, §--text-error§, §--text-success§, §--text-warning§, §--color-red|orange|yellow|green|cyan|blue|purple|pink§, §--font-text§, §--font-monospace§, §--radius-m§ and more. §html§ has class §theme-dark§ / §theme-light§.
- The page background is transparent so the block blends into the note. Keep it that way; use §.card§ for surfaces. Exception: scenes such as simulations or particle animations may sit on a dark, rounded "stage" element that stays dark in both themes, with its own light colors.
- Canvas animations: advance by real elapsed time, scale the canvas by §devicePixelRatio§, redraw on resize without restarting, pause when off screen (§IntersectionObserver§) and respect §prefers-reduced-motion§.
- Default stylesheet styles headings, tables, buttons, inputs, code. Helper classes: §.card§, §.grid§ (responsive auto-fit columns), §.row§ (wrapping flex), §.stack§, §.kpi§ (big number), §.label§, §.muted§, §.faint§, §.badge§, §.accent§, §.error§, §.success§, §.warning§. §button.primary§ is the accent button.
- Width is the note column (often 600–900 px; mobile ~360 px). Use relative widths, §viewBox§ for SVG (§width:100%;height:auto§), wrap text.
- Auto-height measures §body§. Never use §100vh§, §height:100%§ on §html/body§ or §position:fixed§ layouts; give charts an explicit container height, e.g. §<div style="height:260px"><canvas></canvas></div>§ with Chart.js §maintainAspectRatio:false§. Use §height=N§ for canvas/WebGL scenes.
- SVG presentation attributes do not resolve §var()§ reliably; style SVG through a §<style>§ block (§.node rect { fill: var(--background-secondary) }§).
- Chart.js: datasets without colors get the theme palette and charts update on theme change. Mermaid: §.mermaid§ elements render with theme colors. D3: use §prism.palette§ for ordinal scales.
- Keep blocks self-contained and small. Load data with §prism.notes()§ / §prism.data()§ instead of hard-coding vault data; cite the data file in the note text.

## Render check from the command line (use after every edit)

§§§bash
node .obsidian/plugins/prism-viz/scripts/prism-render.mjs "Folder/Note.md"
§§§

Renders all §viz§ blocks of the note in the running Obsidian app (the note does not need to be open) and prints JSON: §{ status, blocks: [{ block, lines, status, errors: [{ kind, line, message }], height, snapshot, snapshotFile }] }§. §status§ is §ok§, §warning§, §error§ or §failed§; exit code 0 = ok/warning, 1 = block errors, 2 = render failed, 3 = Obsidian not reachable. §snapshotFile§ is an absolute path to a PNG of the block – open it to check the visual result. Options: §--no-snapshot§, §--width 720§, §--timeout 60§. Equivalent URI: §obsidian://prism?vault=<name>&render=<path>&id=<id>§, result in §.prism/renders/<id>.json§ and §.prism/renders/latest.json§.

Workflow: write the block → run the command → fix every error at the reported note line → look at the snapshot → repeat until §status§ is §ok§.

More: §--all [folder]§ renders every note with viz blocks and prints a summary (§{ notes, ok, results: [{ note, status, blocks, problems }] }§; add §--snapshot§ for PNGs). §--reload§ reloads Prism first (after rebuilding the plugin); alone it only reloads.

Markdown tables in notes (for §prism.note()§, §source: ^id§): numbers may be written the German way (§1.500,50§, §0,385§), with units (§1.500 €§, §12 %§ – the table then formats the column as currency/percent) and §–§ for "no value".

## Errors and self-check

- Errors in blocks (§window.onerror§, unhandled rejections, §console.error§, CSP violations, Mermaid parse errors, timeouts) appear as a badge on the block and are written to §.prism/errors.json§ in the vault root:
  - §blocks["<note path>#<index>"]§ → §{ status: "ok"|"error"|"warning"|"rendering"|"interrupted", renderedAt, errors, warnings, lines: { start, end }, snapshot? }§. §interrupted§ means the block was unloaded before it finished loading – that is not a verdict; render the note with the command below.
  - §errors[]§ → §{ block, notePath, lines, line, blockLine, kind, message, origin, time }§, newest first. §line§ is the 1-based line in the note; §origin§ is §"block"§ for your code, §"lib:<name>"§ for a bundled library.
- Index = 0-based position of the §viz§ block in the note; with §id=name§ the key is §<note path>#<name>§. HTML files use §file:<path>§.
- A block's entries are refreshed every time it renders: when it is visible in Obsidian or via the render command above. Prefer the render command; when reading §errors.json§ directly, check that §renderedAt§ is newer than your edit.
- Snapshots (optional setting): a PNG of each successfully rendered block at §.prism/snapshots/<hash>.png§; the path is in §blocks[…].snapshot§ and §.prism/snapshots/index.json§.

## Text for CLAUDE.md / AGENTS.md

§§§markdown
## Visualizations (Prism)
This vault has the Prism plugin. For charts, diagrams, dashboards and interactive widgets, write a §§§viz code block (HTML/SVG/JS) instead of images or external tools. Read PRISM.md in the vault root before writing one. Rules: use Obsidian CSS variables (no hard-coded colors), no network, no 100vh; load note metadata via prism.notes() and CSV/JSON data files via prism.data("path") instead of copying data into the block. After every edit run §node .obsidian/plugins/prism-viz/scripts/prism-render.mjs "<note path>"§, fix all reported errors and look at the snapshot PNG.
§§§
`;

export function agentRules(): string {
	const libs = Object.entries(LIBRARIES)
		.map(([name, info]) => `  - §${name}§${info.aliases.length ? ` (${info.aliases.map((a) => `§${a}§`).join(", ")})` : ""}: ${info.description}`)
		.join("\n");
	const frontmatter = [
		"---",
		"type: Reference",
		"title: Prism agent reference",
		"description: Syntax, runtime API, design rules and error log of the Prism visualization plugin, for AI agents.",
		"tags: [prism, agents, visualization]",
		"status: draft",
		"generated:",
		`  by: plugin:prism-viz/${PRISM_VERSION}`,
		`  at: "${new Date().toISOString().replace(/\.\d+Z$/, "Z")}"`,
		"---",
	].join("\n");
	const body = TEXT.replace("@@MARKER@@", RULES_MARKER)
		.replace("@@VERSION@@", PRISM_VERSION)
		// Function replacer: the library texts contain "$`" and "$$", which a
		// replacement string would expand as special patterns.
		.replace("@@LIBS@@", () => libs)
		.replace(/§/g, "`");
	return frontmatter + "\n" + body.trimStart();
}
