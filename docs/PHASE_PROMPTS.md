# vCRM — Phase Prompts

> ใช้ทีละ phase ตามลำดับ (Prompt 0 อยู่ใน CLAUDE.md แล้ว)

### Prompt 1 — Phase 0: Foundation

```text
Using the master context, set up Phase 0 (Foundation) of vCRM.

Deliver:
1. Monorepo scaffold (apps/web, apps/api, apps/worker, apps/widget, packages/shared) with pnpm,
   Turborepo, ESLint, Prettier, Husky, commitlint.
2. docker-compose.yml: postgres, redis, minio, opensearch, keycloak, mailhog.
3. NestJS base: config module, Prisma, RLS middleware that sets app.tenant_id per request,
   global exception filter (RFC 7807), request logging, OpenAPI at /api/docs, health checks.
4. IAM: Tenant, User, Team, Role, Permission, Skill, UserSkill. Seed roles: SuperAdmin, TenantAdmin,
   Supervisor, Agent, QAEvaluator, KBEditor, Viewer. Permission guard decorator
   @RequirePermission('case.update') + data scope filter (own/team/all).
5. AuditLog module with an interceptor that records create/update/delete (before/after JSON).
6. Outbox table + domain event publisher/subscriber abstraction.
7. Web: login (OIDC), app shell with left nav for all modules (placeholders), top bar with agent
   status switch (online/away/offline), tenant switcher for SuperAdmin, th/en toggle, dark mode.
8. SaaS tenancy: tenant signup/provisioning (subdomain resolution <tenant>.vcrm.app, default
   roles, sample config), plans + feature flags (e.g., AI QM, Omnichannel, Voice), usage metering
   table (seats, AI STT minutes, LLM tokens, storage) — billing provider integration is a stub.
9. GitHub Actions: lint, typecheck, test, build, container image. Terraform skeleton for AWS
   (VPC, EKS, RDS, ElastiCache, S3, OpenSearch, Secrets Manager) — plan only, no apply.
10. README with one-command local startup.

Acceptance: `pnpm dev` runs everything; a seeded admin can log in; creating a user writes an audit
record; RLS prevents cross-tenant reads (prove with an e2e test); two tenants resolve by subdomain.
```

### Prompt 2 — Phase 1: Account Management & Customer 360

```text
Implement Phase 1: Account Management.

Data: Account, Contact, ContactIdentity (channel + external_id for phone/email/LINE UID/FB PSID),
Segment (static list or dynamic rule JSON), Consent (purpose, lawful_basis, status, notice_version,
channel, captured_at, expires_at), Interaction (unified timeline: channel, direction, ref_type,
ref_id, agent, summary, sentiment, intent, started_at/ended_at), custom field definitions per tenant.

Features:
- Contact CRUD, search (name, phone normalized to E.164 +66, email, LINE/FB id), duplicate
  detection and merge (keep audit of merge), import/export CSV with field mapping.
- "New contact" process: required fields config, duplicate check before save, consent capture step.
- Segments: rule builder UI (field, operator, value, AND/OR), preview count, use by Survey later.
- PDPA: consent history, withdraw consent, PII masking unless contact.pii.view, audit every PII view,
  Data Subject Request screen (export JSON/PDF, anonymize, restrict processing), retention policy
  config + nightly job.
- Customer 360 page: header (profile, segments, consent badges, VIP/tags), KPIs (open tickets,
  last contact, CSAT avg, sentiment trend), unified Interaction timeline filterable by channel,
  panel for external data from the Connector module (stub for now).
- Public API: GET /contacts/lookup?phone= (used later by 3CX), POST /contacts, PATCH, merge.

Acceptance tests: phone normalization, dedup rules, merge moves all interactions/tickets,
masked vs unmasked responses by permission, consent withdrawal blocks survey sending flag.
```

### Prompt 3 — Phase 2: Case Management

