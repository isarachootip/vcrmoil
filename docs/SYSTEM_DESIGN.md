# vCRM — System Design

> อ้างอิงจาก: _CRD2026 - nexCRM - Checklist.xlsx_ (ชื่อเดิมของผลิตภัณฑ์ในไฟล์ต้นฉบับ; ในเอกสารนี้ใช้ชื่อ vCRM) · Updated 27 Oct 2025
> จัดทำ: 20 Sep 2026 · สถานะ: **v1.1** — ปรับตามข้อตัดสินใจ: AI บน Cloud · ให้บริการแบบ SaaS · 3CX V20 เวอร์ชันล่าสุด (Update 10) · ไม่ใช้ vCRMOCR

### ข้อตัดสินใจที่ยืนยันแล้ว (Decision Log)

| #   | เรื่อง     | ข้อตัดสินใจ                       | ผลต่อการออกแบบ                                                                                                               |
| --- | ---------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| D1  | AI         | ใช้ AI บน Cloud                   | STT/LLM/Embedding เรียกผ่าน cloud API; ต้องมี DPA กับผู้ให้บริการ, เลือก region ใกล้ไทย, เปิด PII redaction ได้ต่อ tenant    |
| D2  | Deployment | SaaS multi-tenant                 | Cloud-native (Kubernetes managed), tenant self-service onboarding, billing/plan, subdomain ต่อ tenant                        |
| D3  | 3CX        | V20 ล่าสุด (Update 10, ก.ย. 2026) | ใช้ CRM Integration Template + Call Control API (WebSocket) + Configuration API (XAPI); ลูกค้าต้องมี license 8SC+ สำหรับ API |
| D4  | vCRMOCR    | ไม่ใช้                            | Screen-pop ทำเองผ่าน 3CX Call Control API + URL จาก 3CX client; Report โทรทำใน vCRM เอง (vCRMCDR เป็นทางเลือกลิงก์ภายนอก)    |

---

## ส่วนที่ 1 — ผลการศึกษา Checklist

### 1.1 ภาพรวม

Checklist มี **7 โมดูล / 61 ฟังก์ชัน** (+ Report & Dashboard อยู่ในหลายโมดูล) แบ่งการทำงานด้วย 3 คอลัมน์ ซึ่งผมตีความดังนี้

| คอลัมน์       | ความหมายที่ใช้ในการออกแบบ                                            |
| ------------- | -------------------------------------------------------------------- |
| **CRM = Yes** | ฟังก์ชัน core ที่ vCRM ต้องสร้างเอง                                  |
| **AI = Yes**  | ต้องมี AI pipeline (LLM / Speech-to-Text / NLP)                      |
| **API = Yes** | ข้อมูลมาจาก/ส่งไประบบภายนอกผ่าน API (ส่วนใหญ่คือ 3CX หรือระบบลูกค้า) |

| #   | Module                                  | จำนวนฟังก์ชัน | ลักษณะ               | Dependency                                           |
| --- | --------------------------------------- | ------------- | -------------------- | ---------------------------------------------------- |
| 1   | Account Management                      | 3             | Core CRM             | ต้องมี process สร้าง contact ใหม่                    |
| 2   | Case Management                         | 14            | Core CRM + Workflow  | ต้องมี workflow engine                               |
| 3   | Quality Management                      | 8             | AI-heavy             | ต้องได้ข้อมูล/เสียงจาก 3CX                           |
| 4   | Survey                                  | 6             | Core CRM             | —                                                    |
| 5   | Non-Voice & Social (LINE, Facebook)     | 18            | Omnichannel realtime | LINE OA, FB Messenger                                |
| 6   | Knowledge Base                          | 7             | Content mgmt         | —                                                    |
| 7   | Voice Integration (3CX)                 | 5             | Integration          | 3CX V20 (ตัด vCRMOCR ออก — ทำ screen-pop/report เอง) |
| 8   | (Report & Dashboard กระจายอยู่ทุกโมดูล) | —             | Analytics            | —                                                    |

