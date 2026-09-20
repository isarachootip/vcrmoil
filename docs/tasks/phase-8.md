# Phase 8 — Reports, Hardening & Go-live · Task Breakdown

> Scope: `docs/PHASE_PROMPTS.md` → Prompt 9 · ระยะเวลาโดยประมาณ 3 สัปดาห์
> AI ห้ามรัน `terraform apply` หรือ deploy production เอง — เตรียมไฟล์/คำสั่งให้คนเป็นผู้รัน

| Status | ID   | Task                                               | Depends on     | Est. |
| ------ | ---- | -------------------------------------------------- | -------------- | ---- |
| [ ]    | 8.1  | Reporting semantic layer                           | Phase 7        | 1.5d |
| [ ]    | 8.2  | Dashboard builder & role dashboards                | 8.1            | 2d   |
| [ ]    | 8.3  | Scheduled reports (PDF/XLSX email)                 | 8.2            | 1d   |
| [ ]    | 8.4  | Analytics store (ClickHouse or materialized views) | 8.1            | 1.5d |
| [ ]    | 8.5  | Load testing & performance fixes                   | all phases     | 2d   |
| [ ]    | 8.6  | Security hardening (OWASP ASVS L2)                 | all phases     | 2d   |
| [ ]    | 8.7  | PDPA & AI governance verification                  | all phases     | 1d   |
| [ ]    | 8.8  | Terraform & Helm for staging/prod                  | Phase 0 (0.14) | 2d   |
| [ ]    | 8.9  | Observability, alerts & status page                | 8.8            | 1d   |
| [ ]    | 8.10 | Backup/restore drill & DR runbook                  | 8.8            | 1d   |
| [ ]    | 8.11 | Tenant onboarding/offboarding & billing go-live    | Phase 0 (0.12) | 1.5d |
| [ ]    | 8.12 | Documentation (admin, agent, API, integrations)    | all            | 2d   |
| [ ]    | 8.13 | UAT support & go-live checklist                    | all            | 1d   |

---

## 8.1 Semantic layer

- Metrics & dimensions catalog (tickets, chats, calls, QM, surveys, KB) with definitions in th/en; permission-aware queries
- **Done when:** every existing module report reads from the layer.

## 8.2 Dashboard builder

- Drag widgets (KPI, line, bar, table, heatmap), filters, date ranges, share with roles; default dashboards for Agent, Supervisor, Management
- **Done when:** user builds and shares a dashboard.

## 8.3 Scheduled reports

- Schedule (daily/weekly/monthly, Bangkok time), recipients, PDF/XLSX render, delivery log
- **Done when:** scheduled email arrives in MailHog.

## 8.4 Analytics store

- Decide by data volume: ClickHouse via CDC/outbox or nightly ETL; else Postgres materialized views with refresh jobs; document decision in ARCHITECTURE.md
- **Done when:** heavy dashboards < 2s at target volume.

## 8.5 Load test

- k6 scenarios: 500 concurrent agents, chat bursts, 50k interactions/day, 3CX event storms; fix N+1, add indexes, caching
- **Done when:** NFR targets in SYSTEM_DESIGN 2.11 met; report saved in docs/perf/.

## 8.6 Security

- ASVS L2 checklist, dependency & container scanning, secrets scan, rate limits, CSP/headers, webhook signature coverage, tenant-isolation fuzz tests, pen-test fix list
- **Done when:** no open P0/P1 findings.

## 8.7 PDPA & AI governance

- End-to-end DSR tests, retention jobs verified, PII audit coverage report, AI vendor DPA checklist, redaction verification, privacy notice cross-border wording
- **Done when:** signed-off checklist in docs/compliance/.

## 8.8 Infra

- Terraform modules applied by humans for staging then prod (ap-southeast-7 or Singapore), multi-AZ RDS, EKS autoscaling, WAF, KMS; Helm charts + Argo CD apps; blue/green or canary
- **Done when:** staging deployed from main automatically.

## 8.9 Observability

- OpenTelemetry → tracing backend, Prometheus/Grafana dashboards (API, workers, queues, sockets, 3CX gateway, AI cost), alerts, public status page
- **Done when:** alert fires on synthetic failure.

## 8.10 Backup & DR

- RDS PITR (RPO 15m), S3 versioning/replication, restore drill documented (RTO 4h)
- **Done when:** restore drill completed and timed.

## 8.11 Tenant lifecycle & billing

- Self-service or sales-led onboarding flow, setup wizard (channels, 3CX, users), billing provider live (Stripe/Omise), usage-based invoices, offboarding export + deletion
- **Done when:** trial → paid → offboard tested.

## 8.12 Docs

- Admin guide, agent guide (Thai), API reference (OpenAPI portal), integration guides (3CX V20 incl. license, LINE, Facebook, email), onboarding guide
- **Done when:** docs published.

## 8.13 Go-live

- UAT scripts per module (mapped to Checklist), defect triage, go-live checklist, hypercare plan
- **Done when:** all 61 Checklist functions traced to passing UAT cases.
