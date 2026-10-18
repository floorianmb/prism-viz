---
type: showcase
tags: [prism, example, no-code]
status: done
date: 2026-10-18
---
# KPI tiles

`type: kpi` draws big-number tiles: one per `y` column, or a single count of rows when there is no `y`. With `x` (a date column) and `group` each tile also shows the current period, the change to the previous one and a sparkline. `goal` adds a progress bar; `format` and `digits` shape the number.

| Date | Revenue | Orders | Refunds |
| --- | --- | --- | --- |
| 2026-05-12 | 4200 | 38 | 2 |
| 2026-05-28 | 3900 | 35 | 3 |
| 2026-06-09 | 4600 | 41 | 2 |
| 2026-06-25 | 4900 | 44 | 4 |
| 2026-07-10 | 5200 | 47 | 3 |
| 2026-07-26 | 5600 | 50 | 2 |
| 2026-08-08 | 5400 | 49 | 5 |
| 2026-08-23 | 6100 | 55 | 3 |
| 2026-09-05 | 6500 | 58 | 4 |
| 2026-09-21 | 6900 | 61 | 2 |
| 2026-10-04 | 7300 | 66 | 3 |
| 2026-10-15 | 7800 | 70 | 4 |

^sales

## One tile per column

Totals over the whole table.

```viz chart title="Totals"
type: kpi
source: ^sales
y: [Revenue, Orders]
```

## Count of rows

Without `y` the tile counts rows.

```viz chart title="Entries"
type: kpi
source: ^sales
```

## Trend per month

With `x` and `group` each tile shows the current month, the change to the month before and a sparkline.

```viz chart title="Revenue this month"
type: kpi
source: ^sales
x: Date
y: Revenue
group: month
format: eur
```

## Goal and digits

The progress bar shows how far the value is from the goal. `aggregate: avg` gives the average per row, `digits` the decimals.

```viz chart title="Average order revenue"
type: kpi
source: ^sales
y: Revenue
aggregate: avg
goal: 6000
format: eur
digits: 0
```

## A small dashboard

Four tiles side by side from four blocks.

```viz chart title="Revenue"
type: kpi
source: ^sales
x: Date
y: Revenue
group: quarter
format: eur
goal: 20000
```

```viz chart title="Orders"
type: kpi
source: ^sales
x: Date
y: Orders
group: month
```

```viz chart title="Refunds"
type: kpi
source: ^sales
x: Date
y: Refunds
group: month
```

```viz chart title="Open tasks"
type: kpi
source: tasks
filter: { done: false }
```
