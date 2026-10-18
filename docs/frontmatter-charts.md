# Charts from frontmatter and tasks

A ` ```viz chart ` or ` ```viz table ` block with `source: notes` charts the frontmatter of many notes without code: a mood or sleep curve over daily notes, projects per status, notes per tag. `source: tasks` does the same for the tasks in those notes (see below).

```viz chart title="Mood over time"
type: line
source: notes
folder: Daily
x: title
y: [mood, sleep]
sort: title
```

```viz chart title="Projects by status"
type: doughnut
source: notes
tag: project
x: status
aggregate: count
```

## Rows

`source: notes` gives one row per note, with these columns:

| Column | Value |
| --- | --- |
| `title` | Frontmatter `title`, else the file name. This is the default `x`. |
| *every frontmatter property* | As Obsidian parsed it (numbers stay numbers, lists stay lists). Notes without the property get an empty value. |
| `folder`, `path` | Where the note is. |
| `modified` | Day of the last change as `YYYY-MM-DD`, in the local time zone. |
| `tags` | All tags of the note (frontmatter and inline) as a list. |

Narrow the notes with `folder: <folder>` (includes subfolders) and/or `tag: <tag>` (includes subtags). Up to 5000 notes are read. The chart redraws when notes change.

## Grouping: `aggregate`

| `aggregate` | Result per group |
| --- | --- |
| `count` | Number of notes, in a column named `count`. Use it in `sort: -count`. |
| `sum`, `avg`, `min`, `max` | Applied to each `y` column. Values that are not numbers are skipped. |

Rows are grouped by `x`, and by `series` if given. A list value such as `tags` counts once for each of its items, so `x: tags, aggregate: count` gives notes per tag. Notes without a value form the group **(none)**.

`filter` matches list values by containment: `filter: { tags: project }` keeps notes whose tags include `project`. `aggregate` also works with tables and CSV files as sources.

The order of operations is `filter` → `aggregate` → `sort` → `limit`.

## Tasks: `source: tasks`

`source: tasks` gives one row per task (`- [ ] …`) of the notes, narrowed with `folder` and `tag` like `source: notes`:

| Column | Value |
| --- | --- |
| `text` | Task text without the checkbox and without the Tasks-plugin fields. |
| `done`, `status` | `true`/`false`, and the checkbox character (` `, `x`, `/`, `-` …). |
| `due`, `scheduled`, `start`, `doneDate` | Tasks-plugin dates (📅 ⏳ 🛫 ✅) as `YYYY-MM-DD`, else empty. |
| `priority` | `highest`, `high`, `medium`, `low`, `lowest` (🔺⏫🔼🔽⏬), else empty. |
| `tags` | Tags of the task as a list. |
| `note`, `path`, `folder`, `line` | The note the task is in (title, path, folder) and its line. |

```viz chart title="Open tasks per note"
type: hbar
source: tasks
folder: Projects
filter: { done: false }
x: note
aggregate: count
sort: -count
```

```viz chart title="Tasks done per day"
type: calendar
source: tasks
filter: { done: true }
x: doneDate
```

## Links: `source: links`

`source: links` gives one row per distinct link of a note, with `from`, `to`, `fromPath`, `toPath`, `folder` and `tags`, narrowed with `folder` and `tag` like `source: notes`. Links to attachments (images, PDFs, …) are left out, like in Obsidian's graph. Use it for counts (`x: from`, `aggregate: count`) or with `type: graph` and `type: sankey`, see [`new-chart-types.md`](new-chart-types.md).

## Compared with the alternatives

- **`prism.notes()`** in an HTML block is the same data with full control: custom layouts, links, tasks with `include: ["tasks"]`.
- **The Bases view "Prism chart"** charts a `.base` file the user maintains in Obsidian's own UI.
- **`source: notes`** is the quickest way for an agent or user to write such a chart into a note.
