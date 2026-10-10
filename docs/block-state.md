# Block state

`prism.state` stores values per block (slider positions, selected tabs, cached API responses) in the plugin's `data.json`. This page describes how a block finds its state again, also after the note around it changed.

## State keys

| Block | Key |
| --- | --- |
| ` ```viz id=name ` | `<note path>#<name>` |
| ` ```viz ` without `id=` | `<note path>#<index>`, the 0-based position among the note's `viz` blocks |
| Block whose position Prism cannot find | `<note path>#h<hash of the source>` |
| `prism.shared` | `<note path>#~shared` |
| `.html` file | `file:<path>` |

A block with `id=` keeps its key whatever happens around it. That stays the recommendation for blocks that use `prism.state`, and the agent skill adds an `id=` to every such block.

Blocks without `id=` are keyed by position. Up to 0.5.2 this meant that state stayed at its position when the blocks moved: inserting a block above gave the new block the state of the old first block, and every block below got the state of its predecessor.

## Moving state along with its block

Prism now moves the state of position-keyed blocks along when blocks are inserted, removed or edited (`StateStore.realign` in `src/stores.ts`, `realignState` in `main.ts`).

1. **Fingerprints.** For every note with position-keyed state, Prism records the note's `viz` blocks in order (`blockPrints` in `data.json`). A block's fingerprint is `id:<name>` for blocks with an id, otherwise a hash of its source.
2. **Trigger.** When such a note is saved (vault `modify` event, about 2 s after the last keystroke in the editor), Prism reads the note, computes the new list and compares it with the recorded one.
3. **Alignment** (`alignBlocks`). Unchanged blocks are matched by the longest common subsequence of the two lists. Between two matched blocks, the remaining blocks are paired in order if both sides have the same number of them, which covers blocks whose code was edited. Otherwise they stay unpaired: a block was inserted or removed there, and Prism does not guess.
4. **Moving.** All position keys of the note are rewritten from the pairing. A block that got an `id=` takes its old state along, unless state under that id already exists.
5. **Parking.** State of a block that is gone is kept under `<note path>#h<hash>`. When a block with the same source appears in the note again (cut and pasted elsewhere, or deleted and restored with undo), it gets that state back.
6. **Open blocks.** Rendered blocks of the note switch to their new key and receive their state at once, so the reader does not have to reload. This only happens when the block's source is unique in the note.

When a note has no position-keyed or parked state left, its fingerprints are removed. Deleting a note removes its state and fingerprints; renaming it moves both.

### Example

```
before    A(3)  B(5)  C(7)          #0 = 3, #1 = 5, #2 = 7
insert    N     A     B     C       LCS: A, B, C → #1 = 3, #2 = 5, #3 = 7; N starts empty
delete A        N     B     C       A is unpaired → parked under #h<hash of A>
undo            N     A     B     C A appears again → gets 3 back
```

## Limits

- **Until Obsidian saves**, the editor already shows the new layout but the file still has the old one. A block that is re-rendered in these ~2 s may briefly show the state of its old position. The state is corrected once the note is saved.
- **Editing and inserting at the same spot in one save** (e.g. pasting a new block and changing the code of the block next to it before Obsidian saves): the changed block cannot be paired, so its state is parked and only returns if its old source comes back.
- **Identical blocks** (same source, no id) are matched in order. Open copies are not switched to a new key; they get it on their next render.
- **Notes changed while Obsidian is closed** are realigned on the next save in Obsidian, against the fingerprints recorded before. This works as long as the blocks can still be matched by content.
- **Notes from before this change**: Prism records the fingerprints of notes that already have position-keyed state when the workspace has loaded. Changes made before that first recording cannot be undone.
- Parked state stays in `data.json` until the note is deleted. It counts towards the 512 KB limit per block like any other state.
