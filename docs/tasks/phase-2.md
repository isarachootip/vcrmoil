# Phase 2 — Case Management · Task Breakdown

> Scope: `docs/PHASE_PROMPTS.md` → Prompt 3 · ระยะเวลาโดยประมาณ 4–5 สัปดาห์

| Status | ID   | Task                                         | Depends on | Est. |
| ------ | ---- | -------------------------------------------- | ---------- | ---- |
| [ ]    | 2.1  | Ticket core model & numbering                | Phase 1    | 1d   |
| [ ]    | 2.2  | Ticket types, categories, priorities (admin) | 2.1        | 1d   |
| [ ]    | 2.3  | Workflow engine (state machine)              | 2.1        | 2d   |
| [ ]    | 2.4  | Workflow visual editor (React Flow)          | 2.3        | 1.5d |
| [ ]    | 2.5  | Ticket APIs & manual creation                | 2.2, 2.3   | 1d   |
| [ ]    | 2.6  | Notes, mentions, attachments                 | 2.5        | 1d   |
| [ ]    | 2.7  | Activity log                                 | 2.5        | 0.5d |
| [ ]    | 2.8  | Business hours, holidays & SLA engine        | 2.5        | 2d   |
| [ ]    | 2.9  | Rules engine (event → condition → action)    | 2.5        | 2d   |
| [ ]    | 2.10 | Notification module                          | 2.6        | 1.5d |
| [ ]    | 2.11 | Reminders                                    | 2.10       | 0.5d |
| [ ]    | 2.12 | Email-to-ticket (IMAP + Microsoft Graph)     | 2.5        | 2d   |
| [ ]    | 2.13 | Web form builder → ticket                    | 2.5        | 1.5d |
| [ ]    | 2.14 | Auto-close & reopen                          | 2.3, 2.8   | 0.5d |
| [ ]    | 2.15 | External Data Connector                      | 2.5        | 1.5d |
| [ ]    | 2.16 | Ticket UI: list, kanban, detail              | 2.5–2.8    | 2.5d |
| [ ]    | 2.17 | Case reports & dashboard                     | 2.16       | 1.5d |
| [ ]    | 2.18 | Phase review                                 | all        | 0.5d |

---

## 2.1 Ticket core

- `Ticket` per SYSTEM_DESIGN 2.5; number `TCK-{YYYY}-{seq}` per tenant (sequence table, no gaps under concurrency); link to contact & source interaction
- **Done when:** concurrent create test yields unique sequential numbers.

## 2.2 Types / categories / priorities

- Admin CRUD; category tree (category → sub-category) per ticket type; required custom fields per type
- **Done when:** ticket creation validates category belongs to type.

## 2.3 Workflow engine

- Versioned JSON definition: states (initial, final, pause-SLA flag), transitions (from, to, allowed roles, required fields, actions)
- Default workflow: New → Open → In Progress ⇄ Pending Customer → Resolved → Closed; Reopened
- Tickets pinned to the workflow version they started with
- **Done when:** unit tests for allowed/denied transitions and required fields.

## 2.4 Workflow editor

- React Flow canvas; validate (reachable final state, no orphan); publish new version
- **Done when:** admin edits and publishes; new tickets use new version.

## 2.5 APIs & manual create

- CRUD, transition endpoint, assign (user/team), bulk actions; create from Customer 360 with contact prefilled
- **Done when:** e2e covers create → assign → transition.

## 2.6 Notes

- Rich text (TipTap), visibility internal/all, @mention users/teams, attachments to S3 (size/type limits, virus-scan hook interface)
- **Done when:** mention triggers `note.mentioned` event.

## 2.7 Activity log

- Record field changes, transitions, assignment, SLA events; timeline UI component
- **Done when:** every mutation shows in activity log.

## 2.8 SLA

- `BusinessCalendar` (hours per weekday, Thai public holidays seed), `SlaPolicy` (per type × priority: first response, resolution)
- Due-date calculation in business time; pause in pause-states; BullMQ delayed jobs for 80% warning & breach; recalculation on change
- **Done when:** unit tests for overnight/weekend/holiday math and pause/resume.

## 2.9 Rules engine

- Triggers: ticket.created, updated, status_changed, sla.warning, sla.breached, note.added
- Conditions on any field (AND/OR); actions: assign (user/team/round-robin/least-loaded), set field, add tag, notify, webhook (signed), send survey (hook)
- Execution order, stop-processing flag, loop guard, execution log
- **Done when:** tests for order, loop guard, and each action.

## 2.10 Notifications

- In-app via Socket.IO (bell + list, read/unread), email templates (Handlebars th/en), LINE push adapter interface; user preferences
- **Done when:** mention and assignment produce in-app + email.

## 2.11 Reminders

- Per ticket per user, remind_at, snooze; delayed job → notification
- **Done when:** reminder fires at the right Bangkok time.

## 2.12 Email-to-ticket

- Mailbox config per tenant (IMAP/SMTP or Microsoft Graph OAuth); poll/subscribe; thread by `[#TCK-…]` and Message-ID/In-Reply-To; new email → new ticket + contact match; outbound replies from ticket
- Strip signatures/quoted text; attachments; loop protection (auto-replies)
- **Done when:** e2e with MailHog: new email → ticket; reply → same ticket.

## 2.13 Web form → ticket

- Form builder (fields → ticket/contact mapping), embeddable/public URL, captcha, confirmation email
- **Done when:** submission creates ticket + contact.

## 2.14 Auto-close & reopen

- Config per type: N days in Resolved/Pending → Closed (notify customer); reply within X days reopens, after → new linked ticket
- **Done when:** job tests with fake timers.

## 2.15 External Data Connector

- Tenant config: base URL, auth (API key/OAuth2/basic), request template with variables, JSONPath mapping, cache TTL, timeout; test button
- Panels on ticket & Customer 360 for Customer / Product / Sales info
- **Done when:** mock ERP server integration test.

## 2.16 Ticket UI

- List with saved views (My, Team, Unassigned, SLA at risk), kanban by status, detail page (header, fields, notes, activity, SLA timers, related interactions), keyboard shortcuts
- **Done when:** Playwright flow create → note → resolve.

## 2.17 Reports

- Volume by type/category/channel, backlog aging, SLA compliance %, FRT/ART, agent productivity; CSV/XLSX export; dashboard widgets
- **Done when:** numbers match SQL fixtures.

## 2.18 Review

- Prompt R; docs; CURRENT STATUS → Phase 3
