---
type: showcase
tags: [prism, example, no-code]
status: done
date: 2026-10-18
---
# Sankey

`type: sankey` draws flows between named nodes. Each row is a link: `from`, `to` and the size `y`. A node can be the target of one row and the source of another, so rows chain into several columns.

## A monthly budget

Income into categories, categories into subcategories. Hover a band for its value.

| From | To | Amount |
| --- | --- | --- |
| Salary | Budget | 3800 |
| Side projects | Budget | 600 |
| Budget | Housing | 1500 |
| Budget | Food | 650 |
| Budget | Transport | 250 |
| Budget | Savings | 1200 |
| Budget | Fun | 800 |
| Housing | Rent | 1200 |
| Housing | Utilities | 300 |
| Food | Groceries | 480 |
| Food | Restaurants | 170 |
| Savings | Pension | 600 |
| Savings | Emergency fund | 600 |

^budget

```viz chart title="Monthly budget"
type: sankey
source: ^budget
from: From
to: To
y: Amount
height: 420
```

## A funnel

Visitors to customers, with the drop-offs as their own nodes.

| Step | Next | Users |
| --- | --- | --- |
| Visit | Signup | 1200 |
| Visit | Left | 8800 |
| Signup | Trial | 700 |
| Signup | Left | 500 |
| Trial | Customer | 260 |
| Trial | Left | 440 |

^funnel

```viz chart title="Signup funnel"
type: sankey
source: ^funnel
from: Step
to: Next
y: Users
```
