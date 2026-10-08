---
type: showcase
tags: [prism, example, animation]
status: done
date: 2026-10-06
---
# Animated scene

`prism.canvas` gives a crisp canvas that follows its container, and `prism.animate` drives it with real elapsed time. It pauses when scrolled off screen and starts paused if your system asks for reduced motion (press play to run it anyway).

```viz id=scene title="Phase wave"
<div class="toolbar">
  <div id="mode"></div>
  <button class="icon-button" id="pp" aria-label="Play or pause"><svg viewBox="0 0 16 16" id="ico"></svg></button>
</div>
<div class="stage" id="stage">
  <div class="hud"><span>t <b id="t">0.0</b> s</span><span>72 dots</span></div>
</div>
<p class="caption">Each dot follows the same sine wave, shifted by its position. Switch to the ring to see the same phase shift bent into a circle.</p>
<style>.hud { z-index: 1 }</style>
<script>
const N = 72;
let mode = "Wave", loop;
const scene = prism.canvas(document.getElementById("stage"));
prism.segmented(document.getElementById("mode"), ["Wave", "Ring"], { key: "mode", value: "Wave", onChange(v) { mode = v; loop?.redraw(); } });

loop = prism.animate((dt, t) => {
  const { ctx, width: w, height: h } = scene;
  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1), phase = t * 1.1 + u * Math.PI * 4;
    let x, y;
    if (mode === "Wave") {
      x = w * (0.06 + 0.88 * u);
      y = h * 0.47 + Math.sin(phase) * h * 0.26 * (0.35 + 0.65 * Math.sin(Math.PI * u));
    } else {
      const a = u * Math.PI * 2 + t * 0.3, r = Math.min(w, h) * (0.29 + 0.07 * Math.sin(phase));
      x = w / 2 + Math.cos(a) * r * 1.35;
      y = h * 0.47 + Math.sin(a) * r;
    }
    const size = 3 + 2.4 * (0.5 + 0.5 * Math.cos(phase));
    const hue = 205 + u * 150;
    ctx.fillStyle = `oklch(0.75 0.15 ${hue} / 0.14)`;
    ctx.beginPath(); ctx.arc(x, y, size * 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `oklch(0.86 0.13 ${hue} / 0.95)`;
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  document.getElementById("t").textContent = t.toFixed(1);
}, { autoplay: true });

scene.onResize(() => loop.redraw());
const ico = document.getElementById("ico");
const paint = playing => { ico.innerHTML = playing ? '<path d="M4 2h3v12H4zM9 2h3v12H9z"/>' : '<path d="M4 2l10 6-10 6z"/>'; };
paint(loop.playing);
loop.onChange(paint);
document.getElementById("pp").onclick = () => loop.toggle();
</script>
```
