# Pinch zoom

Every Prism block can be zoomed with a pinch gesture (trackpad or touch screen). This page describes how it is built and why it is built that way.

## Behavior

- **Only pinching zooms.** A trackpad pinch, a two-finger pinch on a touch screen and ctrl + mouse wheel zoom. Plain wheel and one-finger scrolling are never intercepted, so they keep scrolling the note.
- **Zoom range 100–500 %** (`MAX_ZOOM` in `src/frame.ts`). The zoom centers on the point under the cursor or between the fingers.
- **No empty space**: the zoomed frame always covers the whole block. It cannot be zoomed out below 100 % or moved past its edges.
- **Panning**: while zoomed in, dragging with the mouse moves the content. A press on a link, button, form field, slider, `[contenteditable]` or `[draggable]` element does not start a pan, and neither does one that the block's own code handles first (`preventDefault` / `stopPropagation`, as `d3.drag` and `d3.zoom` do). After a pan, the click that the mouse release would trigger is suppressed.
- **Reset**: pinch back to 100 %, use the *Reset zoom* toolbar button (only visible while zoomed), or reload the block (every render starts at 100 %).

## Architecture

The host scales the `<iframe>` element. The frame document reports gestures and is otherwise untouched.

```
iframe (src/runtime/prelude.ts)            host (src/frame.ts, PrismFrame)
──────────────────────────────            ───────────────────────────────
wheel + ctrlKey  ──── zoom  ───────────▶  zoomAround(anchor, factor)
touch, 2 fingers ──── pinch ───────────▶  zoomAround + move by midpoint delta
mouse drag       ──── pan   ───────────▶  move by delta
                                          setZoom(scale, x, y): clamp,
                                          iframe transform: translate() scale()
setZoomScale()   ◀─── zoomed ──────────   (when the scale changes)
```

### Why the host scales the frame

Zooming inside the frame (a CSS transform on `<html>`) would change the coordinate system the block's own code sees. Code that positions tooltips with `event.pageX` or computes pointer positions as `clientX - rect.left` would be off while zoomed. When the host transforms the iframe element, the browser maps pointer events into the frame's untransformed coordinates. Chart.js tooltips, D3 hit-testing, Mermaid links and `prism.hoverNote` keep working without changes. The frame's layout and auto-height measurement are not affected either.

The `.prism-stage` already clips its content (`overflow: hidden`). The frame uses `transform-origin: 0 0` (`styles.css`), and the toolbar, error badge and notices are positioned elements later in the stage, so they stay on top of the scaled frame.

### Why the messages look the way they do

Obsidian (Electron) runs the sandboxed frames **in a separate renderer process**. By the time the host handles a gesture message, it may already have applied further zoom steps. A pointer position in frame coordinates is therefore relative to an outdated transform. The first version sent such positions with every event. The errors added up and made zooming and panning jump and jitter.

The protocol avoids that:

| Message (`FrameMessage` in `src/protocol.ts`) | Sent | Payload |
|---|---|---|
| `zoom` | per ctrl+wheel event | `factor`; plus `x`, `y` (frame coordinates) only on the first event of a gesture (no zoom wheel event for 150 ms) |
| `pinch` | `start` / `move` / `end` | `start`: midpoint `x`, `y` in frame coordinates; `move`: `factor` (distance ratio) and midpoint `dx`, `dy` in **screen pixels** |
| `pan` | per mouse move while dragging | `dx`, `dy` in **screen pixels** |
| `zoomed` (host → frame, `HostMessage`) | when the scale changes | `scale` |

- **Frame coordinates are sent only at a gesture's start**, when the frame is at rest, so they are exact. The host converts them to stage coordinates once (`toStage`) and keeps that point as the gesture's anchor (`PrismFrame.gesture`).
- **Movement is sent as screen-pixel deltas** (`screenX`/`screenY`), which CSS transforms do not affect. The host converts them to its CSS pixels with `cssPerScreenPixel()`, which is `1 / webFrame.getZoomFactor()`, because `screenX` ignores Obsidian's own zoom level (Cmd/Ctrl +/−) while `clientX` follows it. Without Electron (mobile) it is 1.
- **Zoom factors carry no coordinates.** For a trackpad pinch Chromium sends `deltaY = −100·ln(scale)`, so the factor is `exp(−deltaY / 100)`. A ctrl + mouse wheel notch (`deltaY` ≈ 100) is capped to ±25, which is about 28 % per notch.

### Zoom and clamping

The zoom state is `{ scale, x, y }`: the frame is drawn at `translate(x, y) scale(scale)` inside a stage of size `W × H` (the iframe's untransformed size equals the stage size).

- **Zoom around a stage point `a`**: the content under `a` stays in place, so `x' = a.x − (a.x − x) · scale' / scale` (same for `y`). The new scale is clamped to `[1, MAX_ZOOM]` **before** the offset is computed. Otherwise the offset was computed for an unclamped scale and the content jumped at the limits.
- **Covering the stage**: the frame spans `[x, x + W·scale]`, so `x` is clamped to `[W − W·scale, 0]` (same for `y` with `H`). At scale 1 this is exactly `0`, so there is never empty space around the content.
- A `ResizeObserver` on the stage re-applies the clamp when the block changes size (auto-height, fullscreen, window resize).
- `render()` resets the zoom; the new iframe starts at scale 1, and so does the frame runtime.

### In the frame

- The listeners are registered on `window` in the bubbling phase. A block that handles the event first (e.g. `d3.zoom` with `preventDefault`, or `d3.drag` with `stopImmediatePropagation`) takes precedence.
- `wheel` and `touchmove` listeners are non-passive, so they can call `preventDefault` for zoom gestures only. WebKit's `gesturestart` is cancelled so iOS does not zoom the whole page.
- While zoomed, `<html>` has the class `prism-zoomed` (cursor `grab`). During a pan it has the class `prism-panning` (cursor `grabbing`, no text selection). The CSS is part of the `prism-core` style in `src/document.ts`, so it is present even in `raw` blocks.
- **Sharp canvases**: when the scale settles (200 ms debounce), Chart.js instances get `devicePixelRatio = min(dpr · scale, 4)` and are resized. The cap keeps canvas memory bounded. Other canvases are scaled as bitmaps and look soft when zoomed in. SVG, HTML and Mermaid are re-rasterized by the browser and stay sharp.

### Page previews

`prism.hoverNote` reports rectangles in frame coordinates. `PrismFrame.showHover` multiplies them by the current scale (the iframe's bounding box already includes the offset), so previews appear next to the zoomed link.

## Limits

- Canvases not drawn by Chart.js are not re-rendered at the zoomed resolution.
- During a mouse pan, the frame must receive the mouse moves. Chromium keeps sending them to the frame where the button was pressed, even outside it.
- A ctrl + mouse wheel user who moves the mouse between notches within 150 ms keeps the previous anchor.

## Manual test checklist

1. Trackpad pinch on a Chart.js chart, a Mermaid diagram and a D3/SVG block: smooth, centered on the cursor, stops at 100 % and 500 % without jumping.
2. Two-finger scroll and mouse wheel over a block scroll the note and do not zoom.
3. Zoomed in: dragging moves the content without lag. The edges never show empty space. A click after a drag does not trigger the element under the cursor.
4. Zoomed in: tooltips, buttons, sliders and note link previews still work.
5. *Reset zoom* appears only while zoomed and resets. Reload and fullscreen keep the block covered.
6. On iPad or a phone: a two-finger pinch zooms and follows the fingers, and one-finger scrolling scrolls the note.
