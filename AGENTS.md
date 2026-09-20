# vCRM — Project Instructions for AI (Master Context)

You are a senior full-stack engineer and solution architect building "vCRM", a multi-tenant
contact-center CRM for Thai enterprises. It unifies Voice (3CX), LINE OA, Facebook Messenger,
web livechat, email and web forms into one Customer 360 + Case Management platform with AI
quality management.

## PRODUCT MODULES (source: "CRD2026 - nexCRM - Checklist.xlsx" — the product is now named vCRM)

1. Account Management: contact management (information, segment, PDPA consent), interaction
   tracking (call, chat, ticket, survey) on one timeline, customer dashboard (Customer 360).
2. Case Management: manual ticket, auto-create ticket from email/form/call/chat, auto-close,
   ticket type, category/sub-category, configurable workflow, log notes (to all / internal,
   @mention, attachments), reminders, activity log, notifications, external customer/product/sales
   info via configurable API connector, reports & dashboards.
3. Quality Management (data from 3CX): AI call summary + dialog transcript, call intent, call
   sentiment (positive/neutral/negative), call script checklist, keyword extraction, voice record
   playback, call evaluation (manual + AI pre-score), reports & dashboards.
4. Survey: automated send (event-triggered), bulk or individual send, unlimited forms, layout
   customization, real-time analysis, survey dashboard.
5. Non-voice & Social (LINE, Facebook, Livechat): queue management, skill-based assignment,
   max concurrent chats per agent, file send/receive, clickable links, chat log/result/history,
   end-chat evaluation (CSAT), keyword search of messages, agent status (online/offline/away),
   chat transfer, agent assistant, AI chatbot, AI chat summary, chat-to-case, contact mapping,
   canned responses & labels, chat dashboard + heatmap, livechat pre-chat form.
6. Knowledge Base: views/likes/dislikes/contribution tracking, templates, HTML editor, document
   attachments, article authorization by role, expiration date, filter by section hierarchy/tags/type.
7. Voice Integration (3CX V20, latest update): contact query (caller-ID lookup endpoint for the 3CX
   CRM Integration Template), call log (journaling), call recording retrieval, realtime screen-pop
   built by vCRM itself from 3CX Call Control API WebSocket events, click-to-call, and call
   reports/dashboards built inside vCRM. vCRMOCR is NOT used. vCRMCDR is only an optional external link.

## CONFIRMED DECISIONS

- Delivery model: SaaS, multi-tenant, hosted on AWS (region Asia Pacific Thailand ap-southeast-7,
  or Singapore if a required managed service is missing). Each tenant gets <tenant>.vcrm.app.
- AI: cloud providers only (STT with Thai th-TH + diarization, LLM, embeddings) behind provider
  interfaces; enterprise API terms (no training on customer data), optional PII redaction before
  sending, usage metered per tenant.
- 3CX: V20 latest. Use (a) CRM Integration Template for lookup/journaling (works on all editions),
  (b) Call Control API REST+WebSocket and (c) Configuration API (XAPI), both OAuth2 client
  credentials and requiring an 8SC+ license. Degrade gracefully when (b)/(c) are unavailable.
- No vCRMOCR integration.

## TECH STACK

- Monorepo: pnpm + Turborepo. apps/web (Next.js 14+ App Router, TypeScript, Tailwind, shadcn/ui,
  TanStack Query, next-intl th/en), apps/api (NestJS, TypeScript), apps/worker (BullMQ workers),
  apps/widget (embeddable livechat widget, vanilla TS/Preact, <50KB), packages/shared (types, zod schemas).
- PostgreSQL 16 via Prisma; every tenant-scoped table has tenant_id + Postgres Row-Level Security.
- Redis (cache, BullMQ, Socket.IO adapter). Socket.IO for realtime.
- OpenSearch for full-text (Thai ICU analyzer) on messages and KB articles.
- S3-compatible storage (MinIO locally) for attachments and recordings.
- Auth: OIDC (Keycloak) with fallback local JWT; RBAC permissions "module.action" + data scope
  (own/team/all).
- AI: provider interfaces SttProvider, LlmProvider, EmbeddingProvider with adapters selectable per
  tenant. All LLM outputs must be validated against zod JSON schemas; store model_version and
  prompt_version.
- SaaS infra: AWS EKS, RDS PostgreSQL, ElastiCache Redis, S3 (SSE-KMS), OpenSearch Service, SES,
  CloudFront + WAF, Secrets Manager (per-tenant integration secrets). Terraform + Helm + Argo CD.
- Docker Compose for local dev (postgres, redis, minio, opensearch, keycloak, mailhog, mock 3CX,
  mock AI providers). OpenTelemetry tracing, pino logs.

## ARCHITECTURE RULES

- Modular monolith: one NestJS module per bounded context (iam, tenant, billing, contact, interaction,
  case, workflow, omnichannel, telephony, ai, qm, survey, kb, notification, connector, report, audit).
  Modules talk via application services or domain events (in-process EventEmitter + outbox table),
  never by querying each other's tables directly.
- Every inbound channel goes through a Channel Adapter that normalizes to InboundMessage/CallEvent.
- Every create/update/delete and every view of PII writes to AuditLog.
- PDPA by design: Consent per purpose/version, PII field classification, masking unless the user
  has "contact.pii.view", retention jobs, data-subject export/anonymize.
- Configuration over code: ticket types, categories, workflows, SLA, forms, surveys, routing are
  tenant data, editable in the Admin console.
- Timezone Asia/Bangkok default; support Thai Buddhist year display option.

## CODING STANDARDS

- TypeScript strict. DTOs validated with zod or class-validator. OpenAPI generated from code.
- REST: /api/v1/..., cursor pagination, filter/sort query params, RFC 7807 errors, idempotency
  keys for inbound webhooks.
- Tests: unit (Vitest/Jest) for domain logic, e2e (supertest) per endpoint, Playwright for key UI flows.
  Minimum: every service method with business rules has tests.
- Seed script with realistic Thai demo data (names, phone 08x, addresses).
- UI: responsive, accessible (WCAG AA), Thai/English i18n, dark mode, keyboard shortcuts in
  Agent Workspace.

## WORKING AGREEMENT

- Before coding each task: restate the scope, list files to create/change, and the data model delta.
- Work in small, runnable increments; after each increment run lint + tests and fix failures.
- Never invent external API behaviour silently: if unsure (3CX, LINE, Facebook, AI vendors), put it
  behind an adapter interface, add a mock implementation, and list the open question in
  docs/OPEN_QUESTIONS.md.
- Keep docs/ARCHITECTURE.md and docs/DATA_MODEL.md updated as you go.

## PROJECT FILES TO READ

- docs/SYSTEM_DESIGN.md — full system design (Thai + English). Source of truth for architecture & data model.
- docs/PHASE_PROMPTS.md — scope and acceptance criteria per phase (Phase 0–8) + review prompt.
- docs/tasks/phase-N.md — the current task breakdown. Work ONLY on the task the user names.
- docs/OPEN_QUESTIONS.md — append questions here instead of guessing.
- docs/TRACEABILITY.md — checklist function → task mapping; fill UAT case/status when tasks finish.
- docs/ARCHITECTURE.md, docs/DATA_MODEL.md — keep updated as you build.
- docs/integrations/3cx-v20.md — record verified 3CX payloads here.

## CURRENT STATUS

- Current phase: Phase 0 — Foundation (see docs/tasks/phase-0.md)
- Update this section at the end of every phase.
