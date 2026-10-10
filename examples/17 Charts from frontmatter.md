---
type: showcase
tags: [prism, example, no-code]
status: done
date: 2026-10-10
---
# Charts from frontmatter

`source: notes` turns the frontmatter of your notes into rows: one per note, with its title, every property, folder, last change and tags. `aggregate` groups them. No JavaScript needed, and the charts follow when you change a property.

## Notes per type

```viz chart title="Notes per type"
type: doughnut
source: notes
x: type
aggregate: count
sort: -count
```

## Notes per tag in the Notes folder

Tags are lists, so each tag of a note counts once.

```viz chart title="Notes per tag"
type: hbar
source: notes
folder: Notes
x: tags
aggregate: count
sort: -count
limit: 10
```

## Status across types

`series` splits each bar by a second property.

```viz chart title="Status by type"
type: bar
source: notes
folder: Notes
x: type
series: status
aggregate: count
stacked: true
```

## The notes as a table

```viz table title="Notes folder"
source: notes
folder: Notes
columns: [title, type, status, date, tags]
sort: -date
```
