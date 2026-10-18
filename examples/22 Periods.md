---
type: showcase
tags: [prism, example, no-code]
status: done
date: 2026-10-18
---
# Periods

`group` turns a date column into periods: `day`, `week` (ISO, `2026-W42`), `month`, `quarter` or `year`. The chart then counts or aggregates per period, and periods without data stay in the chart as empty bars.

## Notes per month

Every note of the vault, grouped by the month of its `date` property.

```viz chart title="Notes per month"
type: bar
source: notes
x: date
group: month
```

## Tasks done per week

The ✅ dates of the Tasks plugin, one bar per ISO week.

```viz chart title="Tasks done per week"
type: bar
source: tasks
filter: { done: true }
x: doneDate
group: week
```

## Expenses per month, last six periods

`aggregate: sum` adds up the `Amount` column per period; `limit: 6` keeps only the last six. Hover a bar for the exact sum.

| Date | Category | Amount |
| --- | --- | --- |
| 2026-03-04 | Rent | 900 |
| 2026-03-18 | Food | 210 |
| 2026-04-02 | Rent | 900 |
| 2026-04-12 | Travel | 340 |
| 2026-04-25 | Food | 190 |
| 2026-05-02 | Rent | 900 |
| 2026-05-20 | Food | 230 |
| 2026-06-02 | Rent | 900 |
| 2026-06-14 | Travel | 120 |
| 2026-06-27 | Food | 205 |
| 2026-07-02 | Rent | 900 |
| 2026-07-09 | Travel | 780 |
| 2026-07-22 | Food | 250 |
| 2026-08-02 | Rent | 900 |
| 2026-08-15 | Food | 220 |
| 2026-09-02 | Rent | 900 |
| 2026-09-19 | Food | 240 |
| 2026-10-02 | Rent | 900 |
| 2026-10-11 | Food | 175 |

^expenses

```viz chart title="Expenses per month (last 6)"
type: bar
source: ^expenses
x: Date
y: Amount
group: month
aggregate: sum
limit: 6
```

## Variant: per quarter, split by category

The same table per quarter, one line per category.

```viz chart title="Expenses per quarter and category"
type: line
source: ^expenses
x: Date
y: Amount
series: Category
group: quarter
aggregate: sum
```