### 1.2 ข้อสังเกตเชิงสถาปัตย์ (สิ่งที่ Checklist บอกโดยนัย)

1. **Customer 360 คือหัวใจ** — Interaction tracking รวม Call/Chat/Ticket/Survey ไว้ที่ contact เดียว → ต้องมี `Interaction` เป็น entity กลาง (timeline) ไม่ใช่แยกเก็บแต่ละช่องทาง
2. **Ticket เกิดได้จากทุกช่องทาง** (mail, form, call, chat) → ต้องมี _Channel Adapter + Event Bus_ ที่แปลงทุกอย่างเป็น event มาตรฐานก่อนเข้า Case engine
3. **QM ขึ้นกับเสียงจาก 3CX** → ต้องมี pipeline: ดึง recording → Speech-to-Text (ภาษาไทย) → LLM วิเคราะห์ (summary, intent, sentiment, script checklist, keyword) → เก็บผลเพื่อทำ Call Evaluation
4. **Customers/Products/Sales information (API)** — ระบบต้องดึงข้อมูลจาก ERP/Core ของลูกค้า → ออกแบบเป็น _External Data Connector_ แบบ config ได้ (REST mapping) ไม่ hard-code
5. **PDPA** ปรากฏใน Contact management → ต้องออกแบบตั้งแต่ data model (consent, purpose, retention, masking, audit) ไม่ใช่เติมทีหลัง
6. สองรายการใน Checklist ระบุ "Require NeXOCR" (ชื่อเดิม = vCRMOCR) คือ screen-pop และ Report on NexCDR (ชื่อเดิม = vCRMCDR) → **เมื่อไม่ใช้ vCRMOCR** ให้ vCRM รับ realtime call event จาก 3CX Call Control API เอง และสร้าง Call Report/Dashboard จากข้อมูล call log ในระบบ
7. ให้บริการแบบ **SaaS multi-tenant** ตั้งแต่ต้น

### 1.3 Gap / คำถามที่ยังเปิดอยู่

| #   | ประเด็น                                                                | สถานะ / สมมติฐาน                                                                                                                                                        |
| --- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Products / Sales information (API) ทุกคอลัมน์เป็น "-" / "No"           | ยังเปิด — ทำเป็น Generic External Data Connector, Phase หลัง                                                                                                            |
| G2  | vCRMOCR                                                                | ✅ ปิดแล้ว — ไม่ใช้ (D4)                                                                                                                                                |
| G3  | 3CX เวอร์ชัน/license                                                   | ✅ V20 Update 10; ลูกค้าต้องมี license **8SC+** จึงใช้ Call Control API / Configuration API ได้ — ถ้าต่ำกว่า ใช้ได้เฉพาะ CRM Integration Template (lookup + journaling) |
| G4  | Deploy                                                                 | ✅ SaaS (D2)                                                                                                                                                            |
| G5  | AI                                                                     | ✅ Cloud (D1) — ยังต้องเลือก vendor และ region ที่ยอมรับได้ด้าน PDPA                                                                                                    |
| G6  | SLA ของ ticket                                                         | ยังเปิด — มี SLA policy ต่อ ticket type/priority                                                                                                                        |
| G7  | จำนวนผู้ใช้/ปริมาณ                                                     | ยังเปิด — สมมติ 500 agents ต่อ tenant, 1M contacts, 50k interactions/วัน                                                                                                |
| G8  | 3CX ของลูกค้าแต่ละรายเป็น 3CX-hosted, self-hosted cloud หรือ on-prem   | ยังเปิด — vCRM (SaaS) ต้องเข้าถึง FQDN ของ 3CX ผ่าน HTTPS/WSS ได้; on-prem หลัง NAT อาจต้องมี connector agent                                                           |
| G9  | ฟีเจอร์ AI summary/transcription ในตัว 3CX (มีใน V20) จะใช้ร่วมหรือไม่ | สมมติ: vCRM ทำ AI เองเพื่อควบคุม intent/script checklist/QM ภาษาไทย; เก็บเป็นตัวเลือกดึงผลของ 3CX มาแสดงได้                                                             |

