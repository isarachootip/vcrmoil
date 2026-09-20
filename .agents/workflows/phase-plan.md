---
description: Start a phase — review its task list and get approval before any code
---

# /phase-plan <phase number>

1. Read `@AGENTS.md`, the matching prompt in `@docs/PHASE_PROMPTS.md` (Phase N → "Prompt N+1")
   and `@docs/tasks/phase-{{N}}.md`.
2. Inspect the existing codebase and report what part of this phase already exists.
3. Review the task list: missing tasks, wrong order, tasks too large for half a day, risky
   dependencies. Propose concrete edits to `docs/tasks/phase-{{N}}.md` (do not apply them yet).
4. Add anything unclear to `@docs/OPEN_QUESTIONS.md`.
5. Update the CURRENT STATUS section of `AGENTS.md` (and `CLAUDE.md` if present) to this phase.
6. **Write no application code.** Stop and wait for the user's approval.