```text
Implement Phase 2: Case Management.

Data: Ticket (running number per tenant e.g. TCK-2026-000123), TicketType, Category (tree:
category/sub-category), Priority, SlaPolicy (first response + resolution targets, business hours,
holiday calendar), Workflow (versioned JSON state machine: states, transitions, allowed roles,
required fields per transition), TicketNote (visibility internal/all, @mentions, attachments),
TicketActivity, Reminder, Rule (WHEN event AND conditions THEN actions).

Features:
1. Manual create from Customer 360 or Agent Workspace; link to originating interaction.
2. Auto-create: email (IMAP + Microsoft Graph adapters; threading by [#TCK-xxxx] in subject and
   Message-ID headers), public web form (form builder, captcha, maps fields to ticket), API endpoint
   for call/chat (used in later phases).
3. Workflow engine: default lifecycle New → Open → In Progress ⇄ Pending Customer → Resolved →
   Closed, with Reopened; admin visual editor (React Flow) to edit states/transitions per ticket type.
4. SLA: timers in BullMQ, pause during Pending Customer, warning at 80%, breach escalation.
5. Auto-close: configurable N days in Resolved or Pending Customer without reply; notify customer.
6. Rules engine: events (ticket.created, status_changed, sla.warning, sla.breached, note.added),
   conditions on any field, actions (assign user/team/round-robin, set field, notify, webhook,
   send survey).
7. Notes with rich text, @mention triggers notification, attachments to S3 with virus-scan hook.
8. Reminders per ticket per user with in-app + email notification.
9. Activity log UI showing every field change and transition.
10. Notification module: in-app (Socket.IO bell), email templates (Handlebars, th/en), LINE push
    adapter interface.
11. Connector module: tenant-configurable REST connector (URL, auth, request template, JSONPath
    response mapping, cache TTL) to show Customer / Product / Sales info on ticket and Customer 360.
12. Views: ticket list with saved filters, kanban by status, my tickets, team tickets, SLA risk.
13. Reports: volume by type/category/channel, backlog aging, SLA compliance %, FRT/ART, agent
    productivity; export CSV/XLSX; dashboard widgets.

Acceptance: e2e tests for email-to-ticket threading, SLA pause/resume math with business hours,
auto-close job, workflow transition permission, rule execution order.
```

### Prompt 4 — Phase 3: Omnichannel (LINE, Facebook, Livechat)

```text
Implement Phase 3: Non-voice & Social Media Integration.

Channel adapters (each implements ChannelAdapter { verifyWebhook, parseInbound, sendMessage,
sendFile, getProfile }):
- LINE Messaging API (webhook signature X-Line-Signature, reply/push, images/files/stickers,
  multiple OA per tenant).
- Facebook Messenger (webhook verify token, X-Hub-Signature-256, Page access token per page).
- Web livechat widget (apps/widget): embeddable script, configurable theme, pre-chat form
  (configurable fields, maps to contact), file upload, clickable links, typing indicator,
  reconnect, CSAT at end.

Conversation engine:
- Conversation + Message model, Queue (skills, routing strategy), agent concurrency limit.
- Routing: agent must be online, have queue skill, active_chats < max; order by skill level desc,
  active_chats asc, last_assigned_at asc. Queue position messages and timeout → offline message
  → auto ticket.
- Contact mapping: resolve ContactIdentity; if unknown, create provisional contact and let agent
  map/merge from the chat panel.
- Agent Workspace: 3-column layout (conversation list with queues/labels | chat thread | contact
  360 side panel with tickets + KB search + agent assistant), multiple concurrent chats, canned
  responses with "/" shortcut and variables, labels, internal notes, transfer to agent/queue with
  context, end chat with result code, chat-to-case (prefill ticket from conversation).
- Supervisor: live queue monitor, agent status board, force reassign, whisper-free monitoring.
- Search chat messages by keyword (OpenSearch, Thai ICU tokenizer) with filters.
- Chat dashboard: volume, wait time, handle time, CSAT, per-agent; hourly × weekday heatmap.
- Hooks (interfaces only, implemented in Phase 5): ChatbotService before queueing, AgentAssist
  suggestions, ChatSummaryService on end chat.

Acceptance: webhook signature tests, routing algorithm unit tests (including concurrency and skill
edge cases), Playwright test of widget → agent reply → end chat → CSAT → interaction on timeline.
```