---

## ส่วนที่ 2 — System Design

### 2.1 หลักการออกแบบ

- **Modular Monolith ก่อน, Microservices เมื่อจำเป็น** — ทีมเล็ก-กลางส่งงานได้เร็วกว่า แยก bounded context ชัดเจนเพื่อแตก service ภายหลัง (Telephony, AI, Chat realtime มีแนวโน้มแยกก่อน)
- **Event-driven ภายใน** — ทุกช่องทางแปลงเป็น domain event (`interaction.created`, `ticket.status_changed`, `call.ended` …)
- **API-first** — ทุกฟังก์ชันใน UI มี REST API (OpenAPI 3) เพื่อให้ลูกค้า integrate ได้
- **Privacy by design (PDPA)**
- **Configurable, not customized** — ticket type, category, workflow, SLA, survey, form, field เป็น config ต่อ tenant

### 2.2 High-level Architecture

```
 ┌────────────── Channels ──────────────┐
 │ LINE OA │ Facebook │ Web Livechat │ Email │ Web Form │ 3CX V20 (CRM Template · Call Control WSS · XAPI) │
 └────┬──────────┬──────────┬──────────┬────────┬─────────────┬────────┘
      ▼          ▼          ▼          ▼        ▼             ▼
 ┌──────────────────── Channel Adapters (webhook / IMAP / Graph / 3CX API) ───────────────────┐
 │  normalize → InboundMessage / CallEvent                                                      │
 └───────────────────────────────┬────────────────────────────────────────────────────────────┘
                                 ▼
                     ┌───────── Event Bus (Redis Streams / NATS / Kafka) ─────────┐
                     ▼                  ▼                    ▼                   ▼
             ┌─────────────┐   ┌───────────────┐   ┌─────────────────┐  ┌───────────────┐
             │ Conversation│   │ Case/Ticket   │   │ AI Pipeline     │  │ Notification  │
             │ & Routing   │   │ + Workflow/SLA│   │ STT→LLM→QM      │  │ email/in-app/ │
             │ (queue,skill│   │               │   │ Chatbot,Summary │  │ LINE/push     │
             └──────┬──────┘   └───────┬───────┘   └────────┬────────┘  └───────────────┘
                    ▼                  ▼                    ▼
 ┌──────────────────────────── Core Domain ─────────────────────────────────────────┐
 │ Contact/Account(PDPA) · Interaction Timeline · Survey · Knowledge Base · QM Eval │
 │ Identity/RBAC · Tenant/Config · Audit Log · External Data Connector (ERP/Sales)  │
 └──────────────────────────────────────────────────────────────────────────────────┘
        │ PostgreSQL (OLTP) │ Redis │ Object Storage (S3/MinIO) │ OpenSearch │ OLAP (ClickHouse) │
        ▼
 ┌──────────── Presentation ───────────┐
 │ Agent Workspace (Web, realtime WS)  │  Supervisor/Admin Console  │  Public API │ Livechat widget │ Survey page │ KB portal
 └─────────────────────────────────────┘
```

### 2.3 Technology Stack (แนะนำ)

