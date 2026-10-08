---
type: showcase
tags: [prism, example, chart]
status: done
date: 2026-10-02
---
# No-code chart

Write the numbers as a Markdown table, give it a `^block-id`, and point a YAML spec at it. No JavaScript, and the chart redraws whenever the table changes.

| Quarter | Hardware | Software | Services |
| --- | --- | --- | --- |
| 2025 Q1 | 420 | 310 | 180 |
| 2025 Q2 | 445 | 350 | 190 |
| 2025 Q3 | 430 | 410 | 215 |
| 2025 Q4 | 520 | 470 | 240 |
| 2026 Q1 | 480 | 530 | 270 |
| 2026 Q2 | 495 | 590 | 305 |

^revenue

```viz chart title="Revenue by line of business (k€)"
type: bar
source: ^revenue
x: Quarter
y: [Hardware, Software, Services]
stacked: true
height: 300
```

The same data as a table with search and sortable columns. Click a header to sort.

```viz table title="Revenue data"
source: ^revenue
sort: -Software
search: false
```
