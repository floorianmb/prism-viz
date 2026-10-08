---
type: showcase
tags: [prism, example, math]
status: done
date: 2026-10-04
---
# Formulas

Formulas are rendered offline with KaTeX, including chemistry through `\ce{}`.

```viz math title="A few favourites"
$$e^{i\pi}+1=0$$

$$\int_{-\infty}^{\infty} e^{-x^2}\,dx=\sqrt{\pi}$$

$$\sum_{n=1}^{\infty}\frac{1}{n^2}=\frac{\pi^2}{6}$$

$$\ce{2H2 + O2 -> 2H2O}$$
```

## Explore: compound interest

Start with 5,000 and add 200 every month. With annual rate $r$ and $t$ years, the balance is:

```viz math
FV = P\left(1+\frac{r}{12}\right)^{12t} + \mathrm{PMT}\cdot\frac{\left(1+\frac{r}{12}\right)^{12t}-1}{r/12}
```

Drag the slider and watch how much of the final balance is growth rather than deposits.

```viz id=controls
<div class="toolbar">
  <label for="rate">Annual return <b id="out"></b></label>
  <input type="range" id="rate" min="0" max="12" step="0.5" style="flex:1;min-width:160px">
</div>
<script>
prism.shared.bind("#rate", "rate", 5, v => {
  document.getElementById("out").textContent = prism.format(Number(v), "number", 1) + " %";
});
</script>
```

```viz chart id=growth height=380
<div id="sum" class="row" style="justify-content:space-between;font-size:var(--font-ui-small);color:var(--text-muted);margin-bottom:6px"></div>
<div style="height:290px"><canvas id="c"></canvas></div>
<p class="caption">Assumes monthly compounding, 5,000 up front and 200 deposited every month. A model, not advice.</p>
<script>
const PV = 5000, PMT = 200, YEARS = 30;
const money = new Intl.NumberFormat(prism.locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const short = new Intl.NumberFormat(prism.locale, { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
function model(rate) {
  const i = rate / 100 / 12, balance = [], deposits = [];
  for (let y = 0; y <= YEARS; y++) {
    const n = 12 * y, g = Math.pow(1 + i, n);
    balance.push(PV * g + PMT * (i ? (g - 1) / i : n));
    deposits.push(PV + PMT * n);
  }
  return { balance, deposits };
}
const ceiling = Math.ceil(model(12).balance[YEARS] / 100000) * 100000;
let chart;
function draw() {
  const rate = Number(prism.shared.get("rate", 5));
  const { balance, deposits } = model(rate);
  const end = balance[YEARS], put = deposits[YEARS];
  document.getElementById("sum").innerHTML = "";
  for (const [k, v] of [["After 30 years", money.format(end)], ["Deposited", money.format(put)], ["Growth", money.format(end - put)]]) {
    const s = document.createElement("span");
    s.append(k + " ");
    s.append(Object.assign(document.createElement("b"), { textContent: v, style: "color:var(--text-normal)" }));
    document.getElementById("sum").append(s);
  }
  const labels = balance.map((_, y) => y);
  if (!chart) {
    chart = new Chart(document.getElementById("c"), {
      type: "line",
      data: { labels, datasets: [
        { label: "Balance", data: balance, pointRadius: 0, borderWidth: 3, tension: 0.25 },
        { label: "Deposits only", data: deposits, pointRadius: 0, borderWidth: 2, borderDash: [5, 4] },
      ] },
      options: {
        maintainAspectRatio: false, animation: { duration: 150 },
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "top", align: "end", labels: { usePointStyle: true, boxWidth: 8 } },
                   tooltip: { callbacks: { title: i => "Year " + i[0].label, label: c => c.dataset.label + ": " + money.format(c.parsed.y) } } },
        scales: { x: { grid: { display: false }, title: { display: true, text: "Years" } },
                  y: { min: 0, max: ceiling, ticks: { callback: v => short.format(v), maxTicksLimit: 6 } } },
      },
    });
  }
  chart.data.datasets[0].data = balance;
  chart.data.datasets[1].data = deposits;
  chart.data.datasets[1].borderColor = prism.color("--text-faint");
  chart.update();
}
draw();
prism.shared.onChange(draw);
prism.onTheme(draw);
</script>
```
