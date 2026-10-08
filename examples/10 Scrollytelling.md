---
type: showcase
tags: [prism, example, scrollytelling]
status: done
date: 2026-10-08
---
# Scrollytelling

A block can follow the text around it. `prism.onSection(cb)` reports the heading the reader is currently at, and the block redraws for that step. Scroll down: the chart below changes with each "Step" heading. The numbers are a simple model of how memory fades, the idea behind [[Spaced repetition]].

```viz chart id=story title="Remembered share of a new fact"
<div class="toolbar"><span class="label" id="step">Step 1</span><span class="muted" id="hint"></span></div>
<div style="height:260px"><canvas id="c"></canvas></div>
<p class="caption">Model: memory decays as exp(-t / S); every review multiplies the stability S by 2.5 and resets the curve to 100 %.</p>
<script>
const REVIEWS = [1, 3, 7, 14];
const HINTS = ["No review: after a week little is left.", "One review on day 1 flattens the curve.", "Reviews on days 1, 3 and 7 keep it above 60 %.", "Four reviews: one minute each, and it lasts for months."];
const days = Array.from({ length: 61 }, (_, i) => i / 2);
function curve(n) {
  const marks = REVIEWS.slice(0, n);
  return days.map(t => {
    let start = 0, s = 2;
    for (const r of marks) if (t >= r) { start = r; s *= 2.5; }
    return Math.round(100 * Math.exp(-(t - start) / s));
  });
}
const chart = new Chart(document.getElementById("c"), {
  type: "line",
  data: { labels: days, datasets: [
    { label: "Remembered", data: curve(0), borderWidth: 2.5, pointRadius: 0, fill: true, tension: 0 },
    { label: "Review", data: days.map(() => null), showLine: false, pointRadius: 6, pointStyle: "rectRot" },
  ] },
  options: {
    maintainAspectRatio: false, animation: { duration: prism.reducedMotion ? 0 : 400 },
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { callback: (v, i) => (days[i] % 5 === 0 ? days[i] : ""), maxRotation: 0 }, title: { display: true, text: "Days" } },
      y: { min: 0, max: 100, ticks: { callback: v => v + " %" } },
    },
  },
});
function show(n, mode) {
  const marks = REVIEWS.slice(0, n);
  chart.data.datasets[0].data = curve(n);
  chart.data.datasets[1].data = days.map(t => (marks.includes(t) ? 100 : null));
  chart.update(mode);
  document.getElementById("step").textContent = "Step " + (n + 1);
  document.getElementById("hint").textContent = HINTS[n];
}
show(0, "none");
prism.onSection(s => {
  const m = s && /Step\s+(\d)/i.exec(s.heading);
  if (m) show(Math.min(REVIEWS.length, Number(m[1]) - 1));
});
</script>
```

## Step 1: Learn something new

You read a fact once. Within a day more than half of it is gone, and after a week almost nothing is left. This is the forgetting curve, and it is the line in the chart above.

Keep scrolling. The block stays at the top of its note column while the story moves on.

## Step 2: Review it once

A single repetition on day 1 restarts the curve, and it restarts it with a gentler slope. The diamond marks the moment of the review.

The cost is a few seconds, the gain is days of memory.

## Step 3: Space the next reviews

Review again on day 3 and day 7. Each time the interval can grow because the memory is more stable. The curve now stays high for the whole first week.

## Step 4: A handful of reviews is enough

After the fourth review on day 14 the curve is nearly flat over the month shown. That is the whole trick of spaced repetition: few reviews, placed late enough to be effort, early enough to catch the fade.

> [!tip] How it works
> The block listens with `prism.onSection(s => ...)` and reads `s.heading`. In a command-line render the section is `null`, so the block draws step 1 first.
