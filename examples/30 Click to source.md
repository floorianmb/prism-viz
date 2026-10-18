---
type: showcase
tags: [prism, example, no-code]
status: done
date: 2026-10-18
---
# Click to source

A click on a bar or point without `select` opens what is behind it. With `select:` the click filters other blocks instead (see [[19 Cross-filter]]).

## A table in this note

Click a bar: the editor jumps to the row of the table below.

| Fruit | Kilos |
| --- | --- |
| Apples | 12 |
| Pears | 7 |
| Plums | 9 |

^fruit

```viz chart title="Fruit – click a bar to jump to its row"
type: bar
source: ^fruit
x: Fruit
y: Kilos
```

## Notes

Each bar is a note; a click opens it.

```viz chart title="Notes by title – click to open"
type: hbar
source: notes
folder: Notes
x: title
y: date
aggregate: count
```

## Tasks

A click on a bar of a task chart opens the note at the line of the task.

```viz chart title="Open tasks – click to open the task"
type: bar
source: tasks
folder: Notes
filter: { done: false }
x: text
y: priority
aggregate: count
```

## With select

Here a click sets `prism.shared` instead of opening something. The table filters by the clicked fruit.

```viz chart title="Click to filter"
type: bar
source: ^fruit
x: Fruit
y: Kilos
select: fruit
```

```viz table title="Selected"
source: ^fruit
filter: { Fruit: $shared.fruit }
```
