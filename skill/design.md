# Prism design guide – how to make a block look finished

Read this before writing a block. Correct is not enough: the reader should understand the point at a glance and want to look at it. These are principles, not a template – apply what fits the content.

## Start from the point

- Name the one thing the reader should take away before writing code. Design every choice (layout, color, motion, controls) to make that point obvious; drop what does not serve it.
- Show it, don't explain it inside the block: highlight the key series, annotate the key moment directly in the visual, put explanatory paragraphs in the note text around the block.
- If the block is interactive, prefer one control that reveals the insight over many parameters.
- When the visual is a model or simplification, add one muted sentence below it stating the assumptions.

## Composition

- **One hero.** The main visual gets most of the area. Secondary elements (controls, legend, values) are compact and visually quieter.
- **Predictable layout.** Controls in one row above the visual, a short caption or source line below. Align edges; use one spacing scale (`--size-4-2`, `--size-4-3` …).
- **Fill the space deliberately.** No large empty regions, nothing tiny in a corner; scale content to the container and keep a calm margin.
- **No clutter.** Avoid stacks of KPI cards, long legends, heavy borders and boxes inside boxes unless the task is a dashboard.

## Color

- UI and text: Obsidian variables only. Data: `prism.palette` (or theme `--color-*`) – few colors, each with a meaning.
- Highlight vs. context: one or two accent colors for what matters, `var(--text-faint)` / low opacity for the rest.
- Categorical colors should have similar lightness so none dominates by accident. When you need computed colors in canvas/JS, OKLCH (`oklch(L C H / a)`) keeps lightness even across hues.
- Avoid muddy overlaps: many low-alpha strokes stacked on top of each other turn grey – thin them out or fade older ones.

## Surfaces

- Default: transparent background, `.card` only to group things.
- **Stage** (exception): content that is a *scene* rather than a chart – simulations, particle or flow animations, image-like renderings – may sit on a dark, rounded surface that stays dark in both themes, like a video player. Light content on it uses its own light, low-chroma colors. Keep it subtle: a soft radial gradient, a 1px inset hairline, rounded corners; no pure black.

  ```css
  .stage { position: relative; height: clamp(240px, 50vw, 340px); border-radius: 14px; overflow: hidden;
    background: radial-gradient(120% 90% at 50% 40%, oklch(0.24 0.03 260), oklch(0.12 0.02 260));
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / .06); }
  ```

## Charts and diagrams

- Label directly at the data (end of line, on the bar) instead of a separate legend when there are few series.
- Reduce ink: light or no gridlines, no chart borders, formatted axis numbers (`prism.format`), sensible tick count, sorted bars.
- Diagrams: consistent node sizes, aligned grid, one stroke width, rounded corners, color only for meaning.

## Controls

- Make them one family: same height, radius and border; override Prism's default button style where needed (`box-shadow: none`).
- 2–4 exclusive options → segmented control (pill group with an active segment); on/off → toggle chip with `aria-pressed`; playback → small round icon buttons with inline SVG; continuous values → a labeled slider showing its value.
- Persist the user's choice with `prism.state` (fence needs `id=`), or `prism.shared` across blocks.

## Motion (only when it carries meaning)

- Advance by real elapsed time, clamped (`Math.min(dt, 1/30)`); never tie speed to frame count.
- The first frame must already be meaningful (pre-compute or pre-simulate) – the snapshot and the reader both see it.
- Ease transitions (camera, values, layout); fade instead of hard cuts when a run restarts.
- Canvas: scale by `devicePixelRatio`, redraw on resize (`ResizeObserver`) without restarting.
- Be a good guest – blocks share Obsidian's main thread: pause when off screen (`IntersectionObserver`) or in a background tab (`visibilitychange`), and start paused under `prefers-reduced-motion: reduce`.
- Depth effects (glow via `globalCompositeOperation = "lighter"`, fading trails, subtle texture) only where they help reading the motion.

## Typography

- UI text `var(--font-ui-small)` in `var(--text-muted)`; numbers via `prism.format` with `font-variant-numeric: tabular-nums`.
- Short labels in the note's language; no all-caps headlines inside the block.

## Polish pass (after the render is clean)

Open the snapshot and judge it like a designer, then do one improvement round:

1. Is the point obvious within three seconds?
2. One clear hero that uses its space well?
3. Controls one family, in one row at 720px width?
4. Colors balanced – nothing muddy, nothing shouting by accident?
5. Text readable, nothing clipped or overlapping?

For interactive blocks, check the other states too: temporarily change the defaults in the code, render, look, restore the defaults. Do not edit `data.json` for this.
