# Phase 5 — AI (Cloud) & Quality Management · Task Breakdown

> Scope: `docs/PHASE_PROMPTS.md` → Prompt 6 · ระยะเวลาโดยประมาณ 5–6 สัปดาห์
> หมายเหตุ: ถ้าต้องการให้ Chatbot ใช้ KB ตั้งแต่แรก ให้ทำ Phase 7 (KB) ก่อน task 5.10

| Status | ID   | Task                                                       | Depends on              | Est. |
| ------ | ---- | ---------------------------------------------------------- | ----------------------- | ---- |
| [ ]    | 5.1  | AI provider interfaces, registry & mocks                   | Phase 4                 | 1d   |
| [ ]    | 5.2  | Cloud STT adapters (≥2)                                    | 5.1                     | 2d   |
| [ ]    | 5.3  | Cloud LLM & embedding adapters (≥2)                        | 5.1                     | 1.5d |
| [ ]    | 5.4  | PII redaction (Thai)                                       | 5.1                     | 1d   |
| [ ]    | 5.5  | Prompt registry, JSON schemas & validation/repair          | 5.3                     | 1d   |
| [ ]    | 5.6  | Usage metering, quotas & circuit breaker                   | 5.1                     | 1d   |
| [ ]    | 5.7  | Benchmark script (Thai calls)                              | 5.2, 5.3                | 1d   |
| [ ]    | 5.8  | Call analysis pipeline                                     | 5.2–5.6                 | 2d   |
| [ ]    | 5.9  | Call detail UI (player ↔ transcript, sentiment, checklist) | 5.8                     | 2d   |
| [ ]    | 5.10 | AI Chat Summary                                            | 5.5                     | 0.5d |
| [ ]    | 5.11 | AI Chatbot (RAG) + handoff                                 | 5.3, Phase 7 or KB stub | 2.5d |
| [ ]    | 5.12 | Agent Assistant                                            | 5.11                    | 1.5d |
| [ ]    | 5.13 | Evaluation form builder                                    | Phase 4                 | 1.5d |
| [ ]    | 5.14 | Evaluations (AI pre-score, review, dispute, calibration)   | 5.8, 5.13               | 2d   |
| [ ]    | 5.15 | Sampling rules                                             | 5.14                    | 0.5d |
| [ ]    | 5.16 | QM dashboard & Phase review                                | all                     | 1.5d |

---

## 5.1 Interfaces

- `SttProvider.transcribe(audio, {language:'th-TH', diarization})`, `LlmProvider.complete({system, messages, schema})`, `EmbeddingProvider.embed(texts)`; per-tenant selection (provider, model, region); mock implementations with fixtures
- **Done when:** switching provider requires config only.

## 5.2 STT adapters

- At least two cloud vendors (e.g., Google Cloud STT, Azure AI Speech) — async long-audio, diarization (agent/customer), word timestamps; stereo channel split if 3CX recording is dual-channel
- **Done when:** fixture audio transcribed via each adapter in integration test (skipped without keys).

## 5.3 LLM & embeddings

- At least two (e.g., Anthropic Claude, Azure OpenAI or AWS Bedrock); structured output/JSON mode; streaming for assistant; timeouts & retries
- **Done when:** same prompt works on both adapters.

## 5.4 PII redaction

- Detect & mask Thai national ID (13 digits with checksum), phone, email, bank account, credit card; reversible token map kept locally so results can be re-hydrated
- **Done when:** unit tests with Thai text samples; toggle per tenant.

## 5.5 Prompts & schemas

- `PromptTemplate(key, version, body, model_hint)` in DB; zod schemas for CallAnalysis, ChatSummary, Intent, etc.; invalid JSON → one repair attempt → fail with reason
- **Done when:** golden-fixture tests.

## 5.6 Metering & resilience

- `UsageRecord` for STT minutes / tokens / cost; tenant quotas and budget alerts; circuit breaker + queue backpressure; core flows unaffected when AI down
- **Done when:** simulated provider outage doesn't break journaling/tickets.

## 5.7 Benchmark

- `scripts/ai-benchmark`: folder of Thai recordings + reference transcripts → WER, latency, cost per adapter; summary quality rubric scored by reviewer sheet
- **Done when:** report generated as Markdown/CSV.

## 5.8 Call analysis pipeline

- Consume `analyze-call`: fetch recording → redact policy → STT → LLM (summary, intent from tenant list, sentiment + timeline, script checklist from tenant script, keywords) → `CallAnalysis` with model/prompt versions → Interaction summary/sentiment update → event `call.analyzed`
- Admin: intent list, call scripts (checklist items), keyword categories
- **Done when:** end-to-end with mocks < 5 minutes; re-run button works.

## 5.9 Call detail UI

- Player synced with dialog transcript (click to seek), speaker labels, sentiment timeline chart, checklist pass/fail with evidence timestamps, keywords highlighted, summary
- **Done when:** Playwright on seeded analysis.

## 5.10 Chat summary

- On transfer and end chat → summary + intent + sentiment stored on conversation & Interaction
- **Done when:** summary appears after end chat.

## 5.11 Chatbot

- RAG over published, non-expired, public KB (pgvector or OpenSearch kNN); answer only from sources with citations; handoff on low confidence / user asks human / negative sentiment / rules; per-channel enable; bot analytics (containment rate)
- **Done when:** eval set of 30 Thai Q&A with expected source; hallucination guard test.

## 5.12 Agent Assistant

- Suggested replies, relevant KB articles, next-best-action, Thai tone/grammar polish; streaming UI in side panel; agent must click to use (never auto-send)
- **Done when:** suggestions arrive < 3s p95 (mock).

## 5.13 Evaluation form builder

- Sections, criteria, weights, auto-fail items, N/A option, scoring scale; versioning
- **Done when:** score math unit tests.

## 5.14 Evaluations

- Evaluate call or chat; AI pre-score from checklist/sentiment mapping; evaluator adjusts with comments; agent acknowledge/dispute; calibration sessions (multiple evaluators, variance)
- **Done when:** workflow e2e.

## 5.15 Sampling

- Rules: random %, all negative sentiment, long calls, specific intents, new agents; assignment to evaluators
- **Done when:** sampling job test.

## 5.16 QM dashboard & review

- Score by agent/team/criteria, trend, sentiment distribution, top intents, keyword trends, script compliance %, AI cost per tenant
- Prompt R; CURRENT STATUS → Phase 6