### Prompt 5 — Phase 4: Voice Integration (3CX)

```text
Implement Phase 4: Voice Integration with 3CX V20 (latest update). vCRMOCR is NOT used.
Put everything behind a PbxAdapter interface with ThreeCxV20Adapter and MockPbxAdapter (dev/tests).
Follow the official 3CX docs (CRM Integration Template, Call Control API, Configuration API/XAPI
endpoint specifications); where a payload is uncertain, make it configurable and log it in
docs/OPEN_QUESTIONS.md.

0. Tenant 3CX connection settings (Admin UI): 3CX FQDN, license tier (detect/declare 8SC+),
   Call Control client id/secret, XAPI client id/secret (stored in Secrets Manager), CRM-template
   API key, "Test connection" button. OAuth2 client-credentials token cache with refresh before
   60-minute expiry.
1. CRM Integration Template: generate a downloadable 3CX CRM template (per tenant, pre-filled
   with the tenant URL and API key) that configures:
   - Contact lookup by number → GET /api/v1/telephony/3cx/lookup?number=  (E.164 + Thai local
     formats), returns contact id, first/last name, company, email, phones, contact URL
   - Contact creation for unknown callers (optional per tenant)
   - Call journaling → POST /api/v1/telephony/3cx/journal (call id, direction, from/to, agent
     extension, queue, start/answer/end, duration, result) → Call + Interaction
   - Chat journaling (3CX live chat/messaging) → Interaction
   Authenticate by tenant API key; rate-limit; idempotent on call id.
2. Realtime (8SC+): telephony-gateway worker keeps one Call Control API WebSocket per tenant,
   reconnects with backoff, subscribes to monitored extensions/queues, maps extension ↔ User
   (synced via XAPI), and pushes RINGING / ANSWERED / ENDED events to the agent's browser via
   Socket.IO within 1 second.
3. Screen-pop (built into vCRM): on RINGING open a pop-up/panel in Agent Workspace with caller
   identity, Customer 360 summary, open tickets, last interactions, and buttons "Create ticket",
   "Link to ticket", "New contact". Also expose /agent/screen-pop?phone=&callid=&ext= so the 3CX
   Web Client "open contact URL" works as a fallback when Call Control is not licensed.
4. Click-to-call and basic call actions (make call, transfer) from contact/ticket via Call Control API.
5. XAPI sync job: users/extensions, queues, departments → vCRM users/teams/queues/skills mapping UI.
6. Call recording: adapter strategies selectable per tenant — (a) 3CX API download if available
   in the tenant's version, (b) pull from the cloud storage/SFTP archive 3CX is configured to
   export recordings to. Store in S3 (SSE-KMS) with retention policy; secure playback (signed URL,
   waveform, speed control, audit every playback).
7. Call reports & dashboards inside vCRM (replaces vCRMCDR): volume by hour/day/queue/agent,
   answered/abandoned, ASA, AHT, talk time, top callers, call-to-ticket rate; export CSV/XLSX.
   Optional external vCRMCDR link per tenant.
8. Enqueue "analyze-call" when a recording is stored (processed in Phase 5).

Tests: lookup number normalization, journaling idempotency, WebSocket reconnect + event mapping
with MockPbxAdapter, screen-pop delivered only to the mapped agent, graceful degradation without
8SC+. Document all payloads in docs/integrations/3cx-v20.md.
```

### Prompt 6 — Phase 5: AI & Quality Management

