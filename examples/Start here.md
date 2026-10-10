---
type: guide
tags: [prism, example]
status: done
date: 2026-10-08
---
# Welcome to Prism

Prism turns ` ```viz ` code blocks into living charts, dashboards, diagrams, formulas and small scenes, right inside your notes. Everything runs offline and follows your Obsidian theme, so try switching between light and dark.

## The tour

1. [[01 Dashboard]] – KPI cards and charts driven by a plain Markdown table in the note.
2. [[02 No-code chart]] – a chart and a sortable table from a YAML spec, no JavaScript.
3. [[03 Architecture diagram]] – a Mermaid diagram whose nodes open other notes.
4. [[04 Formulas]] – LaTeX with KaTeX, plus a slider that reshapes a chart.
5. [[05 Vault overview]] – live statistics from the frontmatter of every note in this vault.
6. [[06 Animated scene]] – a canvas animation that pauses off screen and respects reduced motion.
7. [[07 Data file]] – a CSV from the `data/` folder, charted and tabulated.

### Going further

8. [[08 Live API data]] – live numbers from the GitHub API and a weather forecast, with every loading state handled.
9. [[09 Web pages]] – websites inside a note: desktop webview, iframe mode and an iframe inside a block, compared.
10. [[10 Scrollytelling]] – a chart that follows the section you are reading.
11. [[11 Variants]] – the same data as bar, line or table, with a remembered switcher.
12. [[12 Tasks and links]] – open tasks across the vault and a link graph with page previews.
13. [[13 Page monitor]] – how much RAM and CPU the blocks on a page use.
14. [[14 Bases chart]] – the "Prism chart" view for Obsidian Bases, no code.
15. [[15 HTML file]] – a standalone `.html` widget embedded like an image.
16. [[16 Habit tracker]] – widgets that write back: check off tasks and fill a table from a block.
17. [[17 Charts from frontmatter]] – notes per type, status and tag in a few lines of YAML.

## Install

1. Install **Prism** with [BRAT](https://github.com/TfTHacker/obsidian42-brat) (`floorianmb/prism-viz`), or copy `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/floorianmb/prism-viz/releases/latest) into `examples/.obsidian/plugins/prism-viz/`.
2. Open the `examples` folder as a vault (*Open folder as vault*) and turn off Restricted mode.
3. For note 7, add `data` under *Settings → Prism → Data folders*.
4. For notes 8 and 9, turn on *Settings → Prism → Online access* (API requests, Web pages). Both are off by default.

> [!tip] Every block is meant to be copied
> Click into any block to see its source, or add the `source` keyword to the info line to show it below the rendering.
