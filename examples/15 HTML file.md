---
type: showcase
tags: [prism, example, html]
status: done
date: 2026-10-08
---
# HTML file

A finished widget does not have to live inside a note. Prism opens `.html` files from the vault and embeds them with the usual embed syntax. The file below, [`widgets/clock.html`](widgets/clock.html), is one self-contained page: an analog and digital clock that follows the Obsidian theme.

![[widgets/clock.html|height=260]]

The file is rendered by the same sandbox as a `viz` block, so everything in the reference works: theme variables, `prism.*`, the bundled libraries. Click the file in the file explorer to open it full size in its own tab.

## Options

Where a block has its fence line (` ```viz chart height=400 `), a file carries the same words in a meta tag or a comment, and the embed can override them after the pipe:

- `<meta name="prism" content="height=260">` in the file's head, as used by the clock
- `<!-- prism: chart height=400 -->` anywhere in the file
- `![[widgets/clock.html|height=200]]` in the embedding note, which takes precedence

Edit the clock file and save it: embedded copies update right away.
