# Charts from frontmatter

A ` ```viz chart ` or ` ```viz table ` block with `source: notes` charts the frontmatter of many notes without code: a mood or sleep curve over daily notes, projects per status, notes per tag.

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
| `modified` | Last change as `YYYY-MM-DD`. |
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

## Compared with the alternatives

- **`prism.notes()`** in an HTML block is the same data with full control: custom layouts, links, tasks with `include: ["tasks"]`.
- **The Bases view "Prism chart"** charts a `.base` file the user maintains in Obsidian's own UI.
- **`source: notes`** is the quickest way for an agent or user to write such a chart into a note.
