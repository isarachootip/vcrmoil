---
description: Strict end-of-phase review, then fix P0/P1 findings
---

# /phase-review <phase number>

Act as a strict principal engineer reviewing Phase `{{N}}` against `@AGENTS.md`, the phase prompt in
`@docs/PHASE_PROMPTS.md` and `@docs/tasks/phase-{{N}}.md`.

1. List every requirement of the phase and mark Done / Partial / Missing with file references.
2. Check: tenant isolation (RLS + tests), permission checks on every endpoint, audit logging,
   PII masking, input validation, error handling, idempotent webhooks, N+1 queries, missing
   indexes, test coverage of business rules, i18n (no hard-coded UI strings), secrets not committed.
3. Run lint, typecheck and all tests; report the results.
4. Produce a prioritized fix list (P0 security/data, P1 functional, P2 quality), then fix every
   P0 and P1 item.
5. Update `@docs/ARCHITECTURE.md`, `@docs/DATA_MODEL.md`, `@docs/OPEN_QUESTIONS.md` and the
   UAT columns in `@docs/TRACEABILITY.md` for the functions this phase delivered.
6. Set CURRENT STATUS in `AGENTS.md` to the next phase and summarize what the user should verify
   by hand before moving on.
