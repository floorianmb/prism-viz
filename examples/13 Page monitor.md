---
type: showcase
tags: [prism, example, performance]
status: done
date: 2026-10-08
---
# Page monitor

How heavy is a note full of live blocks? An empty `viz monitor` block answers that for the page it sits on. It shows two numbers, updated every second while it is visible: **RAM** in megabytes and **CPU** in percent of the whole machine (all cores).

```viz monitor
```

For ordinary blocks the figures are estimates: CPU is the main-thread time of their scripts, RAM the canvas, WebGL and image buffers. `viz web` blocks run in their own process and are measured exactly. Process figures for Obsidian itself, its window and the GPU need the desktop app; on mobile only the block estimates are shown, and a command-line render sees just the first second.

Open [[06 Animated scene]] in the next tab, then come back here: the numbers show how much that scene costs while it runs. For a custom view use `prism.perf.watch(cb)`.
