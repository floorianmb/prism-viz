---
type: showcase
tags: [prism, example, bases]
status: done
date: 2026-10-18
---
# Bases calendar and map

The **Prism chart** view for Bases (see [[14 Bases chart]]) has two more chart types: **Calendar** and **Map**. This is [[Notes calendar.base]] embedded: every note of the `Notes` folder on the day of its `date` property.

![[Notes calendar.base]]

The base has two views (the tabs above the chart). The second one groups the same notes by date as a bar chart, so you can compare the types.

## Switch the chart type

1. Open the base, click the view's name, then *Configure view*.
2. Set **Chart type** to *Calendar*. **Group by** must be a date property such as `date`; days without a date are skipped. A click on a day opens its note.
3. With a **Value** property and an aggregate (sum, average, min, max) the days are colored by the value instead of the note count.

## Map

Set **Chart type** to *Map* to color regions by value:

- **Group by**: a property with region names, for example `country`.
- **GeoJSON file**: for example `data/europe.geojson` (needs `data` under *Settings → Prism → Data folders*, see [[20 Map]]).
- **Region property** (optional): which GeoJSON property holds the names. Leave it empty for `name`; use `iso` if your notes hold two-letter codes.

The sample notes have no country property, so this vault ships no map view. Add `country: Portugal` to a few notes and the view is stored in the base like this:

```yaml
  - type: prism-chart
    name: Notes per country
    chartType: map
    x: note.country
    geo: data/europe.geojson
    geoKey: name
```

> [!note] Not covered by the command-line render
> Bases views are drawn by Obsidian itself, so look at them in the app.
