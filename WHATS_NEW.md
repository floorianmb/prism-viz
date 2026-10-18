# What's new in Prism 0.8

Prism 0.8 turns more of your notes into pictures: big numbers, timelines, flows, link networks and goals, each from a few lines of YAML and no code. Everything on this page is live, drawn by the version you just installed; hover the charts. The examples follow one made-up year: training for a half marathon in Lisbon, a reading list and a monthly budget.

You can also send me an email at ✉️ **[florianmeyerb@gmail.com](mailto:florianmeyerb@gmail.com)** or open an issue on [GitHub](https://github.com/floorianmb/prism-viz) if you have any ideas for new features or bug fixes.

## Your numbers at a glance

`type: kpi` turns a column into a big number. Add a date column and a period, and each tile shows this month, the change to last month and a small trend line. A `goal` adds a progress bar.

```viz
<!-- prism: title="This month" -->
<div class="kpis"><div id="km"></div><div id="pages"></div><div id="saved"></div></div>
<style>
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.kpis>div,.kpis .prism-svgchart,.kpis .prism-kpi-grid,.kpis .prism-kpi-tile{height:100%;box-sizing:border-box}
</style>
<script>
// A sample journal, one row per day up to the end of this month, so the tiles always show the current month.
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const now = new Date();
const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
const day = new Date(now.getFullYear(), now.getMonth() - 6, 1);
const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
const saved = [180, 210, 160, 250, 230, 240, 270];
const rows = [];
for (let i = 0; day <= end; i++, day.setDate(day.getDate() + 1)) {
  const w = Math.max(0, Math.ceil(Math.round((monday - day) / 864e5) / 7));
  const week = Math.max(8, (41 - 1.7 * w + [0, 2.5, -1.5, 3, -2.5, 1][w % 6]) * (w % 4 === 2 ? 0.65 : 1));
  const share = { 2: 0.3, 4: 0.25, 0: 0.45 }[day.getDay()] ?? 0;
  const month = day.getMonth() - now.getMonth() + 12 * (day.getFullYear() - now.getFullYear()) + 6;
  rows.push({ Date: iso(day), "Km run": Math.round(week * share * 10) / 10, "Pages read": [0, 24, 35, 12, 41, 18, 52][i % 7], Saved: day.getDate() === 1 ? saved[month] : 0 });
}
prism.chart("#km", { type: "kpi", rows, x: "Date", y: "Km run", group: "month" });
prism.chart("#pages", { type: "kpi", rows, x: "Date", y: "Pages read", group: "month" });
prism.chart("#saved", { type: "kpi", rows, x: "Date", y: "Saved", group: "month", goal: 300, format: "eur" });
</script>
```

```yaml
type: kpi
source: notes        # your daily notes with km and pages properties
folder: Journal
x: date
y: [km, pages]
group: month         # this month, change and trend
```

## Plans on a timeline

`type: timeline` draws a Gantt chart from a start and an end date: from a table, from your tasks (🛫 ⏳ 📅) or from note properties. One date makes a milestone, done items fade, and a dashed line marks today.

```viz
<!-- prism: title="Road to the Lisbon half marathon" -->
<div id="plan"></div>
<script>
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const at = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return iso(d); };
const rows = [
  ["Base building", -45, -18, "Training", true],
  ["Book flights", -32, null, "Trip", true],
  ["Speed work", -21, 8, "Training"],
  ["New running shoes", -6, null, "Training"],
  ["Long runs", 2, 34, "Training"],
  ["Hotel and race kit", 14, 24, "Trip"],
  ["Taper", 35, 47, "Training"],
  ["Lisbon Half Marathon", 48, null, "Race"],
  ["Recovery week", 49, 56, "Training"],
].map(([Task, from, to, Area, done]) => ({ Task, Start: at(from), End: to === null ? null : at(to), Area, done: !!done }));
prism.chart("#plan", { type: "timeline", rows, x: "Task", start: "Start", end: "End", series: "Area" });
</script>
```

```yaml
type: timeline
source: tasks        # or a table: source: ^plan
folder: Running
start: start
end: due
series: note
```

## Where the money goes

`type: sankey` shows flows: income into categories and on into the details. The width of a band is its amount; hover one to follow it.

```viz
# <!-- prism: chart title="A month of money" -->
type: sankey
y: amount
height: 380
rows:
  - { from: Salary, to: Budget, amount: 3800 }
  - { from: Side gig, to: Budget, amount: 600 }
  - { from: Budget, to: Home, amount: 1450 }
  - { from: Budget, to: Food, amount: 620 }
  - { from: Budget, to: Getting around, amount: 230 }
  - { from: Budget, to: Fun, amount: 700 }
  - { from: Budget, to: Savings, amount: 1400 }
  - { from: Home, to: Rent, amount: 1150 }
  - { from: Home, to: Energy and internet, amount: 300 }
  - { from: Food, to: Groceries, amount: 440 }
  - { from: Food, to: Eating out, amount: 180 }
  - { from: Savings, to: Emergency fund, amount: 600 }
  - { from: Savings, to: Lisbon trip, amount: 400 }
  - { from: Savings, to: Index fund, amount: 400 }
```

```yaml
type: sankey
source: ^budget      # a table: from, to, amount
y: amount
```

## How your notes connect

`source: links` gives one row per link between your notes, and `type: graph` draws them as a network. Bigger dots have more links, colors are folders, hollow dots are notes you have linked but not written yet. Hover a dot to see its neighbors; in your vault a click opens the note.

```viz
# <!-- prism: chart title="A few notes and their links" -->
type: graph
rows:
  - { from: Half marathon, fromPath: Running/Half marathon.md, to: Training plan, toPath: Running/Training plan.md }
  - { from: Half marathon, fromPath: Running/Half marathon.md, to: Running shoes, toPath: Running/Running shoes.md }
  - { from: Half marathon, fromPath: Running/Half marathon.md, to: Lisbon trip, toPath: Travel/Lisbon trip.md }
  - { from: Half marathon, fromPath: Running/Half marathon.md, to: Marathon 2027 }
  - { from: Training plan, fromPath: Running/Training plan.md, to: Long run log, toPath: Running/Long run log.md }
  - { from: Training plan, fromPath: Running/Training plan.md, to: Atomic Habits, toPath: Reading/Atomic Habits.md }
  - { from: Long run log, fromPath: Running/Long run log.md, to: Running shoes, toPath: Running/Running shoes.md }
  - { from: Reading list, fromPath: Reading/Reading list.md, to: Born to Run, toPath: Reading/Born to Run.md }
  - { from: Reading list, fromPath: Reading/Reading list.md, to: Atomic Habits, toPath: Reading/Atomic Habits.md }
  - { from: Reading list, fromPath: Reading/Reading list.md, to: Deep Work, toPath: Reading/Deep Work.md }
  - { from: Reading list, fromPath: Reading/Reading list.md, to: Project Hail Mary, toPath: Reading/Project Hail Mary.md }
  - { from: Born to Run, fromPath: Reading/Born to Run.md, to: Half marathon, toPath: Running/Half marathon.md }
  - { from: Budget 2026, fromPath: Money/Budget 2026.md, to: Savings, toPath: Money/Savings.md }
  - { from: Budget 2026, fromPath: Money/Budget 2026.md, to: Running shoes, toPath: Running/Running shoes.md }
  - { from: Savings, fromPath: Money/Savings.md, to: Lisbon trip, toPath: Travel/Lisbon trip.md }
  - { from: Lisbon trip, fromPath: Travel/Lisbon trip.md, to: Packing list, toPath: Travel/Packing list.md }
  - { from: Lisbon trip, fromPath: Travel/Lisbon trip.md, to: Flights, toPath: Travel/Flights.md }
  - { from: Lisbon trip, fromPath: Travel/Lisbon trip.md, to: Restaurants to try }
```

```yaml
type: graph
source: links
folder: Running      # leave it out for the whole vault
```

## Weeks, months and goals

`group: week` adds up dated rows per period (also `day`, `month`, `quarter`, `year`), so a daily log becomes kilometers per week, empty weeks included. `goal: 30` draws the target into the chart.

```viz
<!-- prism: chart title="Kilometers per week" -->
<div id="c"></div>
<script>
// The same sample journal as the tiles above: the last twelve weeks, up to the end of this week.
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const now = new Date();
const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * 11);
const end = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
const rows = [];
for (; day <= end; day.setDate(day.getDate() + 1)) {
  const w = Math.max(0, Math.ceil(Math.round((monday - day) / 864e5) / 7));
  const week = Math.max(8, (41 - 1.7 * w + [0, 2.5, -1.5, 3, -2.5, 1][w % 6]) * (w % 4 === 2 ? 0.65 : 1));
  const share = { 2: 0.3, 4: 0.25, 0: 0.45 }[day.getDay()] ?? 0;
  if (share) rows.push({ Date: iso(day), Km: Math.round(week * share * 10) / 10 });
}
// Draw after the first layout, so Chart.js sees the width of the block.
requestAnimationFrame(() => prism.chart("#c", {
  type: "bar", rows, x: "Date", y: "Km", group: "week", goal: 30, height: 260,
  options: { scales: { x: { grid: { display: false }, ticks: { callback(v) { return this.getLabelForValue(v).slice(5); } } } } },
}));
</script>
```

```yaml
type: bar
source: notes
folder: Journal
x: date
y: km
group: week
goal: 30             # or lines: [{ y: 30, label: Minimum }]
```

## And a few smaller things

**Computed columns.** `compute` adds a column from a formula, in charts and tables: pages per day from the pages and two dates, for example.

```viz
# <!-- prism: table title="Reading pace" -->
rows:
  - { Book: Born to Run, Pages: 287, Started: "2026-07-02", Finished: "2026-07-11" }
  - { Book: Atomic Habits, Pages: 320, Started: "2026-07-14", Finished: "2026-07-30" }
  - { Book: Project Hail Mary, Pages: 476, Started: "2026-08-03", Finished: "2026-08-15" }
  - { Book: Deep Work, Pages: 296, Started: "2026-08-20", Finished: "2026-09-12" }
compute:
  Days: "days(Started, Finished)"
  Pages per day: "round(Pages / Days, 1)"
columns: [Book, Pages, Days, { key: Pages per day, format: number, digits: 1 }]
sort: -Pages per day
```

```yaml
compute:
  Days: "days(Started, Finished)"
  Pages per day: "round(Pages / Days, 1)"
```

**Click to source.** A click on a bar, slice or day opens what is behind it: the row of the table in your note lights up, or the note (or task) opens. Charts with `select` keep filtering instead.

**Calendar and map in Bases.** The *Prism chart* view of a base now has the chart types *Calendar* and *Map*: your notes on the days of a date property, or regions colored from a GeoJSON file.

**Check blocks without Obsidian.** `--lint` finds YAML errors, unknown keys and missing columns in a second, before your agent renders the note:

```bash
node .obsidian/plugins/prism-viz/scripts/prism-render.mjs --lint "My note.md"
```

## Try it

The example vault has one note per feature: [notes 22 to 31](https://github.com/floorianmb/prism-viz/tree/main/examples). Update the agent skill below so your agent knows the new keys, and find every detail in the changelog further down.
