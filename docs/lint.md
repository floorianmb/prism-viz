# Offline check: `prism-render.mjs --lint`

The render command needs a running Obsidian. `--lint` does not: it reads the note and the vault files and checks the blocks without running them. It is for agents (and CI), and fast enough to run after every edit.

```bash
node .obsidian/plugins/prism-viz/scripts/prism-render.mjs --lint "Folder/Note.md"
node .obsidian/plugins/prism-viz/scripts/prism-render.mjs --lint --all [folder]
```

## What it finds

- YAML or JSON errors in ` ```viz chart ` and ` ```viz table ` specs, with the note line.
- Unknown keys, wrong values (`aggregate`, `group`, `lines`) and keys that do not fit the `type`, the same warnings the block shows.
- `source: ^id` or `table:<heading>` that does not exist, and columns (`x`, `y`, `series`, `filter`, `sort`) that are not in the table, the `rows`, a `.csv`/`.tsv` file, or the fixed columns of `source: tasks` and `source: links`.
- Warnings from the fence line (unknown options).
- Syntax errors in `<script>` code of HTML blocks (with the note line).

## What it does not find

It is static. Nothing runs, so runtime errors, the columns of `source: notes` (they depend on your frontmatter), JSON and other data files, `prism.chart(…)` specs inside scripts, and the picture itself are only checked by the render. Recommended workflow: lint after every edit, render once the lint is clean, and look at the snapshot.

## Output and exit codes

The JSON has the shape of the render: `{ notePath, status, blocks: [{ block, lines, status, errors: [{ kind, line, message }] }] }`. `--all` prints one line per note to stderr and `{ notes, ok, results }` to stdout. No snapshots, no `change`.

| Exit code | Meaning |
| --- | --- |
| 0 | ok or warnings only |
| 1 | at least one error |
| 4 | note not found |

## Setup

`prism-lint.mjs` is generated from `src/lint.ts` (`npm run build`) and lives next to `prism-render.mjs`. *Prism: Install agent skill* and `scripts/install-skill.mjs` copy both into the vault's plugin folder. Run the install again after updating Prism.