```text
Implement Phase 5: AI features and Quality Management.

AI infrastructure (cloud only):
- SttProvider (th-TH + en, speaker diarization, word timestamps), LlmProvider, EmbeddingProvider
  with at least two cloud adapters each (e.g., Google Cloud Speech-to-Text / Azure AI Speech for
  STT; Anthropic Claude / Azure OpenAI or AWS Bedrock for LLM) + mock adapters for tests.
- Tenant-level provider/model selection, region setting, PII redaction toggle (Thai national ID,
  phone, bank account, email) applied before any external call.
- Prompt templates stored versioned in DB. All outputs validated with zod; retry with repair on
  invalid JSON; circuit breaker + queue so core CRM keeps working when AI is down.
- Usage metering per tenant (STT minutes, input/output tokens, cost) feeding the billing module,
  quotas and budget alerts. Model tiering: small model for sentiment/keywords, larger for summary/QM.
- A benchmark script (scripts/ai-benchmark) that runs a folder of Thai call recordings through each
  STT/LLM adapter and reports WER, latency and cost for vendor selection.

Call analysis job (worker) produces CallAnalysis:
{ transcript:[{speaker:"agent|customer", start, end, text}], summary, intent:{label, confidence},
  sentiment:{overall:"positive|neutral|negative", score, timeline:[{t, value}]},
  scriptChecklist:[{itemId, passed:boolean, evidence, timestamp}],
  keywords:[{term, count, category}], language }
- Intent labels and call-script checklist items are tenant-configurable.
- UI: call detail page with player synced to transcript (click line → seek), sentiment timeline,
  checklist results, keywords highlighted.

Chat AI:
- AI Chat Summary on end chat and on transfer.
- AI Chatbot: RAG over published, non-expired, public KB articles (pgvector or OpenSearch kNN),
  answer only from sources with citations, handoff rules (low confidence, user asks for human,
  negative sentiment, business rules), bot analytics (containment rate).
- Agent Assistant: suggested replies, relevant KB articles, next-best-action, grammar/tone polish
  in Thai.

Quality Management:
- EvaluationForm builder (sections, criteria, weights, auto-fail items, N/A).
- Evaluation of call or chat: AI pre-score mapped from scriptChecklist/sentiment, evaluator
  adjusts, agent acknowledges/disputes, calibration sessions.
- Sampling rules (e.g., 5% random + all negative sentiment + all calls > 10 min).
- QM dashboard: score by agent/team/criteria, sentiment distribution, top intents, keyword trends,
  script compliance %.

Acceptance: unit tests with mocked providers and golden JSON fixtures; test invalid LLM output is
repaired or rejected; evaluation scoring math tests.
```

### Prompt 7 — Phase 6: Survey

```text
Implement Phase 6: Survey.

- Survey builder: unlimited forms; question types (rating 1-5/1-10, NPS, CSAT smiley, single/multi
  choice, text, matrix), logic/branching, th/en, layout customization (theme, logo, colors,
  one-question-per-page vs single page), preview.
- Distribution: automated triggers (ticket closed, chat ended, call ended, via Rules engine) with
  throttling (e.g., not more than once per 7 days per contact) and consent check; manual send to a
  specific contact; bulk send to a Segment or uploaded list; channels LINE, email, SMS adapter, link.
- Unique token links, expiry, reminders, open/complete tracking.
- Responses written to Interaction timeline and linked ticket/agent.
- Real-time analysis: live dashboard via Socket.IO (response rate, CSAT/NPS, distribution,
  text-answer themes via LLM), filters by channel/agent/team/date, export.
```

### Prompt 8 — Phase 7: Knowledge Base

```text
Implement Phase 7: Knowledge Base.

- Hierarchical sections, tags, knowledge types (FAQ, How-to, Policy, Troubleshooting), templates
  library with easy customization, WYSIWYG editor (TipTap) plus raw HTML mode for advanced users
  (sanitize with DOMPurify server-side), document attachments.
- Authorization: visibility by role/team, public vs internal; draft → review → published workflow
  with versions and diff.
- Expiration: expire_at, reminder to owner before expiry, auto-unpublish.
- Analytics: views, likes/dislikes, feedback comments, contributions per author, search terms with
  no results.
- Search and filter by section hierarchy, tags, type (OpenSearch, Thai tokenizer); expose to Agent
  Workspace side panel, Agent Assistant and Chatbot RAG index (re-embed on publish).
- Optional public KB portal per tenant.
```

