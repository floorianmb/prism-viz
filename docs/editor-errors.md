# Errors in the editor

Prism maps every error of a block to a line of the note. Since 0.6.0 it also marks that line in the editor, like a linter in a code editor:

- The line is underlined with a wavy line and slightly tinted: red for errors, yellow for warnings.
- The first message stands at the end of the line. More messages on the same line are counted as `(+n)`.
- Hovering the line shows all messages.

Errors without a line in the block (in a bundled library, in Prism itself, timeouts, warnings about a chart spec) go on the block's opening ` ```viz ` line.

In Live Preview the marks show when the cursor is inside the block and its source is visible. The rendered block keeps its error badge as before. Errors stay marked until the block renders again; after you fix the code and leave the block, the marks disappear. Marks follow the text when you edit above them.

Turn it off under *Settings → Prism → Errors in the editor*.

Implementation: `src/editorErrors.ts` (a CodeMirror 6 state field with line, mark and widget decorations). Frames report their errors in `updateBadge`, and the store keeps them per block until the next render.
