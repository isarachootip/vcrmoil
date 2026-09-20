# Phase 0 — Foundation · Task Breakdown

> Scope อ้างอิง `docs/PHASE_PROMPTS.md` → Prompt 1
> วิธีใช้: สั่ง AI ทีละ task เช่น _"Implement task 0.3 only. Run lint + tests, fix failures, update this file's checkbox, then stop."_
> AI แก้ไข/แตก task เพิ่มได้ แต่ต้องขออนุมัติก่อน

| Status | ID   | Task                                                | Depends on | Est. |
| ------ | ---- | --------------------------------------------------- | ---------- | ---- |
| [x]    | 0.1  | Monorepo scaffold                                   | —          | 0.5d |
| [ ]    | 0.2  | Local infrastructure (Docker Compose)               | 0.1        | 0.5d |
| [ ]    | 0.3  | API skeleton (NestJS core)                          | 0.1        | 0.5d |
| [ ]    | 0.4  | Database, Prisma & tenant RLS                       | 0.2, 0.3   | 1d   |
| [ ]    | 0.5  | Tenant resolution & SaaS provisioning               | 0.4        | 1d   |
| [ ]    | 0.6  | IAM: users, teams, roles, permissions, skills       | 0.4        | 1d   |
| [ ]    | 0.7  | Authentication (Keycloak OIDC + local JWT fallback) | 0.2, 0.6   | 1d   |
| [ ]    | 0.8  | Audit log                                           | 0.4        | 0.5d |
| [ ]    | 0.9  | Domain events + outbox                              | 0.4        | 0.5d |
| [ ]    | 0.10 | Worker app (BullMQ)                                 | 0.2, 0.9   | 0.5d |
| [ ]    | 0.11 | Web app shell                                       | 0.1, 0.7   | 1d   |
| [ ]    | 0.12 | Plans, feature flags & usage metering               | 0.5        | 0.5d |
| [ ]    | 0.13 | CI pipeline                                         | 0.1        | 0.5d |
| [ ]    | 0.14 | Terraform skeleton (AWS, plan only)                 | —          | 0.5d |
| [ ]    | 0.15 | Seed data, README & Phase 0 review                  | all        | 0.5d |

---

## 0.1 Monorepo scaffold

- pnpm workspaces + Turborepo: `apps/web`, `apps/api`, `apps/worker`, `apps/widget`, `packages/shared`, `packages/config` (eslint/tsconfig presets)
- TypeScript strict, ESLint, Prettier, Husky + lint-staged, commitlint (conventional commits), `.editorconfig`, `.nvmrc` (Node 20 LTS)
- **Done when:** `pnpm install && pnpm lint && pnpm typecheck` pass on an empty skeleton.

## 0.2 Local infrastructure

- `docker-compose.yml`: postgres:16 (with `infra/docker/postgres/init-db.sql` creating `vcrm_owner` and `vcrm_app` roles without BYPASSRLS), redis:7, minio (+ bucket init), opensearch (single node, Dockerfile/entrypoint installing `analysis-icu` plugin), keycloak (realm import `infra/keycloak/vcrm-realm.json`), mailhog
- Placeholders for `mock-3cx` and `mock-ai` services (simple Node servers, filled in later phases)
- `.env.example` complete; healthchecks for every container
- **Done when:** `docker compose up -d` → all healthy.

## 0.3 API skeleton

- NestJS app: ConfigModule (zod-validated env), pino logger with request id, global RFC 7807 exception filter, validation pipe, `/api/v1` prefix, OpenAPI at `/api/docs`, `/health` (db, redis), graceful shutdown, OpenTelemetry bootstrap (no-op exporter locally), and baseline Socket.IO gateway (`EventsGateway` with Redis adapter)
- **Done when:** `GET /health` = 200 and Swagger UI loads.

## 0.4 Database, Prisma & tenant RLS

- Prisma schema: `Tenant`, base columns convention (`id uuid`, `tenant_id`, `created_at`, `updated_at`, `created_by`)
- Postgres RLS policies on every tenant table using `current_setting('app.tenant_id')`; app DB role without BYPASSRLS; migration role separate
- Request-scoped Prisma wrapper that runs `SET LOCAL app.tenant_id` inside a transaction
- **Done when:** e2e test proves tenant A cannot read/update tenant B rows even with a forged id.

