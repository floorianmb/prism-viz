# KPI tiles, timelines, link graphs and flows

Four more `type` values for ` ```viz chart `, drawn by Prism as SVG (no library keyword). Colors follow the theme, and exports, snapshots and the PDF look like the live view. For data from links between notes, see `source: links` at the end.

## `type: kpi`

Big numbers, one tile per `y` column (one tile "Count" without `y`).

```viz chart
type: kpi
source: ^umsatz
x: date
y: [Umsatz, Gewinn]
group: month
format: eur
goal: 50000
```

- The value is `aggregate` of all rows (default: sum with `y`, count without).
- With `x` (a date column) and `group`, the tile shows the **current period** (the last one, extended to today), the change to the previous period and a sparkline of up to 24 periods. The change is a percentage, or the difference when the previous value is 0.
- `goal: N` adds a progress bar and the percent of the goal.
- `format: number | integer | percent | eur | usd` (or `{ Umsatz: eur }` per tile) and `digits: N` set the number format in Obsidian's language.
- `select`, `lines` and `series` do not apply and report a warning.

## `type: timeline`

A Gantt chart: one row per task or note.

```viz chart title="Plan"
type: timeline
source: tasks
folder: Projects
x: text
start: scheduled
end: due
series: note
```

- `x` is the label (default: `text`, else `title`, else the first column). `start` is the start date column (default: `start`, `scheduled`, `date`, the first one that exists). `end` is the end date column (default: `end`, `due`).
- A row with both dates is a bar; the end day is included. A row with one date, or with the end before the start, is a milestone (a diamond).
- `series: column` colors the bars by that column and adds a legend.
- Rows with `done: true` are faded. A dashed line marks today.
- Rows without a date are left out, and a note below the chart says how many.
- Rows are sorted by start; `sort` overrides it. At most 200 rows are drawn (the note says how many more); `limit: N` sets another maximum.
- A click opens the note of the row (`path` column) or jumps to its row in the table of this note.

## `type: graph`

The link network of your notes, with `source: links`:

```viz chart title="Projects"
type: graph
source: links
folder: Projects
limit: 80
```

- `from` and `to` name the two columns (default `from` and `to`). With `source: links` that is all you need. For other data, a `<column>Path` column (`fromPath`) gives the nodes a note to open.
- Layout: Prism's own force layout, deterministic, so the same data always gives the same picture.
- Node size = number of linked notes. Color = top-level folder of the note. Notes that do not exist (unresolved links) are hollow.
- Labels for the 30 biggest nodes; with 40 nodes or fewer, all have one.
- `limit` is the maximum number of nodes (default 150, at most 500). The most connected nodes stay, and a note says how many are left out.
- Hover highlights a node and its neighbors. A click opens the note. With `select: key`, a click sets `prism.shared.key` to the node name instead (see [`cross-filter.md`](cross-filter.md)).
- Links are undirected here; several links between two notes are drawn as one edge.

## `type: sankey`

Flows between named nodes: budgets, funnels, energy.

```viz chart title="Where the salary goes"
type: sankey
y: y
rows:
  - { from: Salary, to: Rent, y: 900 }
  - { from: Salary, to: Savings, y: 300 }
  - { from: Savings, to: Fund, y: 200 }
```

- `from` and `to` name the columns (default `from`, `to`), `y` the size of the flow. Without `y`, each row counts 1.
- Rows with the same pair are summed. Empty ends, self-links and values of 0 or less are skipped.
- A link that closes a cycle is dropped, and a warning lists it.
- Hover highlights a flow with its source and target. `select: key` works on nodes.
- The height is computed from the number of nodes; `height: N` overrides it.

## `source: links`

One row per distinct link of a note: `from` and `to` (note titles; the link text for a note that does not exist), `fromPath`, `toPath` (`null` for a missing note), `folder` and `tags` of the note that holds the link. `folder` and `tag` narrow the notes that hold the links.

```viz chart title="Most links out"
type: hbar
source: links
x: from
aggregate: count
sort: -count
limit: 10
```

Two notes with the same title are one node in `graph`.
