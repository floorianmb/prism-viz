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

## Install

1. Install **Prism** (`prism-viz`) from Community plugins, or copy `main.js`, `manifest.json` and `styles.css` into `examples/.obsidian/plugins/prism-viz/`.
2. Open the `examples` folder as a vault (*Open folder as vault*) and turn off Restricted mode.
3. For note 7, add `data` under *Settings → Prism → Data folders*.

> [!tip] Every block is meant to be copied
> Click into any block to see its source, or add the `source` keyword to the info line to show it below the rendering.
