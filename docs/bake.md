# Baked blocks

A ` ```viz ` block is code. Prism turns it into a chart only inside Obsidian with Prism enabled. On **Obsidian Publish**, **GitHub**, in **other Markdown apps** and in Obsidian **without Prism**, readers see the source.

The command **Prism: Bake blocks as images** freezes every block of the current note as a picture, so these readers see the chart.

## What it does

1. Saves the note, then renders all its `viz` blocks offscreen in the current theme, 720 px wide at 2× resolution.
2. Saves a PNG of each block in the attachment folder (Obsidian's *Default location for new attachments*), e.g. `My note – Revenue.png`.
3. Adds a plain Markdown image right below each block's closing fence:

   ````markdown
   ```viz chart title="Revenue"
   type: bar
   source: ^data
   ```
   ![Prism snapshot: Revenue](attachments/My%20note%20%E2%80%93%20Revenue.png)
   ````

The link is relative to the note and URL-encoded, so it works on GitHub, on Publish and in other editors.

## Who sees what

| Where | Shows |
| --- | --- |
| Obsidian with Prism | the live block. `styles.css` hides images whose alt text starts with `Prism snapshot` in Live Preview and Reading view. |
| Publish, GitHub, other apps, Obsidian without Prism | the source and, below it, the image |

In source mode, the image lines are visible as text.

## Baking again and removing

- **Bake again** after the data changed: Prism finds the image line below each block, overwrites its PNG and keeps the line. No duplicates.
- **Prism: Remove baked images** deletes the image lines of the note and moves their PNGs to the trash.
- Blocks with errors are skipped. The notice names them.
- If the note changes while the blocks render, the images are saved but not linked. Bake again.

## Limits

- An image is a snapshot. It does not update with the data, and it shows no interaction or animation.
- Blocks that call web APIs are baked in their waiting state: baking never sends requests.
- The current theme is used. Switch to the light theme first for light images.
- Code is in `src/bake.ts` (links and image lines) and `bakeNote` / `unbakeNote` in `main.ts`.
