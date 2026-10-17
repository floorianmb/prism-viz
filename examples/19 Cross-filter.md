---
type: showcase
tags: [prism, example, no-code]
status: done
date: 2026-10-18
---
# Cross-filter

Click a genre in the doughnut: the table and the bar chart below show only its books. Click it again to show all. No JavaScript, just `select` on the chart and `$shared` in the filters.

| Title | Genre | Pages | Rating |
| --- | --- | --- | --- |
| Dune | Novel | 612 | 5 |
| Foundation | Novel | 255 | 4 |
| The Left Hand of Darkness | Novel | 304 | 4 |
| Deep Work | Non-fiction | 296 | 4 |
| Designing Data-Intensive Applications | Non-fiction | 616 | 5 |
| Thinking, Fast and Slow | Non-fiction | 499 | 3 |
| Leaves of Grass | Poetry | 145 | 3 |
| Ariel | Poetry | 112 | 4 |

^books

```viz chart title="Books per genre – click to filter"
type: doughnut
source: ^books
x: Genre
aggregate: count
select: genre
```

```viz table title="Books"
source: ^books
filter: { Genre: $shared.genre }
sort: -Rating
```

```viz chart title="Pages"
type: hbar
source: ^books
filter: { Genre: $shared.genre }
x: Title
y: Pages
sort: -Pages
```
