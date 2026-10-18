---
type: showcase
tags: [prism, example, cli]
status: done
date: 2026-10-18
---
# Offline check

`prism-render --lint` checks the `viz` blocks of a note without Obsidian: YAML errors, unknown keys, missing columns, missing tables and syntax errors in scripts. It prints JSON with the line in the note, which suits editors, scripts and agents.

```sh
node .obsidian/plugins/prism-viz/scripts/prism-render.mjs --lint "Note.md"
node .obsidian/plugins/prism-viz/scripts/prism-render.mjs --lint --all [folder]
```

Exit codes: `0` everything fine or only warnings, `1` at least one block has an error, `4` the command could not run (for example a missing file).

## A broken block

The block below has a typo in a key and a column that the table does not have. It is quoted in a longer fence, so it is not rendered here.

````
```viz chart
type: bar
source: ^sales
x: Mont
y: Revenue
stack: true
```
````

Saved as `Note.md` (with the table `^sales` above the block), the check prints this. `line` counts lines of the note file; a wrong key or column is a `warning`, a broken YAML block or a missing table an `error`.

````json
{
  "notePath": "Note.md",
  "status": "warning",
  "blocks": [
    {
      "block": "Note.md#0",
      "lines": [
        9,
        15
      ],
      "status": "warning",
      "errors": [
        {
          "kind": "warning",
          "line": 14,
          "message": "prism.chart: unknown key \"stack\" (known: type, source, folder, tag, rows, x, y, series, filter, select, aggregate, sort, limit, stacked, title, height, options, data, geo, geoKey, group, lines, goal, compute, start, end, from, to, format, digits)"
        },
        {
          "kind": "warning",
          "line": 12,
          "message": "prism.chart: column \"Mont\" not found (columns: Month, Revenue)"
        }
      ]
    }
  ]
}
````

## A block that works

This one passes the check.

| Month | Revenue |
| --- | --- |
| Aug | 6100 |
| Sep | 6900 |
| Oct | 7800 |

^sales

```viz chart title="Revenue"
type: bar
source: ^sales
x: Month
y: Revenue
```
