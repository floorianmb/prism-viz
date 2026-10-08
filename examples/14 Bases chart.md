---
type: showcase
tags: [prism, example, bases]
status: done
date: 2026-10-08
---
# Bases chart

Obsidian **Bases** (version 1.10 or newer, core plugin *Bases* enabled) turns a folder of notes into views defined in a `.base` file. Prism adds one more view type: **Prism chart**. It needs no code. You pick the property to group by and, optionally, one to split into series; Prism draws the chart with the same engine as the declarative `viz chart` block.

This is [[Notes overview.base]] embedded. It filters the `Notes` folder, groups the notes by `type` and splits every bar by `status`:

![[Notes overview.base]]

## Set it up yourself

1. Create a base (*Create new base*) and add a view with the type **Prism chart**.
2. **Group by** = `type`, **Split into series** = `status`, **Stacked** on.
3. Leave **Value** empty to count notes, or pick a number property and an aggregate (sum, average, min, max).

The view options also offer the chart type (bar, horizontal bar, line, area, pie, doughnut, polar area), sorting by label or by value, the maximum number of groups and the height. List-valued properties such as `tags` count once per element. Edit the filter in the base and the chart follows.

> [!note] Not covered by the command-line render
> `prism-render` only renders `viz` blocks. A Bases view is drawn by Obsidian itself, so look at it in the app. Without Obsidian 1.10 the view type is not registered, so the chart is not available there.
