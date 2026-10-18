# Calendars and maps

Two chart types that Prism draws itself as SVG, in the same ` ```viz chart ` YAML as the other charts. Both use five shades of the theme's first palette color with a small legend, follow light and dark mode and size themselves to the note column.

## `type: calendar`

One cell per day, a row per weekday (Monday first) and a strip per year, like a contribution graph.

```viz chart title="Mood per day"
type: calendar
source: notes
folder: Journal
y: mood
```

- `x` is the date column: values that start with `YYYY-MM-DD` (`2026-10-18`, `2026-10-18T09:00`, `2026-10-18 Sat`). The default is the first column, which with `source: notes` is the note title, so daily notes named by date work without `x`.
- Value per day: without `y` the number of rows (notes, tasks) of that day; with `y` their sum, or `aggregate: avg | min | max`. Booleans count as 1 and 0, so `y: sport` marks the days with `sport: true`.
- Days without a value stay grey. Rows whose `x` is not a date are skipped; if none is a date, the block says so.
- With a `path` column (`source: notes` or `source: tasks`) a click on a day opens its note, and hovering shows Obsidian's page preview.
- The years that have data are shown, at most the last 10.

## `type: map`

Regions of a GeoJSON file, colored by value:

```viz chart title="Days per country"
type: map
geo: data/europe.geojson
source: ^trips
x: country
y: days
```

- `geo` is a GeoJSON data file (`.geojson` or `.json`, FeatureCollection, Feature or geometry). Prism reads it like `prism.data`, so its folder must be listed under *Settings → Prism → Data folders*. Polygon and MultiPolygon features are drawn; points and lines are skipped.
- Prism ships no map data. Any GeoJSON of countries, states or districts works, for example from [Natural Earth](https://www.naturalearthdata.com/) (public domain).
- `x` holds the region names or codes. Prism compares them (ignoring case) with every feature property and uses the one with the most matches; `geoKey: ISO_A2` picks a property yourself. Values without a region are listed in a warning.
- The value is the number of rows per region, or the sum of `y` (`aggregate` as for calendars). Regions without a value stay grey.
- Web Mercator projection, fitted to the regions in the file.

## Interaction and export

- `select: <key>` makes days and regions clickable for a cross-filter, see [`cross-filter.md`](cross-filter.md).
- The chart is one tab stop: arrow keys move between the days or regions with data, Enter opens or selects.
- Block menu → *Export CSV* saves the values per day or region.
- In HTML blocks: `await prism.chart(container, { type: "calendar", … })` returns the container. The calendar and map need no library keyword.

## In Bases

The "Prism chart" view of a `.base` file has **Calendar** and **Map** in its chart type list.

- **Calendar**: the group-by property is the date (a date property, or text starting with `YYYY-MM-DD`; other dates are parsed, and values that are no date are left out). The value is the number of notes per day, or with a value property its aggregate (`sum`, `avg`, `min`, `max`). A click on a day opens its note.
- **Map**: the group-by property holds the region names or codes. Set *GeoJSON file (map)* to a data file such as `data/europe.geojson`, and optionally *Region property (map, optional)* (`geoKey`). Same rules as `type: map`; the file's folder must be a data folder.
- The view builds the same spec as a `viz chart` block would; limit and sort do not apply to the calendar and map.
- Click to source: calendar days from note tables and notes open the note or jump to the table row, see [`cross-filter.md`](cross-filter.md).
