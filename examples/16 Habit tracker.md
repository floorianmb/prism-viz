---
type: showcase
tags: [prism, example, edit]
status: done
date: 2026-10-10
focus: 3
---
# Habit tracker

Blocks can change their own note with `prism.edit`: check off tasks, set table cells, add rows and set properties. The data stays in plain Markdown below, so you can also edit it by hand, and the blocks follow along. The first click asks once: **Allow edits**. Every change made in the editor can be undone with Cmd/Ctrl+Z.

## This week

| Day        | Run | Read | Water |
| ---------- | :-: | :--: | :---: |
| 2026-10-05 | x   | x    | x     |
| 2026-10-06 |     | x    | x     |
| 2026-10-07 | x   |      | x     |
| 2026-10-08 |     | x    |       |

^habits

```viz title="Click a cell to check it off"
<div id="grid"></div>
<div class="row"><button id="add" class="mod-cta">+ Today</button><span class="muted" id="msg"></span></div>
<script>
const habits = ["Run", "Read", "Water"];
async function draw() {
  const rows = (await prism.note()).table("^habits");
  const table = document.createElement("table");
  table.innerHTML = "<tr><th>Day</th>" + habits.map((h) => `<th>${h}</th>`).join("") + "</tr>";
  rows.forEach((r, i) => {
    const tr = table.insertRow();
    tr.insertCell().textContent = String(r.Day);
    for (const h of habits) {
      const on = String(r[h] ?? "").trim() === "x";
      const td = tr.insertCell();
      td.textContent = on ? "✅" : "·";
      td.style.cssText = "cursor:pointer;text-align:center";
      td.onclick = () => {
        td.textContent = on ? "·" : "✅";
        prism.edit.setCell("^habits", i, h, on ? "" : "x").catch((e) => {
          td.textContent = on ? "✅" : "·";
          msg.textContent = e.message;
        });
      };
    }
  });
  grid.replaceChildren(table);
}
add.onclick = () =>
  prism.edit.addRow("^habits", { Day: new Date().toISOString().slice(0, 10) }).catch((e) => (msg.textContent = e.message));
prism.onNoteChange(draw);
draw();
</script>
```

## Today

- [ ] Stretch for ten minutes
- [x] Plan the week
- [ ] Call the plumber 📅 2026-10-12

```viz title="Checklist"
<div id="list" class="stack"></div>
<p class="caption" id="msg"></p>
<script>
async function draw() {
  const { tasks } = await prism.note();
  const done = tasks.filter((t) => t.done).length;
  msg.textContent = `${done} of ${tasks.length} done`;
  list.replaceChildren(...tasks.map((t) => {
    const label = document.createElement("label");
    label.className = "row";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = t.done;
    box.onchange = () => prism.edit.setTask(t, box.checked).catch((e) => {
      box.checked = !box.checked;
      msg.textContent = e.message;
    });
    label.append(box, document.createTextNode(t.text + (t.due ? ` (due ${t.due})` : "")));
    return label;
  }));
}
prism.onNoteChange(draw);
draw();
</script>
```

## Focus

The slider writes the `focus` property of this note.

```viz title="Focus today (0–5)"
<div class="row"><input type="range" id="r" min="0" max="5"><span class="kpi" id="v"></span></div>
<script>
async function show() {
  const { frontmatter } = await prism.note();
  r.value = frontmatter.focus ?? 0;
  v.textContent = frontmatter.focus ?? "–";
}
r.oninput = () => (v.textContent = r.value);
r.onchange = () => prism.edit.setProperty("focus", Number(r.value)).catch((e) => (v.textContent = e.message));
prism.onNoteChange(show);
show();
</script>
```
