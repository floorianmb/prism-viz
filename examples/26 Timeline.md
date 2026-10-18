---
type: showcase
tags: [prism, example, no-code]
status: done
date: 2026-10-18
---
# Timeline

`type: timeline` draws a Gantt chart: a bar from `start` to `end` (the end day included), a diamond when a row has only one date. A line marks today.

## A project plan from a table

Rows with one date are milestones. `series` colors the bars by team.

| Task | Start | End | Team |
| --- | --- | --- | --- |
| Requirements | 2026-09-01 | 2026-09-18 | Product |
| Design | 2026-09-14 | 2026-10-02 | Design |
| Backend | 2026-09-28 | 2026-11-06 | Engineering |
| Frontend | 2026-10-05 | 2026-11-13 | Engineering |
| Beta | 2026-11-09 | 2026-11-27 | Product |
| Design freeze | 2026-10-02 | | Design |
| Launch | 2026-12-01 | | Product |

^plan

```viz chart title="Project plan"
type: timeline
source: ^plan
x: Task
start: Start
end: End
series: Team
```

## Variant: sorted and limited

The same plan with the longest running items last.

```viz chart title="First five by end date"
type: timeline
source: ^plan
x: Task
start: Start
end: End
sort: End
limit: 5
```

## From tasks

`source: tasks` has the columns `start` (🛫), `scheduled` (⏳) and `due` (📅). These tasks live in this note.

- [ ] Draft the outline 🛫 2026-10-12 📅 2026-10-16
- [ ] Write the examples 🛫 2026-10-15 ⏳ 2026-10-17 📅 2026-10-25
- [ ] Review with the team 🛫 2026-10-24 📅 2026-10-30
- [ ] Publish the release notes 📅 2026-11-02
- [x] Collect feedback 🛫 2026-10-05 📅 2026-10-11 ✅ 2026-10-10

```viz chart title="Tasks of this note"
type: timeline
source: tasks
filter: { note: "26 Timeline" }
x: text
start: start
end: due
```
