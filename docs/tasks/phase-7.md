# Phase 7 — Knowledge Base · Task Breakdown

> Scope: `docs/PHASE_PROMPTS.md` → Prompt 8 · ระยะเวลาโดยประมาณ 3 สัปดาห์
> สามารถย้ายมาทำก่อน Phase 5 ได้ (เพื่อให้ AI Chatbot มีแหล่งข้อมูล)

| Status | ID   | Task                                                      | Depends on | Est. |
| ------ | ---- | --------------------------------------------------------- | ---------- | ---- |
| [ ]    | 7.1  | KB data model (sections, articles, versions, types, tags) | Phase 1    | 1d   |
| [ ]    | 7.2  | Section hierarchy & tags admin                            | 7.1        | 0.5d |
| [ ]    | 7.3  | Article editor (WYSIWYG + HTML mode + sanitize)           | 7.1        | 2d   |
| [ ]    | 7.4  | Templates library                                         | 7.3        | 1d   |
| [ ]    | 7.5  | Attachments                                               | 7.3        | 0.5d |
| [ ]    | 7.6  | Review/publish workflow & version diff                    | 7.3        | 1.5d |
| [ ]    | 7.7  | Authorization (roles/teams, public/internal)              | 7.1        | 1d   |
| [ ]    | 7.8  | Expiration & owner reminders                              | 7.6        | 0.5d |
| [ ]    | 7.9  | Search & filters (Thai)                                   | 7.1        | 1d   |
| [ ]    | 7.10 | Engagement analytics                                      | 7.9        | 1d   |
| [ ]    | 7.11 | Agent Workspace integration & RAG indexing                | 7.9        | 1d   |
| [ ]    | 7.12 | Public KB portal per tenant                               | 7.7, 7.9   | 1.5d |
| [ ]    | 7.13 | Phase review                                              | all        | 0.5d |

---

## 7.1 Model

- `KbSection(parent_id)`, `KbArticle` (type: FAQ/How-to/Policy/Troubleshooting/custom, tags, status, owner), `KbArticleVersion`, `KbAttachment`, `KbFeedback`, `KbView`
- **Done when:** migration + RLS.

## 7.2 Sections & tags

- Drag-and-drop tree, unlimited depth (UI limited to 4), tag management, knowledge types admin
- **Done when:** moving sections keeps article links.

## 7.3 Editor

- TipTap WYSIWYG (tables, images, callouts, code) + raw HTML mode for advanced users; server-side DOMPurify sanitize; autosave drafts
- **Done when:** XSS payload tests are neutralized.

## 7.4 Templates

- Template library (FAQ, How-to steps, Troubleshooting tree, Policy) with placeholders; tenant can clone/customize
- **Done when:** new article from template.

## 7.5 Attachments

- PDF/DOCX/XLSX/images to S3, size limits, preview for PDF/images, download permission follows article
- **Done when:** unauthorized user can't download.

## 7.6 Workflow & versions

- Draft → In review → Published → Archived; reviewers; version history with visual diff; restore
- **Done when:** publish creates immutable version.

## 7.7 Authorization

- Visibility: public / internal all / specific roles/teams; enforced in API, search and RAG
- **Done when:** search never returns restricted articles (test).

## 7.8 Expiration

- `expire_at`; owner reminder N days before; auto-unpublish; "needs review" list
- **Done when:** job test with fake timers.

## 7.9 Search

- OpenSearch Thai ICU; filters by section hierarchy, tags, type; highlight; synonyms per tenant; "no result" logging
- **Done when:** Thai search relevance tests.

## 7.10 Analytics

- Views, likes/dislikes, feedback comments, contributions per author, top searches, searches with no results, stale articles
- **Done when:** dashboard numbers match fixtures.

## 7.11 Agent & AI integration

- Side-panel KB search in Agent Workspace, insert link/snippet into chat/ticket reply; re-embed on publish for Chatbot/Assistant RAG (Phase 5)
- **Done when:** publishing an article updates the vector index.

## 7.12 Public portal

- `https://<tenant>.vcrm.app/help` — branding, categories, search, article feedback, SEO meta, optional "contact us" → web form ticket
- **Done when:** Lighthouse ≥ 90.

## 7.13 Review

- Prompt R; CURRENT STATUS → Phase 8
