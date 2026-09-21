# Architecture (living document)

> AI: update this file at the end of every task that changes structure. Source design: SYSTEM_DESIGN.md.

## Repository layout

```
vcrm/
├── apps/
│   ├── api/            # NestJS backend API (@vcrm/api)
│   ├── web/            # Next.js 14+ App Router frontend (@vcrm/web)
│   ├── worker/         # BullMQ background worker (@vcrm/worker)
│   └── widget/         # Embeddable livechat widget (@vcrm/widget)
├── packages/
│   ├── shared/         # Shared domain models, enums, Zod schemas, ProblemDetails (@vcrm/shared)
│   └── config/         # Shared ESLint and TypeScript presets (@vcrm/config)
├── infra/              # Docker compose, Terraform, Keycloak realm (Task 0.2, 0.14)
├── docs/               # System design, architecture, data model, tasks
└── .agents/            # Agent rules and workflow commands
```

## Runtime components

- **@vcrm/api**: Modular monolith NestJS application serving `/api/v1` REST endpoints, OpenAPI docs, and Socket.IO realtime events.
- **@vcrm/worker**: BullMQ background workers for async processing (outbox events, SLA calculations, survey delivery).
- **@vcrm/web**: Next.js 14+ Web client (Agent Workspace, Customer 360, Admin Console).
- **@vcrm/widget**: Vanilla TS embeddable widget (<50KB target) for web livechat.
- **@vcrm/shared**: Shared schemas and types consumed across backend, frontend, and workers.

## Architecture Decision Records

| ADR | Date       | Decision                                                       | Reason                                             |
| --- | ---------- | -------------------------------------------------------------- | -------------------------------------------------- |
| 001 | 2026-09-20 | SaaS multi-tenant on AWS, cloud AI, 3CX V20 latest, no vCRMOCR | Business decision (see SYSTEM_DESIGN Decision Log) |
| 002 | 2026-09-21 | Append-only AuditLog with RLS isolation & @AuditPiiView        | PDPA compliance, non-repudiation and access audit  |
