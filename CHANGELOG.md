# Changelog

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
