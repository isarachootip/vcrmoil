---
description: vCRM project rules — always active
trigger: always_on
---

# vCRM — Core Rules

Read **@AGENTS.md** in full before your first action in a session. It is the source of truth for
product scope, confirmed decisions, tech stack, architecture and coding standards. These rules
repeat only what must never be violated.

## Non-negotiables

1. **Multi-tenant SaaS**: every tenant-scoped table has `tenant_id` + Postgres Row-Level Security.
   Never query across tenants. Never bypass RLS in application code.
2. **PDPA by design**: consent per purpose/version, PII classification, masking unless the caller
   has `contact.pii.view`, audit every PII view, retention + data-subject export/anonymize.
3. **Audit**: every create/update/delete writes an AuditLog row.
4. **AI is cloud-based and pluggable**: call STT/LLM/embeddings only through `SttProvider`,
   `LlmProvider`, `EmbeddingProvider`; validate every LLM output against a zod schema; store
   `model_version` and `prompt_version`; apply PII redaction when the tenant enables it.
5. **3CX V20**: all PBX access goes through `PbxAdapter` with a mock implementation. Call Control
   API and XAPI require an 8SC+ license — always degrade gracefully without them.
   No vCRMOCR integration.
6. **Configuration over code**: ticket types, categories, workflows, SLA, forms, surveys and
   routing are tenant data edited in the Admin console, never hard-coded.
7. **Secrets**: never write API keys, tokens or passwords into code, docs or commit messages.
   They live in `.env` (local) or Secrets Manager (cloud).
8. **Never run** `terraform apply`, production deploys, or destructive database commands.

## Way of working

- Work on **one task at a time**, named by the user from `@docs/tasks/phase-N.md`. Do not start
  the next task on your own.
- Before coding: restate the scope, list files to create/change, state the data-model delta.
- After coding: run lint, typecheck and tests; fix failures; tick the task checkbox; say how the
  user can verify it; then stop.
- Unsure about an external API (3CX, LINE, Facebook, AI vendors)? Put it behind an adapter with a
  mock and add the question to `@docs/OPEN_QUESTIONS.md`. Never invent behaviour silently.
- Keep `@docs/ARCHITECTURE.md`, `@docs/DATA_MODEL.md` and `@docs/TRACEABILITY.md` up to date.
- UI strings are i18n keys (th default, en) — no hard-coded Thai or English text in components.
