---
type: showcase
tags: [prism, example, diagram]
status: done
date: 2026-10-03
---
# Architecture diagram

Mermaid diagrams follow the theme automatically. Labels written as `["[[Note]]"]` become links: click a node to open the example it points to, or hover for a page preview.

```viz mermaid title="Where the data comes from"
flowchart LR
  T[("Markdown table")] --> A1["prism.note()"]
  F[("Frontmatter")] --> A2["prism.notes()"]
  C[("CSV file")] --> A3["prism.data()"]
  U(["Slider and state"]) --> A4["prism.shared"]
  M(["Motion"]) --> A5["prism.animate"]

  A1 --> N1["[[01 Dashboard]]"]
  A1 --> N2["[[02 No-code chart]]"]
  A2 --> N3["[[05 Vault overview]]"]
  A3 --> N4["[[07 Data file]]"]
  A4 --> N5["[[04 Formulas]]"]
  A5 --> N6["[[06 Animated scene]]"]
```

A second diagram: what happens when a block renders.

```viz mermaid title="From code block to pixels"
sequenceDiagram
  participant N as Note
  participant P as Prism
  participant S as Sandbox
  N->>P: viz block (HTML, YAML or LaTeX)
  P->>S: srcdoc with bundled libraries and theme
  S-->>P: height, errors, state
  P-->>N: resized block, error badge if needed
```
