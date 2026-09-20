# Phase 4 — Voice Integration (3CX V20, no vCRMOCR) · Task Breakdown

> Scope: `docs/PHASE_PROMPTS.md` → Prompt 5 · ระยะเวลาโดยประมาณ 3–4 สัปดาห์
> อ่าน `docs/integrations/3cx-v20.md` ก่อนเริ่ม และบันทึก payload จริงลงไฟล์นั้นทุกครั้งที่ทดสอบ

| Status | ID   | Task                                                     | Depends on | Est. |
| ------ | ---- | -------------------------------------------------------- | ---------- | ---- |
| [ ]    | 4.1  | PbxAdapter interface + MockPbxAdapter + mock-3cx service | Phase 3    | 1d   |
| [ ]    | 4.2  | Call data model                                          | 4.1        | 0.5d |
| [ ]    | 4.3  | Tenant 3CX connection settings & OAuth token cache       | 4.1        | 1d   |
| [ ]    | 4.4  | CRM Integration Template: lookup & create contact        | 4.3        | 1.5d |
| [ ]    | 4.5  | CRM Integration Template: call & chat journaling         | 4.4        | 1d   |
| [ ]    | 4.6  | Template generator (download per tenant)                 | 4.4, 4.5   | 0.5d |
| [ ]    | 4.7  | XAPI sync: extensions, queues, departments + mapping UI  | 4.3        | 1.5d |
| [ ]    | 4.8  | Call Control WebSocket gateway (8SC+)                    | 4.3, 4.7   | 2d   |
| [ ]    | 4.9  | Screen-pop in Agent Workspace (+ URL fallback)           | 4.8        | 1.5d |
| [ ]    | 4.10 | Click-to-call & transfer                                 | 4.8        | 1d   |
| [ ]    | 4.11 | Recording retrieval & secure playback                    | 4.2        | 2d   |
| [ ]    | 4.12 | Call reports & dashboard (replaces vCRMCDR)              | 4.5        | 1.5d |
| [ ]    | 4.13 | Graceful degradation & license detection                 | 4.4–4.10   | 0.5d |
| [ ]    | 4.14 | Enqueue analyze-call & Phase review                      | all        | 0.5d |

---

## 4.1 Adapter + mock

- `PbxAdapter` (lookup hooks, journaling parser, realtime event stream, makeCall, transfer, listRecordings, downloadRecording, syncDirectory); `ThreeCxV20Adapter` skeleton; `mock-3cx` container that emits realistic events
- **Done when:** all later tasks can run against the mock.

## 4.2 Call model

- `Call` per SYSTEM_DESIGN 2.5 + `CallLeg` if needed; unique (tenant, pbx_call_id); Interaction on end
- **Done when:** migration + idempotent upsert test.

## 4.3 Connection settings

- Admin page: FQDN, license tier, Call Control client id/secret, XAPI client id/secret, CRM template API key (rotate), "Test connection"; secrets in Secrets Manager; token cache refreshing before 60-min expiry
- **Done when:** test connection against mock succeeds/fails clearly.

## 4.4 Lookup & create

- `GET /api/v1/telephony/3cx/lookup?number=` (API key) — normalize numbers, return fields expected by the template; unknown → optional create
- **Done when:** p95 < 200 ms; number format tests.

## 4.5 Journaling

- `POST /api/v1/telephony/3cx/journal` (call) and chat journaling → Call + Interaction; idempotent; map extension → user
- **Done when:** duplicate posts create one record.

## 4.6 Template generator

- Generate the 3CX CRM template file per tenant with URL + API key filled in; admin download + setup guide (Thai)
- **Done when:** file validates against the documented V20 schema (verify on real instance).

## 4.7 XAPI sync

- Scheduled + manual sync; mapping UI extension ↔ vCRM user, 3CX queue ↔ vCRM queue/skill
- **Done when:** changes in mock directory reflect after sync.

## 4.8 Call Control gateway

- Worker holds one WebSocket per tenant (leader election so only one instance connects), reconnect with backoff, subscribe to DNs, translate to `call.ringing|answered|ended` domain events → Socket.IO to mapped agent
- **Done when:** event latency < 1s in test; reconnect test.

## 4.9 Screen-pop

- Pop-up/side panel on ringing: caller identity or "unknown", Customer 360 summary, open tickets, last interactions; actions Create ticket / Link ticket / New contact; auto-link call to ticket created during call
- Fallback route `/agent/screen-pop?phone=&callid=&ext=` for 3CX Web Client contact URL
- **Done when:** only the ringing agent sees the pop.

## 4.10 Click-to-call

- Call buttons on contact/ticket; transfer from UI; permission `telephony.call`
- **Done when:** mock receives makeCall with correct DN.

## 4.11 Recordings

- Strategies: (a) 3CX API download, (b) cloud storage/SFTP archive pull; store in S3 SSE-KMS; match to Call; retention policy; player with waveform, speed, signed URL, audit each playback
- **Done when:** recording appears on call detail within 2 minutes of call end (mock).

## 4.12 Call reports

- Volume by hour/day/queue/agent, answered/abandoned, ASA, AHT, talk time, top callers, call-to-ticket rate; export; optional external vCRMCDR link setting
- **Done when:** figures match fixtures.

## 4.13 Degradation

- License tier < 8SC: hide realtime features, show admin notice, keep lookup/journaling/URL screen-pop
- **Done when:** tests for both tiers.

## 4.14 Analyze-call & review

- Enqueue `analyze-call` job on recording stored (consumer in Phase 5)
- Prompt R; update 3cx-v20.md; CURRENT STATUS → Phase 5
