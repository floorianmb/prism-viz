# Periods, goals and computed columns

Three keys for declarative charts (` ```viz chart `). `compute` also works in ` ```viz table `.

```viz chart title="Notes per month"
type: bar
source: notes
x: modified
group: month
limit: 12
goal: 20
```

## `group: day | week | month | quarter | year`

`group` turns the dates in `x` into periods. The values of `x` must start with `YYYY-MM-DD` (`2026-10-18T09:00` is fine).

| group | label |
| --- | --- |
| `day` | `2026-10-18` |
| `week` | `2026-W42` (ISO week, Monday first) |
| `month` | `2026-10` |
| `quarter` | `2026-Q4` |
| `year` | `2026` |

- Without `aggregate`, the values are summed when `y` is given and the rows are counted when it is not. `aggregate: avg | min | max` work too.
- Rows are sorted by period. Periods without rows are filled in: 0 for count and sum, empty for avg, min and max. With `series`, nothing is filled in.
- `limit: N` keeps the **last** N periods. With `sort` set, `limit` works as before (the first N rows of that order).
- Rows whose `x` is not a date are left out. A warning says how many.
- The labels are plain text, so `filter`, `select` and `$shared` work with them.
- `group` does not apply to `calendar`, `map`, `graph`, `sankey` and `timeline`. With `type: kpi` it picks the period for the trend, see [`new-chart-types.md`](new-chart-types.md).

## Reference lines: `lines` and `goal`

```yaml
lines:
  - { y: 30, label: Minimum, color: red }
  - { x: 2026-Q3, label: Launch }
goal: 40
```

- `y` draws a line at a value of the value axis. `x` draws a line at a label of the other axis (it must be one of the labels).
- `goal: 40` is the short form of `{ y: 40, label: Goal }` ("Ziel" in German). A label of your own overrides the default.
- `color` is a CSS color. Default: the muted text color. Lines are dashed.
- Works for `bar`, `hbar`, `line`, `area`, `scatter` and `bubble`. The value axis grows so that every line is visible. Other types report a warning.
- With `type: kpi`, `goal` is a progress bar instead.

## `compute`

New columns, calculated per row, before `filter`, `group`, `sort` and `format`:

```viz chart title="Pages per day"
type: bar
source: ^books
x: title
y: pace
compute:
  days: "days(started, finished)"
  pace: "round(pages / days, 1)"
```

- Computed columns come after the data columns. A later expression can use an earlier one.
- Operators: `+ - * / %`, unary `-`, parentheses. Numbers, `"text"` and column names. Put names with spaces or special characters in backticks.
- Functions: `round(x, digits)`, `floor(x)`, `ceil(x)`, `abs(x)`, `min(a, b, …)`, `max(a, b, …)`, `days(from, to)` (days from the first date to the second, dates as `YYYY-MM-DD`) and `today()` (the local date).
- A missing or non-numeric value gives an empty cell, as does a division by zero. `true` and `false` count as 1 and 0.
- A column that does not exist, or a syntax error, is reported as an error with the name of the computed column.
- There is no `eval`: the expression is parsed by Prism, and nothing else can run.
- A value in `compute` that is not text (`flag: 1`) is a constant.
- The same key works in tables: `compute: { total: "price * amount" }` and then `format: { total: eur }`.
