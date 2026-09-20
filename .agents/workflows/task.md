---
description: Implement exactly one task from the current phase task list
---

# /task <task id, e.g. 0.3>

Implement **only** task `{{id}}` from `@docs/tasks/phase-{{phase}}.md`.

1. Restate the task scope and its "Done when" criteria.
2. List the files you will create or change, and the data-model delta.
3. Implement it, following `@AGENTS.md` and the project rules.
4. Run lint, typecheck and tests. Fix every failure.
5. Tick the task's checkbox in the task file; update `@docs/ARCHITECTURE.md` /
   `@docs/DATA_MODEL.md` if the structure or schema changed.
6. Show the user the exact commands to verify it locally, and a suggested commit message
   (conventional commits, e.g. `feat(case): task 2.8 SLA engine`).
7. Stop. Do not start the next task.