| Layer         | เทคโนโลยี                                                                                                                                                                                                              | เหตุผล                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Frontend      | Next.js (React, TypeScript), TailwindCSS + shadcn/ui, TanStack Query                                                                                                                                                   | ecosystem ใหญ่, AI เขียนได้แม่น                                                                          |
| Realtime      | Socket.IO (Redis adapter)                                                                                                                                                                                              | chat, agent status, notification                                                                         |
| Backend       | NestJS (TypeScript) — modular                                                                                                                                                                                          | โครงสร้างโมดูลชัด, DI, OpenAPI                                                                           |
| ORM/DB        | Prisma + PostgreSQL 16 (Row-Level Security by tenant)                                                                                                                                                                  |                                                                                                          |
| Queue/Jobs    | BullMQ (Redis)                                                                                                                                                                                                         | SLA timer, auto-close, reminder, survey send, AI jobs                                                    |
| Search        | OpenSearch (รองรับ Thai analyzer / ICU)                                                                                                                                                                                | chat keyword search, KB search                                                                           |
| Analytics     | ClickHouse (หรือ PostgreSQL materialized views ใน MVP)                                                                                                                                                                 | Dashboard, heatmap                                                                                       |
| File          | AWS S3 (MinIO สำหรับ dev)                                                                                                                                                                                              | attachment, call recording                                                                               |
| Auth          | Keycloak (OIDC, SSO/AD) หรือ built-in JWT + RBAC                                                                                                                                                                       | องค์กรมักต้องการ AD                                                                                      |
| AI (Cloud)    | STT: cloud Speech-to-Text ที่รองรับ th-TH + speaker diarization (เช่น Google Cloud STT, Azure AI Speech, OpenAI transcription); LLM: Claude / GPT ผ่าน API หรือ AWS Bedrock / Azure OpenAI; Embedding: cloud embedding | ผ่าน Provider interface เปลี่ยน vendor ได้โดยไม่แก้ business logic; benchmark ความแม่นยำภาษาไทยก่อนเลือก |
| Cloud (SaaS)  | AWS (แนะนำ region Asia Pacific (Thailand) ap-southeast-7 หรือ Singapore) — EKS, RDS PostgreSQL, ElastiCache Redis, S3, OpenSearch Service, SES, CloudFront + WAF, Secrets Manager, KMS                                 | managed services ลดภาระ ops; เลือก region ตาม PDPA/latency                                               |
| IaC / Deploy  | Terraform + Helm, GitHub Actions, Argo CD; Docker Compose สำหรับ dev                                                                                                                                                   |                                                                                                          |
| SaaS platform | Tenant provisioning, plan & feature flags, usage metering (agents, AI minutes, storage), billing (Stripe/Omise)                                                                                                        |                                                                                                          |
| Observability | OpenTelemetry, Prometheus, Grafana, Loki                                                                                                                                                                               |                                                                                                          |

### 2.4 Bounded Contexts / Modules

| Module (code)    | ครอบคลุม Checklist           | หน้าที่หลัก                                                                                                                                                |
| ---------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenant` / `iam` | —                            | tenant, user, team, role, permission, skill, SSO                                                                                                           |
| `billing`        | — (SaaS)                     | plan, feature flag, usage metering (seats, AI minutes, storage), invoice                                                                                   |
| `contact`        | Account Mgmt                 | Contact, Account (นิติบุคคล), Segment, Consent (PDPA), Merge/Dedup, Customer Dashboard (360)                                                               |
| `interaction`    | Interaction tracking         | Timeline กลางของ Call/Chat/Ticket/Survey/Email                                                                                                             |
| `case`           | Case Mgmt                    | Ticket, type, category/sub, workflow, SLA, reminder, log note, activity log, auto-create/close                                                             |
| `workflow`       | Case Mgmt – Workflow         | State machine config + rule engine (condition → action)                                                                                                    |
| `omnichannel`    | Non-voice & Social           | Channel adapters, conversation, queue, routing by skill, concurrency limit, transfer, canned response, label, pre-chat form, chat-to-case, contact mapping |
| `telephony`      | Voice Integration            | 3CX contact lookup, call journaling, realtime call events (Call Control WSS), recording fetch, screen-pop, click-to-call, call reports                     |
| `qm`             | Quality Mgmt                 | Evaluation form, scoring, call/chat evaluation, AI results                                                                                                 |
| `ai`             | AI features                  | STT, call/chat summary, intent, sentiment, script checklist, keyword, chatbot (RAG on KB), agent assist                                                    |
| `survey`         | Survey                       | Form builder, layout, trigger rules, bulk send, response, realtime analysis                                                                                |
| `kb`             | Knowledge Base               | Article, section hierarchy, tag, type, template, HTML editor, attachment, authorization, expiry, views/likes                                               |
| `notification`   | Notification                 | in-app, email, LINE notify/OA, template                                                                                                                    |
| `connector`      | Customers/Products/Sales API | Generic REST connector + field mapping + cache                                                                                                             |
| `report`         | Report & Dashboard ทุกโมดูล  | KPI, dashboard builder, export, schedule                                                                                                                   |
| `audit`          | ทุกโมดูล/PDPA                | immutable audit log                                                                                                                                        |

### 2.5 Core Data Model (ย่อ)

```
Tenant(id, name, plan, settings)
User(id, tenant_id, name, email, role_id, team_id, status[online|away|offline], max_concurrent_chats)
Skill(id, name) · UserSkill(user_id, skill_id, level 1-5)

