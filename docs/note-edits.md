# Blocks that edit their note

With `prism.edit`, a block can change **its own note**: check off a task, set a table cell, add a table row or set a frontmatter property. This turns dashboards into small tools that keep their data in plain Markdown, for example habit trackers, checklists, task boards and quick-entry forms. The data stays readable and editable in the note, and the block follows every change, including changes typed by hand.

## API

| Call | Does |
| --- | --- |
| `prism.edit.setTask(task, done?)` | Checks a task off (`true`), unchecks it (`false`) or toggles it (no `done`). `task` is a task from `(await prism.note()).tasks` or a 1-based line number. |
| `prism.edit.setCell(table, row, column, value)` | Sets one cell. `table` is `"^id"`, a heading or an index, as in `note.table(ref)`. `row` is the 0-based body row, like the rows `note.table()` returns. `column` is a header name or an index. |
| `prism.edit.addRow(table, values)` | Appends a row after the last row of the table. `values` is given by column name (`{ Date: "2026-10-10", Done: "x" }`) or in column order. |
| `prism.edit.setProperty(key, value)` | Sets a frontmatter property through Obsidian's frontmatter API. `null` removes it. |

All calls return Promises. They reject with a readable message when the edit is not possible: the row does not exist, the column is unknown, the reader did not allow the edit, editing is switched off, or the block is in a command-line render.

```viz
<div id="grid"></div>
<script>
async function draw() {
  const rows = (await prism.note()).table("^habits");
  grid.replaceChildren(...rows.map((r, i) => {
    const b = document.createElement("button");
    const on = r.Done === "x";
    b.textContent = `${r.Date} ${on ? "✅" : "·"}`;
    b.onclick = () => {
      b.textContent = `${r.Date} ${on ? "·" : "✅"}`;          // show it at once
      prism.edit.setCell("^habits", i, "Done", on ? "" : "x")  // then write the note
        .catch((e) => (b.textContent = e.message));
    };
    return b;
  }));
}
prism.onNoteChange(draw);   // fires right after the edit and when the reader types
draw();
</script>
```

**Pattern:** update the clicked element at once (optimistic UI), and redraw from `prism.note()` in `prism.onNoteChange`. That event fires right after an edit and about 250 ms after the reader changes the note in the editor, without waiting for Obsidian to save.

## Safety

- **Only the block's own note.** Blocks cannot name another file, and there is no free-form text replacement, only the four operations above.
- **The reader allows it once per block.** Before a block's first edit, a bar below it says what it wants to do (*This block wants to change this note: check off a task*). It offers **Allow edits** and **Don't allow**. The approval is stored for that block and its current code (`editApprovals` in `data.json`, keyed by note path and source hash). If the code of the block changes, it asks again. **Don't allow** rejects the block's edits until it is rendered again.
- **Off switch:** *Settings → Prism → Blocks may edit their note* (on by default; every block still asks once).
- **Command-line renders and PDF export never edit.** The Promise rejects, so agents see the block's normal state in the snapshot.
- **Rate limit:** at most 120 edits per block and minute.

## How edits are applied

Edits of tasks, cells and rows work on the **current text** of the note, including unsaved changes in the editor (`lineEditFor` in `src/noteEdit.ts`):

- **Tasks** are found by line. If the line no longer holds that task (the note changed since the block read it), they are found by their text instead. An ambiguous text is an error, not a guess.
- **Tables** are found in the text itself (`scanTables`), not in Obsidian's metadata cache, which lags behind typing. Escaped pipes (`\|`), pipes in code spans and a trailing `^id` on the last row are kept.
- When the note is open in **Live Preview or source mode**, the change goes through the editor as one transaction. **Cmd/Ctrl+Z** undoes it, and the view does not scroll. Otherwise Prism writes the file with `vault.process`.
- **Properties** go through `app.fileManager.processFrontMatter`, which keeps the YAML valid.

`prism.note()` follows unsaved editor text too: while the editor holds changes that are not saved yet, tasks and tables come from the editor text instead of the metadata cache. Checking off a task by hand therefore shows up in the block almost immediately.
