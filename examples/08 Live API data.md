---
type: showcase
tags: [prism, example, online]
status: done
date: 2026-10-08
city: Heidelberg
lat: 49.41
lon: 8.69
repo: floorianmb/prism-viz
---
# Live API data

Blocks can load live data from public web APIs with `prism.http.json()`. Requests are sent by Obsidian itself, so there are no CORS problems. This note uses two key-less APIs: the GitHub REST API (this plugin's own repository) and Open-Meteo (a weather forecast). The repository and the city come from this note's frontmatter, so change `repo`, `city`, `lat` and `lon` above and the blocks follow.

> [!warning] Two things have to be true before data appears
> 1. Open **Settings → Prism → Online access** and switch on **API requests**. It is off by default, and only you can turn it on.
> 2. By default Prism asks first: click **Run requests** below a block to send its requests (once per render). You can change this in the same settings section.
>
> Per block, Prism sends at most 60 requests per minute and 4 at a time, waits at most 30 s and accepts responses up to 10 MB. Both blocks here send two requests or fewer and cache the result, so they stay far below that.

Each block shows a status line that tells you which state it is in: **off** (setting disabled), **waiting** (for your click), **loading**, **error** (with the message) or **data**. The last good result is stored in `prism.state` and shown immediately next time, marked as cached.

## The repository

```viz id=repo title="GitHub repository"
<div class="toolbar">
  <span class="label" id="name"></span>
  <span class="badge" id="status">…</span>
  <button class="chip" id="refresh" style="margin-left:auto">Refresh</button>
</div>
<div class="grid" id="out"></div>
<p class="caption" id="msg"></p>
<script>
const out = document.getElementById("out"), msg = document.getElementById("msg"), badge = document.getElementById("status");
const MAX_AGE = 10 * 60 * 1000;
function setStatus(kind, text) {
  badge.textContent = kind;
  badge.className = "badge " + (kind === "error" ? "error" : kind === "data" || kind === "cached" ? "success" : kind === "off" ? "warning" : "");
  if (text !== undefined) msg.textContent = text;
}
function placeholder() {
  out.innerHTML = "";
  for (const l of ["Stars", "Forks", "Open issues", "Latest release"]) {
    const c = out.appendChild(document.createElement("div"));
    c.className = "card";
    c.innerHTML = '<div class="label"></div><div class="kpi faint">–</div>';
    c.children[0].textContent = l;
  }
}
function show(entry, cached) {
  const { repo, release } = entry.data;
  out.innerHTML = "";
  const items = [
    ["Stars", prism.format(repo.stargazers_count, "integer")],
    ["Forks", prism.format(repo.forks_count, "integer")],
    ["Open issues", prism.format(repo.open_issues_count, "integer")],
    ["Latest release", release ? release.tag_name : "none yet"],
  ];
  for (const [label, value] of items) {
    const c = out.appendChild(document.createElement("div"));
    c.className = "card";
    c.innerHTML = '<div class="label"></div><div class="kpi"></div>';
    c.children[0].textContent = label;
    c.children[1].textContent = value;
  }
  setStatus(cached ? "cached" : "data", "Source: api.github.com · " + new Date(entry.at).toLocaleString(prism.locale) + (cached ? " (cached)" : ""));
}
async function load(force) {
  const fm = (await prism.note()).frontmatter;
  const slug = fm.repo ?? "floorianmb/prism-viz";
  document.getElementById("name").textContent = slug;
  const cached = prism.state.get("cache");
  if (cached && cached.slug === slug) {
    show(cached, true);
    if (!force && Date.now() - cached.at < MAX_AGE) return;
  } else placeholder();
  if (!prism.online.http) {
    setStatus("off", "API requests are off. Enable them in Settings → Prism → Online access → API requests.");
    return;
  }
  if (!(cached && cached.slug === slug) && prism.online.confirm) {
    setStatus("waiting", "Click “Run requests” below this block to load the data.");
  } else setStatus("loading", "Loading from api.github.com …");
  try {
    const base = "https://api.github.com/repos/" + slug;
    const [repo, release] = await Promise.all([
      prism.http.json(base),
      prism.http.json(base + "/releases/latest").catch(() => null), // 404 when there is no release yet
    ]);
    const entry = { at: Date.now(), slug, data: { repo, release } };
    await prism.state.set("cache", entry);
    show(entry, false);
  } catch (err) {
    setStatus("error", "Request failed: " + err.message);
  }
}
document.getElementById("refresh").onclick = () => load(true);
load(false);
</script>
```

GitHub allows 60 unauthenticated requests per hour per IP address. That is why the block keeps its result for ten minutes and only calls again when it is older or you press Refresh.

## The forecast

The same pattern with a Chart.js line chart: hourly temperature for the next two days at the coordinates from the frontmatter.

```viz chart id=forecast title="Temperature forecast"
<div class="toolbar">
  <span class="label" id="place"></span>
  <span class="badge" id="status">…</span>
  <button class="chip" id="refresh" style="margin-left:auto">Refresh</button>
</div>
<div style="height:260px;position:relative"><canvas id="c"></canvas>
  <div id="overlay" class="muted" style="white-space:pre-line;position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:0 24px"></div>
</div>
<p class="caption" id="msg"></p>
<script>
const badge = document.getElementById("status"), msg = document.getElementById("msg"), overlay = document.getElementById("overlay");
const MAX_AGE = 30 * 60 * 1000;
let chart, current = null;
function setStatus(kind, text, big) {
  badge.textContent = kind;
  badge.className = "badge " + (kind === "error" ? "error" : kind === "data" || kind === "cached" ? "success" : kind === "off" ? "warning" : "");
  if (text !== undefined) msg.textContent = text;
  overlay.textContent = big ?? "";
}
function draw() {
  if (!current) return;
  const h = current.data.hourly;
  const color = prism.palette[0];
  const style = getComputedStyle(document.documentElement);
  chart?.destroy();
  chart = new Chart(document.getElementById("c"), {
    type: "line",
    data: {
      labels: h.time,
      datasets: [{ label: "Temperature (°C)", data: h.temperature_2m, borderColor: color, backgroundColor: /^#[0-9a-f]{6}$/i.test(color) ? color + "22" : "transparent", fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2 }],
    },
    options: {
      maintainAspectRatio: false, animation: { duration: 200 },
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: i => new Date(i[0].label).toLocaleString(prism.locale, { weekday: "short", hour: "2-digit", minute: "2-digit" }), label: i => prism.format(i.parsed.y, "number", 1) + " °C" } } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 6, callback(v) { return new Date(this.getLabelForValue(v)).toLocaleDateString(prism.locale, { weekday: "short", day: "numeric" }); } } },
        y: { grid: { color: style.getPropertyValue("--background-modifier-border") }, ticks: { maxTicksLimit: 5, callback: v => v + "°" } },
      },
    },
  });
}
function show(entry, cached) {
  current = entry;
  draw();
  setStatus(cached ? "cached" : "data", "Source: api.open-meteo.com · " + new Date(entry.at).toLocaleString(prism.locale) + (cached ? " (cached)" : ""));
}
async function load(force) {
  const fm = (await prism.note()).frontmatter;
  const lat = fm.lat ?? 49.41, lon = fm.lon ?? 8.69;
  const key = lat + "," + lon;
  document.getElementById("place").textContent = fm.city ?? "Heidelberg";
  const cached = prism.state.get("cache");
  const fresh = cached && cached.key === key;
  if (fresh) {
    show(cached, true);
    if (!force && Date.now() - cached.at < MAX_AGE) return;
  }
  if (!prism.online.http) {
    if (!fresh) setStatus("off", "Source: api.open-meteo.com", "Live data is off.\nEnable Settings → Prism → Online access → API requests.");
    else setStatus("off", "API requests are off – showing the cached forecast from " + new Date(cached.at).toLocaleString(prism.locale) + ".");
    return;
  }
  if (!fresh && prism.online.confirm) setStatus("waiting", "Source: api.open-meteo.com", "Click “Run requests” below this block.");
  else setStatus("loading", "Loading from api.open-meteo.com …", fresh ? "" : "Loading …");
  let entry;
  try {
    const data = await prism.http.json("https://api.open-meteo.com/v1/forecast", {
      query: { latitude: lat, longitude: lon, hourly: "temperature_2m", forecast_days: 2, timezone: "auto" },
    });
    entry = { at: Date.now(), key, data };
    await prism.state.set("cache", entry);
  } catch (err) {
    setStatus("error", "Request failed: " + err.message, fresh ? "" : "Could not load the forecast.");
    return;
  }
  show(entry, false);
}
document.getElementById("refresh").onclick = () => load(true);
prism.onTheme(draw);
load(false);
</script>
```

The response is only used for display, nothing is written to your vault. If a block shows **error**, the message under it is the one Prism got back (no network, a blocked host, a non-2xx status or a timeout).
