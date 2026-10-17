---
type: showcase
tags: [prism, example, no-code]
status: done
date: 2026-10-18
---
# Map

Days spent per country, from the table below, on the countries of [data/europe.geojson](data/europe.geojson) (Natural Earth, public domain). Needs `data` under *Settings → Prism → Data folders*.

| Country | Days |
| --- | --- |
| Portugal | 9 |
| Spain | 4 |
| France | 6 |
| Germany | 21 |
| Italy | 12 |
| Greece | 7 |
| Norway | 5 |

^trips

```viz chart title="Days per country – click a country to filter"
type: map
geo: data/europe.geojson
source: ^trips
x: Country
y: Days
select: country
```

```viz table title="Trips"
source: ^trips
filter: { Country: $shared.country }
```