Account(id, tenant_id, name, tax_id, type, owner_id)
Contact(id, tenant_id, account_id?, first_name, last_name, phones[], emails[], line_uid?, fb_psid?,
        national_id_enc?, segment_ids[], custom_fields jsonb, is_anonymized, created_by, ...)
ContactIdentity(contact_id, channel, external_id)  -- ใช้ทำ contact mapping ข้ามช่องทาง
Consent(id, contact_id, purpose, lawful_basis, status[given|withdrawn], version, channel, captured_at, expires_at)
Segment(id, name, rule jsonb /* dynamic */ | static)

Interaction(id, tenant_id, contact_id?, channel[voice|line|facebook|livechat|email|form|survey],
            direction, started_at, ended_at, agent_id?, ref_type, ref_id, summary?, sentiment?, intent?)

Ticket(id, tenant_id, number, contact_id, type_id, category_id, sub_category_id, priority,
       status, workflow_id, current_state, assignee_id, team_id, source_channel, source_interaction_id,
       sla_policy_id, first_response_due, resolve_due, closed_at, close_reason, custom_fields jsonb)
TicketType · Category(parent_id) · SlaPolicy · Workflow(definition jsonb, version)
TicketNote(id, ticket_id, author_id, body, visibility[internal|all], mentions[], attachments[])
TicketActivity(id, ticket_id, actor, action, from, to, at)   -- activity log
Reminder(id, ticket_id, remind_at, user_id, message, done)

Conversation(id, tenant_id, channel, channel_account_id, contact_id?, queue_id, agent_id?,
             status[bot|queued|assigned|ended], pre_chat_data jsonb, labels[], started_at, ended_at, result, csat?)
Message(id, conversation_id, sender_type[contact|agent|bot|system], body, attachments[], created_at)
Queue(id, name, skill_ids[], routing[round_robin|least_busy|skill_score]) · CannedResponse · Label

Call(id, tenant_id, pbx_call_id, from, to, direction, queue, agent_ext, agent_id?, contact_id?,
     started_at, answered_at, ended_at, duration, disposition, recording_key?)
CallAnalysis(call_id, transcript jsonb /*dialog + speaker + ts*/, summary, intent, sentiment,
             sentiment_timeline, script_checklist jsonb, keywords[], model_version, status)

EvaluationForm(id, name, sections jsonb /*criteria, weight*/)
Evaluation(id, target_type[call|chat], target_id, agent_id, evaluator_id|AI, form_id, scores jsonb, total, comments)

Survey(id, name, layout jsonb, questions jsonb, trigger jsonb, is_active)
SurveyDispatch(id, survey_id, contact_id, channel, token, sent_at, opened_at, completed_at)
SurveyResponse(id, dispatch_id, answers jsonb, score, submitted_at)

KbArticle(id, section_id, type, title, body_html, tags[], template_id, visibility_roles[],
          publish_at, expire_at, status, version, views, likes, dislikes, author_id)
KbSection(id, parent_id, name)