## 0.5 Tenant resolution & SaaS provisioning

- Resolve tenant from subdomain `<slug>.<BASE_DOMAIN>` (and `X-Tenant` header for local dev only)
- `POST /api/v1/platform/tenants` (SuperAdmin): create tenant → default roles, admin user invite, default settings (timezone Asia/Bangkok, locale th)
- Tenant status: trial / active / suspended; suspended → 403 on all tenant APIs
- **Done when:** two tenants on `a.localhost` / `b.localhost` are isolated end-to-end.

## 0.6 IAM

- Entities: User, Team, Role, Permission (`module.action`), RolePermission, Skill, UserSkill(level 1–5), User.status (online/away/offline), User.maxConcurrentChats
- Seed roles: SuperAdmin, TenantAdmin, Supervisor, Agent, QAEvaluator, KBEditor, Viewer
- `@RequirePermission('x.y')` guard + data-scope helper (own / team / all)
- CRUD APIs for users/teams/roles/skills
- **Done when:** unit tests for guard & scope; Agent cannot call admin endpoints.

## 0.7 Authentication

- Keycloak OIDC (authorization code + PKCE) for web; JWT validation in API (JWKS); map Keycloak user → vCRM User per tenant
- Local JWT fallback strategy behind `AUTH_MODE=local` for tests
- **Done when:** login → call protected API → logout works locally.

## 0.8 Audit log

- `AuditLog` table (append-only: no UPDATE/DELETE grant), interceptor capturing actor, action, entity, before/after JSON, IP, user-agent
- `@AuditPiiView()` decorator for PII read events (used from Phase 1)
- **Done when:** creating/updating a user writes audit rows; test asserts content.

## 0.9 Domain events + outbox

- `OutboxEvent` table written in the same transaction as the change; dispatcher publishes to in-process EventEmitter and Redis Streams; idempotent consumer helper
- **Done when:** test shows event delivered once even if dispatcher restarts.

## 0.10 Worker app

- `apps/worker` with BullMQ queues registry, shared Prisma/tenant context for jobs, retry/backoff defaults, Bull Board UI (admin only)
- Sample job: `outbox-dispatch`
- **Done when:** job runs and is visible in Bull Board.

## 0.11 Web app shell

- Next.js App Router, Tailwind, shadcn/ui, TanStack Query, next-intl (th default, en), dark mode
- Layout: left nav (Customers, Cases, Conversations, Calls, Quality, Surveys, Knowledge Base, Reports, Admin) — placeholder pages
- Top bar: agent status switch, notification bell (placeholder), language toggle, user menu; SuperAdmin tenant switcher
- Typed API client generated from OpenAPI (`packages/shared`)
- **Done when:** Playwright test: login → shell renders in Thai → switch to English.

## 0.12 Plans, feature flags & usage metering

- `Plan`, `TenantSubscription`, `FeatureFlag` (e.g., `voice`, `omnichannel`, `ai_qm`, `survey`, `kb`), guard `@RequireFeature('ai_qm')`
- `UsageRecord` (tenant, metric: seats | stt_minutes | llm_input_tokens | llm_output_tokens | storage_gb, qty, period); billing provider = interface + stub
- **Done when:** disabling a feature hides nav item and returns 403 on its APIs.

## 0.13 CI pipeline

- GitHub Actions: install (cache), lint, typecheck, unit tests, e2e with service containers (postgres, redis), build, Docker images for api/worker/web
- **Done when:** pipeline green on a PR.

## 0.14 Terraform skeleton

- `infra/terraform`: modules VPC, EKS, RDS PostgreSQL, ElastiCache, S3 (SSE-KMS), OpenSearch, Secrets Manager; envs `staging`, `prod`; region variable (default `ap-southeast-7`)
- `terraform validate` + `plan` only — never apply from AI
- **Done when:** `terraform validate` passes.

## 0.15 Seed data, README & review

- Seed: 2 demo tenants, users for every role, Thai names/phones
- README (quick start), update `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`
- Run **Prompt R** from `docs/PHASE_PROMPTS.md`, fix P0/P1, update "CURRENT STATUS" in `CLAUDE.md` to Phase 1
- **Done when:** fresh clone → `pnpm setup && pnpm dev` works in < 10 minutes.
