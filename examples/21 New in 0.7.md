---
type: showcase
tags: [prism, example, no-code]
status: done
date: 2026-10-18
---
# New in 0.7

All new features of Prism 0.7 in one note, without JavaScript. The data is in this note, so every block works on its own.

## Calendar from a table

Workouts per day from the table below. Days without an entry stay grey.

| Date | Minutes | Sport |
| --- | --- | --- |
| 2026-09-01 | 30 | Run |
| 2026-09-03 | 45 | Bike |
| 2026-09-04 | 20 | Run |
| 2026-09-08 | 60 | Swim |
| 2026-09-10 | 35 | Run |
| 2026-09-15 | 50 | Bike |
| 2026-09-16 | 25 | Run |
| 2026-09-22 | 40 | Swim |
| 2026-09-29 | 30 | Run |
| 2026-10-01 | 55 | Bike |
| 2026-10-02 | 20 | Run |
| 2026-10-06 | 45 | Swim |
| 2026-10-09 | 30 | Run |
| 2026-10-13 | 65 | Bike |
| 2026-10-15 | 30 | Run |
| 2026-10-17 | 40 | Swim |

^workouts

```viz chart title="Workout minutes per day"
type: calendar
source: ^workouts
x: Date
y: Minutes
```

## Calendar from notes

Every note of the vault on the day of its `date` property. A click opens the note.

```viz chart title="Notes per day"
type: calendar
source: notes
x: date
```

## Tasks across notes

- [ ] Try the calendar with daily notes 🔼 📅 2026-10-20
- [ ] Export a chart as CSV 📅 2026-10-22
- [x] Read the 0.7 changelog ✅ 2026-10-18

```viz chart title="Open tasks per note"
type: hbar
source: tasks
filter: { done: false }
x: note
aggregate: count
sort: -count
limit: 10
```

```viz chart title="Tasks done per day"
type: calendar
source: tasks
filter: { done: true }
x: doneDate
```

## Cross-filter

Click a sport in the doughnut: the table and the bar chart show only its workouts. Click it again to show all.

```viz chart title="Workouts per sport – click to filter"
type: doughnut
source: ^workouts
x: Sport
aggregate: count
select: sport
```

```viz table title="Workouts"
source: ^workouts
filter: { Sport: $shared.sport }
sort: -Date
```

```viz chart title="Minutes"
type: bar
source: ^workouts
filter: { Sport: $shared.sport }
x: Date
y: Minutes
```

## Map

Days per country on the countries of [data/europe.geojson](data/europe.geojson). Click a country to filter the table.

| Country | Days |
| --- | --- |
| Portugal | 9 |
| Spain | 4 |
| France | 6 |
| Germany | 21 |
| Italy | 12 |
| Greece | 7 |
| Norway | 5 |

^countries

```viz chart title="Days per country"
type: map
geo: data/europe.geojson
source: ^countries
x: Country
y: Days
select: country
```

```viz table title="Countries"
source: ^countries
filter: { Country: $shared.country }
```

## CSV export and render check

- Block menu (⋯) of any chart or table above → *Export CSV* saves the numbers next to this note.
- `node .obsidian/plugins/prism-viz/scripts/prism-render.mjs "21 New in 0.7.md"` prints `change` for blocks that were rendered before.
