---
type: showcase
tags: [prism, example, no-code]
status: done
date: 2026-10-18
---
# Goal and reference lines

`goal` draws one horizontal line with a default label. `lines` draws as many as you like: `{ y: 8 }` marks a value, `{ x: "2026-10" }` marks a label on the category axis. Works on bar, line, area and hbar charts.

| Month | Signups | Churn |
| --- | --- | --- |
| 2026-05 | 12 | 3 |
| 2026-06 | 18 | 4 |
| 2026-07 | 22 | 6 |
| 2026-08 | 27 | 5 |
| 2026-09 | 31 | 7 |
| 2026-10 | 36 | 8 |
| 2026-11 | 40 | 6 |

^signups

## A goal

Signups per month against a goal of 30. Hover the line for its label.

```viz chart title="Signups, goal 30"
type: bar
source: ^signups
x: Month
y: Signups
goal: 30
```

## Labeled lines on both axes

A threshold on the value axis and a vertical marker at the launch month.

```viz chart title="Churn with limit and launch"
type: line
source: ^signups
x: Month
y: Churn
lines:
  - { y: 8, label: "Churn limit" }
  - { x: "2026-10", label: "Launch" }
```

## Horizontal bars

On `hbar` the goal line is vertical.

```viz chart title="Signups per month (hbar)"
type: hbar
source: ^signups
x: Month
y: Signups
goal: 30
```
