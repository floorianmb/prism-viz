---
type: showcase
tags: [prism, example, no-code]
status: done
date: 2026-10-18
---
# Computed columns

`compute` adds columns from an expression, in charts and tables. Operators `+ - * / %` and parentheses, functions `round`, `floor`, `ceil`, `abs`, `min`, `max`, `days(from, to)` and `today()`. Column names with spaces go in backticks. Expressions are parsed, never evaluated as JavaScript.

| Book | Pages | Started | Finished |
| --- | --- | --- | --- |
| Dune | 612 | 2026-05-31 | 2026-06-14 |
| Foundation | 255 | 2026-06-20 | 2026-06-27 |
| Deep Work | 296 | 2026-06-28 | 2026-07-09 |
| Data-Intensive Apps | 616 | 2026-08-01 | 2026-09-12 |
| Ariel | 112 | 2026-09-14 | 2026-09-16 |

^books

## In a chart

Pages per day of reading: `days(from, to)` is the number of days from the first date to the second.

```viz chart title="Pages per day"
type: bar
source: ^books
x: Book
y: pace
compute: { pace: "round(Pages / days(Started, Finished), 1)" }
```

## In a table

Computed columns can be listed and sorted like any other.

```viz table title="Reading pace"
source: ^books
compute:
  Days: "days(Started, Finished)"
  Pace: "round(Pages / days(Started, Finished), 1)"
  Since: "days(Finished, today())"
columns: [Book, Pages, Days, Pace, Since]
sort: -Pace
```

## Backticks

A column called `Pages read` needs backticks.

| Week | Pages read | Goal |
| --- | --- | --- |
| W38 | 140 | 200 |
| W39 | 210 | 200 |
| W40 | 95 | 200 |

^weeks

```viz table title="Against the weekly goal"
source: ^weeks
compute: { Done: "round(`Pages read` / Goal * 100)", Missing: "max(Goal - `Pages read`, 0)" }
```
