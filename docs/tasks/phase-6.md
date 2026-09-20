# Phase 6 — Survey · Task Breakdown

> Scope: `docs/PHASE_PROMPTS.md` → Prompt 7 · ระยะเวลาโดยประมาณ 3 สัปดาห์

| Status | ID   | Task                                                   | Depends on | Est. |
| ------ | ---- | ------------------------------------------------------ | ---------- | ---- |
| [ ]    | 6.1  | Survey data model & versioning                         | Phase 5    | 0.5d |
| [ ]    | 6.2  | Survey builder (question types, logic)                 | 6.1        | 2.5d |
| [ ]    | 6.3  | Layout customization & preview                         | 6.2        | 1d   |
| [ ]    | 6.4  | Public survey page (token links)                       | 6.2, 6.3   | 1.5d |
| [ ]    | 6.5  | Distribution channels (LINE, email, SMS adapter, link) | 6.4        | 1.5d |
| [ ]    | 6.6  | Automated triggers + throttling + consent check        | 6.5        | 1d   |
| [ ]    | 6.7  | Manual & bulk send (segment / upload)                  | 6.5        | 1d   |
| [ ]    | 6.8  | Reminders, expiry & tracking                           | 6.5        | 0.5d |
| [ ]    | 6.9  | Response processing → timeline, ticket, agent          | 6.4        | 0.5d |
| [ ]    | 6.10 | Real-time analysis dashboard                           | 6.9        | 2d   |
| [ ]    | 6.11 | Text-answer themes (LLM) & export                      | 6.10       | 1d   |
| [ ]    | 6.12 | Phase review                                           | all        | 0.5d |

---

## 6.1 Model

- `Survey`, `SurveyVersion` (questions/layout JSON), `SurveyDispatch` (token, channel, sent/opened/completed), `SurveyResponse`; unlimited surveys per tenant (plan limits only)
- **Done when:** editing a live survey creates a new version.

## 6.2 Builder

- Types: rating 1–5/1–10, NPS 0–10, CSAT smiley, single/multi choice, dropdown, text, matrix; required; branching/skip logic; th/en text per question
- **Done when:** logic evaluation unit tests.

## 6.3 Layout

- Theme (logo, colors, font), one-question-per-page vs single page, progress bar, thank-you page; live preview desktop/mobile
- **Done when:** preview matches public page.

## 6.4 Public page

- Mobile-first, fast (< 1s), accessible; token validation, expiry, single response per token; anonymous link option
- **Done when:** Playwright complete survey.

## 6.5 Channels

- LINE (flex message with button), email (template), SMS adapter interface (Thai providers later), plain link / QR
- **Done when:** mock channels receive correct payloads.

## 6.6 Triggers

- Via Rules engine: ticket closed, chat ended, call ended, custom event; delay option; throttling (e.g., max once per 7 days per contact); skip if consent withdrawn/restricted
- **Done when:** throttle + consent tests.

## 6.7 Manual & bulk

- Send to one contact from Customer 360; bulk to Segment or uploaded list; schedule; rate limiting per channel
- **Done when:** 10k bulk send runs in background.

## 6.8 Reminders & tracking

- Reminder after N days if not completed; open/complete tracking; expiry
- **Done when:** funnel counts correct.

## 6.9 Response processing

- Interaction on timeline; link to ticket/conversation/call and agent; CSAT/NPS on agent stats; low score → rule event `survey.low_score`
- **Done when:** low score creates follow-up ticket via rule.

## 6.10 Real-time dashboard

- Live via Socket.IO: response rate, CSAT, NPS, distributions, trend; filters channel/agent/team/date/survey version
- **Done when:** new response updates dashboard without refresh.

## 6.11 Themes & export

- LLM groups free-text answers into themes with counts & examples; CSV/XLSX export of raw responses
- **Done when:** theme output validated by schema.

## 6.12 Review

- Prompt R; CURRENT STATUS → Phase 7
