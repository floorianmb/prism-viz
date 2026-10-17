# Cross-filter: charts that filter each other

Click a bar, and the table below shows only its rows. Declarative charts and tables do this without JavaScript, through `prism.shared`, the state all blocks of a note share.

```viz chart title="Books per genre"
type: doughnut
source: ^books
x: genre
aggregate: count
select: genre
```

```viz table title="Books"
source: ^books
filter: { genre: $shared.genre }
```

## `select: <key>`

On a chart, `select` names a `prism.shared` key. A click on a label (bar, pie segment, calendar day, map region) sets the key to that `x` value; a second click on the same label clears it. While something is selected, the other labels fade. Keyboard: the chart is a tab stop, arrow keys move between labels, Enter selects. A calendar writes the day as YYYY-MM-DD, so filter on a column with plain dates (not timestamps such as 2026-10-18T09:00).

## `filter: { column: $shared.<key> }`

In any chart or table of the same note, a filter value `$shared.<key>` is replaced by the key's current value. While the key is not set, that condition is ignored and all rows show. Other conditions in the same filter keep working: `filter: { year: 2026, genre: $shared.genre }`.

Selecting the group **(none)** of an aggregate keeps the rows without a value.

## Good to know

- The selection is stored with the note's shared state, so it is still there when the note is opened again. Click the selected label to clear it.
- An HTML block can read and set the same key: `prism.shared.get("genre")`, `prism.shared.set("genre", "Lyrik")`, `prism.shared.onChange(…)`.
- Charts with `select` are clickable in Obsidian; a command-line render shows the current selection.