### Prompt 9 — Phase 8: Reports, Hardening & Go-live

```text
Implement Phase 8: cross-module reporting and production hardening.

- Report module: dashboard builder (drag widgets: KPI, line, bar, table, heatmap) using a
  semantic layer over reporting views; scheduled reports by email (PDF/XLSX); role-based dashboards
  for Agent, Supervisor, Management.
- Move analytics queries to ClickHouse (CDC via outbox/Debezium or nightly ETL) if data volume
  requires; keep Postgres materialized views as fallback.
- Performance: load test with k6 (500 concurrent agents, 50k interactions/day); fix N+1s, add indexes.
- Security: OWASP ASVS L2 checklist, dependency scanning, rate limiting, secret management,
  pen-test fixes.
- PDPA: verify DSR flows end-to-end, retention jobs, audit coverage report.
- SaaS ops on AWS: Terraform apply for staging/prod, Helm + Argo CD, RDS automated backups + PITR
  (RPO 15m), multi-AZ, autoscaling (HPA + cluster autoscaler), per-tenant rate limits, tenant
  export/offboarding (delete all data on contract end), status page, runbooks, Grafana alerts.
- AI governance: DPA checklist per AI vendor, PII redaction verification tests, cost dashboard per tenant.
- Docs: admin guide, agent guide (Thai), API reference, integration guides (3CX V20 incl. license
  requirements, LINE, Facebook, email), tenant onboarding guide.
```

### Prompt R — Review หลังจบแต่ละ Phase

```text
Act as a strict principal engineer reviewing the Phase just completed against the master context
and the phase prompt.
1. List every requirement of the phase and mark Done / Partial / Missing with file references.
2. Check: tenant isolation (RLS + tests), permission checks on every endpoint, audit logging,
   PII masking, input validation, error handling, idempotent webhooks, N+1 queries, missing indexes,
   test coverage of business rules, i18n (no hard-coded Thai/English strings in UI).
3. Run lint, typecheck and all tests; report results.
4. Produce a prioritized fix list (P0 security/data, P1 functional, P2 quality) and then fix all
   P0 and P1 items.
5. Update docs/ARCHITECTURE.md, docs/DATA_MODEL.md and docs/OPEN_QUESTIONS.md.
```

---

### Prompt พิเศษ — ถ้าต้องการให้ AI ช่วยทำเอกสาร (ไม่ใช่เขียนโค้ด)

```text
จากข้อมูล vCRM Function Checklist และ System Design ด้านบน ช่วยจัดทำ:
1) Business Requirement Document (BRD) ภาษาไทย แยกตามโมดูล ระบุ User Story รูปแบบ
   "ในฐานะ <บทบาท> ฉันต้องการ <สิ่งที่ต้องการ> เพื่อ <ประโยชน์>" พร้อม Acceptance Criteria (Given/When/Then)
2) Functional Specification ต่อฟังก์ชัน: input, process, output, business rule, error case, สิทธิ์ผู้ใช้
3) Requirement Traceability Matrix: Checklist item → User Story → API → Screen → Test Case
4) รายการคำถามที่ต้องยืนยันกับลูกค้า (Open Questions) โดยเฉพาะ 3CX V20 (license 8SC+, รูปแบบ hosting,
   ที่เก็บ recording), PDPA, การเลือก AI cloud vendor/region และ SLA
บริบทที่ยืนยันแล้ว: ให้บริการแบบ SaaS, ใช้ AI บน cloud, เชื่อมต่อ 3CX V20 เวอร์ชันล่าสุด, ไม่ใช้ vCRMOCR
ให้ตอบเป็นตาราง Markdown และใช้ศัพท์เทคนิคภาษาอังกฤษในวงเล็บเมื่อจำเป็น
```
