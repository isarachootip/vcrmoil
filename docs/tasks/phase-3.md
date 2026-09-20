# Phase 3 — Omnichannel (LINE, Facebook, Livechat) · Task Breakdown

> Scope: `docs/PHASE_PROMPTS.md` → Prompt 4 · ระยะเวลาโดยประมาณ 5–6 สัปดาห์

| Status | ID   | Task                                              | Depends on | Est. |
| ------ | ---- | ------------------------------------------------- | ---------- | ---- |
| [ ]    | 3.1  | Conversation & Message model                      | Phase 2    | 1d   |
| [ ]    | 3.2  | ChannelAdapter interface + channel accounts admin | 3.1        | 1d   |
| [ ]    | 3.3  | LINE Messaging API adapter                        | 3.2        | 2d   |
| [ ]    | 3.4  | Facebook Messenger adapter                        | 3.2        | 2d   |
| [ ]    | 3.5  | Livechat widget + pre-chat form                   | 3.2        | 3d   |
| [ ]    | 3.6  | Contact mapping                                   | 3.3–3.5    | 1d   |
| [ ]    | 3.7  | Queues, skills & routing engine                   | 3.1        | 2d   |
| [ ]    | 3.8  | Agent status & concurrency                        | 3.7        | 1d   |
| [ ]    | 3.9  | Realtime gateway (Socket.IO)                      | 3.1        | 1d   |
| [ ]    | 3.10 | Agent Workspace — chat UI                         | 3.7–3.9    | 3d   |
| [ ]    | 3.11 | Canned responses & labels                         | 3.10       | 1d   |
| [ ]    | 3.12 | Transfer, end chat, result codes & CSAT           | 3.10       | 1.5d |
| [ ]    | 3.13 | Chat-to-case                                      | 3.10       | 0.5d |
| [ ]    | 3.14 | Message search                                    | 3.1        | 1d   |
| [ ]    | 3.15 | Supervisor live monitor                           | 3.8        | 1.5d |
| [ ]    | 3.16 | Chat dashboard & heatmap                          | 3.12       | 1.5d |
| [ ]    | 3.17 | AI hooks (interfaces only) & Phase review         | all        | 0.5d |

---

## 3.1 Model

- `Conversation`, `Message` (text, image, file, sticker, location, template), delivery/read status, attachments in S3; ties to Interaction
- **Done when:** migration + repository tests.

## 3.2 Adapter interface

- `ChannelAdapter { verifyWebhook, parseInbound, sendMessage, sendFile, getProfile }`; `ChannelAccount` per tenant (multiple LINE OA / FB pages), secrets in Secrets Manager; webhook URL per account; idempotency on provider message id
- **Done when:** mock adapter end-to-end inbound → conversation.

## 3.3 LINE

- Signature `X-Line-Signature`, reply vs push token handling, content download for images/files, stickers, profile fetch, quick replies
- **Done when:** signature tests + mock webhook fixtures pass; manual test with real OA.

## 3.4 Facebook

- Verify token handshake, `X-Hub-Signature-256`, Page access token, attachments, 24-hour messaging window rule (block send outside window with message)
- **Done when:** fixtures + window rule tests.

## 3.5 Livechat widget

- `apps/widget` Preact, < 50KB gz, embed snippet, theme config, pre-chat form (configurable fields → contact), file upload, links, typing, reconnect/resume via token, offline form, CSAT at end, Thai/English
- **Done when:** Playwright widget ↔ agent round trip.

## 3.6 Contact mapping

- Resolve ContactIdentity; unknown → provisional contact; agent can link to existing / merge from chat side panel
- **Done when:** second conversation from same LINE UID maps automatically.

## 3.7 Routing

- `Queue(skills, strategy, business hours, max wait, overflow queue)`; algorithm per SYSTEM_DESIGN 2.7; queue position auto-messages; timeout → offline message → ticket
- **Done when:** unit tests for skill match, concurrency limit, ties, no-agent case.

## 3.8 Agent status & concurrency

- Online/Away/Offline (+ custom away reasons), auto-away on idle/disconnect, max concurrent chats per agent, status history for reports
- **Done when:** agent at max receives no new chats.

## 3.9 Realtime gateway

- Socket.IO namespaces per tenant, auth via JWT, rooms per agent/conversation/queue, Redis adapter for scale
- **Done when:** 2 API instances deliver events correctly.

## 3.10 Agent Workspace

- 3 columns: conversation list (queues, mine, labels, unread) | thread (rich messages, attachments, clickable links, internal notes) | side panel (Customer 360 summary, tickets, KB search placeholder, assistant placeholder); multiple concurrent chats; keyboard shortcuts; sound/desktop notifications
- **Done when:** agent handles 3 chats simultaneously in Playwright.

## 3.11 Canned & labels

- Canned responses (personal/team/global, `/` shortcut, variables like {{contact.first_name}}), labels with colors
- **Done when:** variable substitution tests.

## 3.12 Transfer / end / CSAT

- Transfer to agent or queue with note; end chat with result code (configurable); CSAT request per channel; conversation summary slot for AI (Phase 5)
- **Done when:** transfer keeps history; CSAT stored on conversation.

## 3.13 Chat-to-case

- Button prefilled ticket (contact, channel, transcript excerpt, link)
- **Done when:** ticket shows source conversation.

## 3.14 Search

- OpenSearch index of messages (Thai ICU), filters channel/agent/date/label; permission-scoped results
- **Done when:** Thai keyword search test.

## 3.15 Supervisor

- Live board: queues (waiting, longest wait), agents (status, active chats), conversations; reassign; read-only monitor
- **Done when:** updates live via sockets.

## 3.16 Dashboard

- Volume, first response, wait time, handle time, CSAT, per-agent; hour × weekday heatmap
- **Done when:** figures match fixtures.

## 3.17 AI hooks & review

- Interfaces `ChatbotService`, `AgentAssistService`, `ChatSummaryService` with no-op implementations wired at the right points
- Prompt R; CURRENT STATUS → Phase 4