AuditLog(id, tenant_id, actor_id, action, entity, entity_id, before jsonb, after jsonb, ip, at)
```

### 2.6 Ticket Lifecycle (ค่าเริ่มต้น — แก้ได้ด้วย Workflow config)

```
 New ──assign──▶ Open ──▶ In Progress ──▶ Pending Customer ──(ลูกค้าตอบ)──▶ In Progress
                   │            │                 │
                   │            ▼                 └──(ไม่ตอบ N วัน)──▶ Auto Close
                   │         Resolved ──(ลูกค้า reopen ภายใน X วัน)──▶ Reopened
                   │            │
                   └────────────┴──(ครบ X วัน)──▶ Closed ──trigger──▶ Survey (CSAT)
```

- **Auto-create**: Email (IMAP/Microsoft Graph), Web form, Call (จาก 3CX disposition หรือ agent กดสร้างจาก screen-pop), Chat (ปุ่ม Chat-to-case / rule)
- **Dedup**: email reply ที่มี `[#TCK-xxxx]` ใน subject → เข้า ticket เดิม
- **SLA**: คำนวณตาม business hours + holiday calendar; warning ที่ 80%, breach → escalate
- **Rule engine**: `WHEN event AND conditions THEN actions` (assign, set field, notify, send survey, webhook)

### 2.7 Chat Routing Algorithm

1. Inbound message → หา `ContactIdentity` (LINE UID / FB PSID) → map contact (ไม่พบ = สร้าง lead/anonymous + แจ้ง agent ให้ map)
2. ถ้า bot เปิดอยู่ → AI Chatbot (RAG จาก KB) ตอบก่อน; handoff เมื่อ intent = ขอคุยคน / confidence ต่ำ / ลูกค้าพิมพ์ keyword
3. เลือก Queue ตาม channel + pre-chat form + intent
4. เลือก Agent: status = online AND มี skill ของ queue AND `active_chats < max_concurrent_chats` → เรียงตาม skill level ↓, active_chats ↑, last_assigned_at ↑
5. ไม่มี agent ว่าง → รอในคิว (แจ้งลำดับคิว/ข้อความ auto-reply) + timeout → offline message/ticket
6. Transfer ไป agent/queue อื่นพร้อม context + AI chat summary
7. End chat → บันทึก result/label → ส่ง evaluation (CSAT) → AI Chat Summary → Interaction timeline

### 2.8 Voice Integration (3CX V20) + QM Pipeline — ไม่ใช้ vCRMOCR

3CX V20 มีช่องทางเชื่อมต่อ 3 แบบ vCRM จะใช้ทั้งหมดตาม license ของลูกค้า:

| ช่องทาง 3CX                                                                     | ใช้ทำอะไรใน vCRM                                                                                                                            | License                               |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **CRM Integration Template** (XML/JSON template ที่ 3CX เรียกเข้า REST ของ CRM) | Contact Query (lookup ด้วยเบอร์), สร้าง contact ใหม่, Call Journaling (log สายเมื่อจบ), Chat journaling, เปิด contact URL ใน 3CX Web Client | ทุก edition ที่รองรับ CRM integration |
| **Call Control API** (REST + WebSocket, OAuth client credentials)               | รับ event สาย realtime ต่อ extension/queue → **screen-pop ใน vCRM เอง**, click-to-call, transfer, สถานะสาย                                  | 8SC+                                  |
| **Configuration API (XAPI)** (REST/OData, client credentials, token 60 นาที)    | Sync users/extensions/queues/departments → map กับ agent และ skill; (ถ้ามี endpoint) ดึง call history/recording                             | 8SC+                                  |

```
(1) สายเข้า ─▶ 3CX ──CRM Template lookup──▶ vCRM /api/v1/telephony/3cx/lookup?number=
                                             ◀── contact name/id/url (3CX แสดงชื่อผู้โทร)
(2) Ringing ─▶ 3CX Call Control WebSocket ──▶ telephony-gateway (1 connection ต่อ tenant)
                   └▶ map ext→agent ─▶ Socket.IO ─▶ Agent Workspace: SCREEN-POP (Customer 360 + ปุ่มสร้าง Ticket)
(3) จบสาย ─▶ 3CX ──CRM Template journaling──▶ vCRM /api/v1/telephony/3cx/journal ─▶ Call + Interaction
(4) Recording ─▶ ดึงจาก 3CX (API / SFTP / cloud storage archive ที่ 3CX ตั้งค่าไว้) ─▶ S3 (encrypted)
      └▶ job: Cloud STT (th-TH, diarization) ─▶ Cloud LLM: summary, intent, sentiment(+timeline),
             script checklist, keywords ─▶ CallAnalysis ─▶ QM AI pre-score ─▶ Supervisor ตรวจ/ปรับคะแนน
(5) Report ─▶ Call Report & Dashboard สร้างใน vCRM จาก Call records (แทน vCRMCDR) ; vCRMCDR = ลิงก์ภายนอกเป็นทางเลือก
```

- **Fallback** ถ้าลูกค้ามี license ต่ำกว่า 8SC: ใช้ (1)(3) ได้ และ screen-pop จาก 3CX Web Client เปิด URL `https://<tenant>.vcrm.app/agent/screen-pop?phone=[Number]&callid=[CallID]`
- **SaaS reachability**: 3CX ของลูกค้าต้องเข้าถึงได้ทาง HTTPS/WSS (FQDN 3CX ปกติเปิดอยู่แล้ว); เก็บ client secret ใน Secrets Manager ต่อ tenant
- ทุก AI output เก็บ `model_version`, `prompt_version`, `confidence` เพื่อ audit และ re-run
- LLM ต้องตอบเป็น **JSON schema** ที่กำหนด (validate ก่อนบันทึก)
- endpoint จริงของ Call Control/XAPI ให้ยึดตาม "Endpoint Specification" ของ 3CX เวอร์ชันที่ลูกค้าใช้ — ให้ AI เขียนหลัง adapter interface พร้อม mock

### 2.8.1 AI บน Cloud — หลักการใช้งาน

| เรื่อง          | การออกแบบ                                                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vendor lock-in  | `SttProvider`, `LlmProvider`, `EmbeddingProvider` interface; ตั้งค่าต่อ tenant                                                                                   |
| ข้อมูลส่วนบุคคล | ใช้ API แบบ enterprise ที่ไม่นำข้อมูลไป train, มี DPA; เปิด PII redaction (เลขบัตร, เบอร์, บัญชี) ก่อนส่ง LLM; บันทึก consent/purpose                            |
| Region          | เลือก endpoint region ใกล้ไทยที่สุดที่มีบริการ; ระบุใน privacy notice ว่ามีการส่งข้อมูลข้ามประเทศ                                                                |
| ต้นทุน          | นับ usage ต่อ tenant (นาที STT, token LLM) เพื่อคิดค่าบริการ; ตั้ง quota/budget alert; ใช้ model เล็กกับงานง่าย (sentiment/keyword) และ model ใหญ่กับ summary/QM |
| ความทนทาน       | queue + retry + circuit breaker; ถ้า AI ล่ม งานหลัก (ticket/chat/call log) ต้องทำงานต่อได้                                                                       |
| คุณภาพภาษาไทย   | ทำ benchmark ชุดเสียงจริง 50–100 สาย (WER, ความถูกต้องของ summary) ก่อนเลือก vendor                                                                              |

### 2.9 PDPA Design

| หลัก         | การออกแบบ                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| Consent      | `Consent` แยกตาม purpose + version ของ privacy notice; ถอนได้; บันทึกช่องทาง/เวลา                                    |
| Minimization | field ต้องมี classification (public/internal/personal/sensitive)                                                     |
| Encryption   | at-rest (DB/disk + column-level สำหรับ national_id), in-transit TLS 1.2+                                             |
| Masking      | แสดงเบอร์/บัตรประชาชนแบบ mask ตาม permission (`contact.pii.view`)                                                    |
| Retention    | policy ต่อ data type (recording, chat, ticket) → job ลบ/anonymize อัตโนมัติ                                          |
| DSR          | Data Subject Request: export ข้อมูล (JSON/PDF), แก้ไข, ลบ/anonymize, ระงับการใช้                                     |
| Audit        | ทุกการเปิดดู PII / export / แก้ไข ถูก log แบบ immutable                                                              |
| AI (Cloud)   | redact PII ก่อนส่ง LLM; ใช้ vendor ที่มี DPA และไม่ใช้ข้อมูล train; แจ้ง cross-border transfer ใน privacy notice     |
| SaaS         | vCRM เป็น Data Processor ของลูกค้า (Data Controller) → มี DPA กับลูกค้า, แยกข้อมูลต่อ tenant, ลบข้อมูลเมื่อเลิกสัญญา |

### 2.10 Security & Access

- RBAC + permission ละเอียด (module.action) + data scope (own / team / all)
- Role เริ่มต้น: Super Admin, Tenant Admin, Supervisor, Agent, QA Evaluator, KB Editor, Viewer
- Webhook ภายนอกตรวจ signature (LINE `X-Line-Signature`, FB `X-Hub-Signature-256`), 3CX ใช้ API key + IP allowlist
- OWASP ASVS L2, rate limit, CSP บน livechat widget

### 2.11 Non-Functional Requirements

| ด้าน          | เป้าหมาย                                                          |
| ------------- | ----------------------------------------------------------------- |
| Availability  | 99.9% (SaaS)                                                      |
| Performance   | API p95 < 300 ms; chat message end-to-end < 1 s; screen-pop < 2 s |
| Scale         | 500 concurrent agents/tenant, 1M contacts, 50k interactions/วัน   |
| AI turnaround | Call analysis เสร็จภายใน 5 นาทีหลังจบสาย                          |
| i18n          | UI ไทย/อังกฤษ, timezone Asia/Bangkok, พ.ศ./ค.ศ.                   |
| Backup        | RPO 15 นาที, RTO 4 ชม.                                            |

### 2.12 Delivery Roadmap

| Phase            | ขอบเขต                                                                                                                    | ระยะเวลา (โดยประมาณ) |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 0 Foundation     | Monorepo, auth/RBAC, tenant + SaaS provisioning, audit, UI shell, CI/CD, Terraform baseline                               | 3 สัปดาห์            |
| 1 Customer 360   | Contact/Account/Segment/PDPA, Interaction timeline, Customer dashboard                                                    | 3 สัปดาห์            |
| 2 Case Mgmt      | Ticket, type/category, workflow, SLA, notes, reminder, activity, notification, auto-create email/form, auto-close, report | 4–5 สัปดาห์          |
| 3 Omnichannel    | LINE, Facebook, Livechat widget, queue/routing/skill, transfer, canned, label, chat-to-case, search, dashboard/heatmap    | 5–6 สัปดาห์          |
| 4 Voice 3CX V20  | CRM Template (lookup/journaling), Call Control WSS screen-pop, click-to-call, XAPI sync, recording, call report           | 3–4 สัปดาห์          |
| 5 AI & QM        | STT, call/chat summary, intent, sentiment, script checklist, keyword, evaluation, chatbot, agent assist                   | 5–6 สัปดาห์          |
| 6 Survey         | Builder, layout, auto/bulk send, realtime analysis, dashboard                                                             | 3 สัปดาห์            |
| 7 Knowledge Base | Article, template, HTML editor, authorization, expiry, analytics                                                          | 3 สัปดาห์            |
| 8 Hardening      | Performance, security test, PDPA DSR, UAT, docs                                                                           | 3 สัปดาห์            |

> KB (Phase 7) สามารถสลับขึ้นมาก่อน Phase 5 ได้ หากต้องการให้ AI Chatbot ใช้ KB ตั้งแต่แรก

---
