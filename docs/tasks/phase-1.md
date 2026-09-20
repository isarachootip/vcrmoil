# Phase 1 — Account Management & Customer 360 · Task Breakdown

> Scope: `docs/PHASE_PROMPTS.md` → Prompt 2 · ระยะเวลาโดยประมาณ 3 สัปดาห์
> วิธีใช้: _"Implement task 1.x only. Run lint + tests, fix failures, tick the checkbox, then stop."_

| Status | ID   | Task                                                   | Depends on | Est. |
| ------ | ---- | ------------------------------------------------------ | ---------- | ---- |
| [ ]    | 1.1  | Contact & Account data model                           | Phase 0    | 1d   |
| [ ]    | 1.2  | Phone/email normalization & ContactIdentity            | 1.1        | 0.5d |
| [ ]    | 1.3  | Custom field definitions per tenant                    | 1.1        | 1d   |
| [ ]    | 1.4  | Contact & Account CRUD APIs                            | 1.1–1.3    | 1d   |
| [ ]    | 1.5  | Duplicate detection & "new contact" process            | 1.4        | 1d   |
| [ ]    | 1.6  | Contact merge                                          | 1.5        | 1d   |
| [ ]    | 1.7  | Search (Postgres + OpenSearch index)                   | 1.4        | 1d   |
| [ ]    | 1.8  | CSV import/export with field mapping                   | 1.4        | 1d   |
| [ ]    | 1.9  | Segments (static + dynamic rule builder)               | 1.4        | 1.5d |
| [ ]    | 1.10 | PDPA: consent, PII classification & masking            | 1.4        | 1.5d |
| [ ]    | 1.11 | PDPA: DSR (export/anonymize/restrict) & retention jobs | 1.10       | 1.5d |
| [ ]    | 1.12 | Interaction timeline (entity, API, events)             | 1.1        | 1d   |
| [ ]    | 1.13 | Contact list & detail UI                               | 1.4, 1.7   | 1.5d |
| [ ]    | 1.14 | Customer 360 dashboard UI                              | 1.12, 1.13 | 1.5d |
| [ ]    | 1.15 | Public lookup API (for 3CX later) & Phase review       | all        | 0.5d |

---

## 1.1 Contact & Account data model

- `Account` (company: name, tax_id, type, owner), `Contact` (names, phones[], emails[], account_id?, tags, vip flag, owner, is_anonymized, custom_fields jsonb), soft delete
- RLS policies + indexes (tenant_id + phone/email)
- **Done when:** migration applied; RLS test extended to new tables.

## 1.2 Normalization & ContactIdentity

- libphonenumber: store E.164 (+66…), accept 0xx / +66 / 66 formats; lowercase emails
- `ContactIdentity(channel: phone|email|line|facebook|livechat, external_id)` unique per tenant
- **Done when:** unit tests for Thai mobile/landline variants and duplicate identity rejection.

## 1.3 Custom fields

- `FieldDefinition(entity, key, label_th, label_en, type: text|number|date|select|multiselect|boolean, required, pii_class, options)`; validation of `custom_fields` against definitions
- Admin UI to manage fields
- **Done when:** invalid custom field value → 400 with field-level error.

## 1.4 CRUD APIs

- `/contacts`, `/accounts` list (cursor pagination, filters, sort), get, create, patch, soft delete; permission + data scope; audit
- **Done when:** e2e for each endpoint incl. Agent scope = own/team.

## 1.5 Duplicate detection & new-contact process

- Match rules (exact phone, exact email, fuzzy Thai name + same account) with score; `POST /contacts/check-duplicates`
- UI wizard: required fields per tenant config → duplicate check → consent capture step → save
- **Done when:** creating a contact with an existing phone shows matches before save.

## 1.6 Merge

- Choose master record, field-by-field pick; move identities, interactions, tickets (future FK-safe via domain event `contact.merged`), consents; audit merged ids
- **Done when:** test proves all child records point to the master after merge.

## 1.7 Search

- Quick search box (name, phone, email, LINE/FB id); OpenSearch index with Thai ICU analyzer; reindex job on `contact.*` events
- **Done when:** Thai partial-name search returns expected results.

## 1.8 Import/export

- Upload CSV/XLSX → column mapping UI → preview → background job with error report file; export filtered list (permission `contact.export`, audited)
- **Done when:** 10k-row import completes in background with row-level errors.

## 1.9 Segments

- Static list + dynamic rule JSON (field, operator, value, AND/OR groups); preview count; materialize membership nightly + on demand
- **Done when:** rule builder UI saves and count matches SQL.

## 1.10 Consent & masking

- `Consent(purpose, lawful_basis, status, notice_version, channel, captured_at, expires_at)`; history; withdraw
- `PrivacyNotice` versions per tenant; PII classification from FieldDefinition
- Serializer masks PII unless `contact.pii.view`; "Reveal" button writes PII-view audit
- **Done when:** API returns masked vs clear values by permission (tests).

## 1.11 DSR & retention

- DSR request entity (access/rectify/erase/restrict/object) with due date (30 days) and workflow
- Export all data of a contact (JSON + PDF); anonymize (irreversible, keeps statistics); restrict flag blocks marketing/survey
- `RetentionPolicy` per data type; nightly job
- **Done when:** anonymize test removes PII from contact, identities, messages placeholder hooks.

## 1.12 Interaction timeline

- `Interaction(channel, direction, ref_type, ref_id, agent_id, summary, sentiment, intent, started_at, ended_at)`; listener API for other modules (`interaction.record()`)
- `GET /contacts/:id/interactions` filter by channel/date
- **Done when:** manual note/call-log interaction appears on timeline.

## 1.13 Contact UI

- List (saved filters, columns chooser), detail page tabs (Profile, Timeline, Tickets placeholder, Consent, Segments), create/edit forms from field definitions
- **Done when:** Playwright: create → search → edit contact.

## 1.14 Customer 360

- Header (name, account, VIP, tags, consent badges), KPI cards (open tickets, last contact, CSAT avg, sentiment trend — placeholders until data exists), timeline, external data panel (Connector stub)
- **Done when:** page loads < 1s with seeded data.

## 1.15 Lookup API & review

- `GET /api/v1/contacts/lookup?phone=` (API-key auth for integrations) returns minimal non-masked fields per integration scope
- Run Prompt R, update docs, CURRENT STATUS → Phase 2
