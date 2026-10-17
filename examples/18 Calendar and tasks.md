---
type: showcase
tags: [prism, example, no-code]
status: done
date: 2026-10-18
---
# Calendar and tasks

Two things that needed JavaScript before: a calendar of days, and charts over the tasks in your notes. Both are a few lines of YAML now.

## Notes per day

Each note of the vault on the day in its `date` property. Click a day to open its note; hover for a preview.

```viz chart title="Notes per day"
type: calendar
source: notes
x: date
```

## Open tasks per note

`source: tasks` gives one row per task, with its note, dates and priority.

```viz chart title="Open tasks per note"
type: hbar
source: tasks
folder: Notes
filter: { done: false }
x: note
aggregate: count
sort: -count
```

## Tasks done per day

The ✅ dates of the Tasks plugin, as a calendar.

```viz chart title="Tasks done per day"
type: calendar
source: tasks
filter: { done: true }
x: doneDate
```

## Due next

```viz table title="Open tasks with a due date"
source: tasks
folder: Notes
filter: { done: false }
columns: [text, due, priority, note]
sort: due
```
