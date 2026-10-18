---
type: showcase
tags: [prism, example, no-code]
status: done
date: 2026-10-18
---
# Link graph

`source: links` gives one row per link between notes (`from`, `to`, plus `fromPath`, `toPath`, `folder`, `tags`). `type: graph` draws them as a network: bigger nodes have more links. A click opens the note, hover shows a preview.

## The notes of this vault

All links between the notes in the `Notes` folder.

```viz chart title="Network of Notes"
type: graph
source: links
folder: Notes
```

## Only the biggest hubs

`limit` keeps the notes with the most links.

```viz chart title="Top 6 notes"
type: graph
source: links
folder: Notes
limit: 6
```

## As a table

Without a graph: every link as a row. Tables only list; there is no `aggregate`.

```viz table title="Links in Notes"
source: links
folder: Notes
columns: [from, to]
sort: from
```
