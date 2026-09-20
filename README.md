# vCRM — Starter Kit

ชุดไฟล์ตั้งต้นสำหรับสร้าง vCRM ด้วย AI coding tool — รองรับทั้ง **Google Antigravity** และ **Claude Code**
ยังไม่มีโค้ด — AI จะสร้างโค้ดตามขั้นตอนด้านล่าง

## โครงสร้าง

```
vcrm/
├── AGENTS.md                     ← Master Context (มาตรฐานกลาง — Antigravity และเครื่องมืออื่นอ่านไฟล์นี้)
├── CLAUDE.md                     ← สำเนาเดียวกันสำหรับ Claude Code (แก้ทั้งสองไฟล์ให้ตรงกันเสมอ)
├── .agents/
│   ├── rules/vcrm.md             ← Rule แบบ always-on ของ Antigravity
│   └── workflows/                ← Slash command: /phase-plan, /task, /phase-review
├── .env.example                  ← ตัวแปรระบบ (copy เป็น .env — ห้าม commit)
├── .gitignore
└── docs/
    ├── SYSTEM_DESIGN.md          ← System design ฉบับเต็ม
    ├── PHASE_PROMPTS.md          ← Prompt ของ Phase 0–8 + Prompt R (Review)
    ├── OPEN_QUESTIONS.md         ← คำถามที่ยังต้องตอบ
    ├── TRACEABILITY.md           ← Checklist 61 ฟังก์ชัน → task ที่รองรับ (ใช้ทำ UAT)
    ├── ARCHITECTURE.md / DATA_MODEL.md ← AI อัปเดตระหว่างสร้าง
    ├── tasks/phase-0.md … phase-8.md ← ทุก phase แตกเป็น task พร้อม Done criteria (รวม ~130 tasks)
    └── integrations/3cx-v20.md   ← บันทึกการเชื่อม 3CX V20
```

## เตรียมเครื่อง (Windows)

> ถ้าใช้ **Antigravity** จะรันบน Windows ตรง ๆ ก็ได้ ไม่ต้องติดตั้ง WSL (ยังต้องมี Docker Desktop
> สำหรับฐานข้อมูลและบริการตอนพัฒนา) — แต่ถ้าติดตั้ง WSL ไว้ การ build จะเร็วกว่าชัดเจน

1. ติดตั้ง **WSL2 + Ubuntu**: เปิด PowerShell (Admin) → `wsl --install` → restart
2. ติดตั้ง **Docker Desktop** → Settings → Resources → WSL Integration → เปิด Ubuntu
3. ใน Ubuntu:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs git
   sudo npm i -g pnpm @anthropic-ai/claude-code
   ```
4. ย้ายโฟลเดอร์นี้เข้า WSL (เร็วกว่ารันบน /mnt/c มาก):
   ```bash
   cp -r /mnt/c/Users/isara/Downloads/vcrm ~/vcrm && cd ~/vcrm
   git init && git add . && git commit -m "chore: starter kit"
   ```
5. เชื่อม GitHub repo ของคุณ: `git remote add origin <url> && git push -u origin main`

## เริ่มสั่ง AI — Antigravity

1. เปิด Antigravity → Open Folder → เลือกโฟลเดอร์ `vcrm`
2. เปิด **Agent Manager** (หน้าต่างจัดการ agent) แล้วตรวจว่า rule `.agents/rules/vcrm.md`
   ขึ้นสถานะ Always on (ถ้าไม่ ให้ตั้งค่าใน Settings → Rules)
3. สั่งงานด้วย slash command ที่เตรียมไว้:
   - `/phase-plan 0` — ให้ตรวจแผนของ Phase 0 ก่อน ยังไม่เขียนโค้ด
   - `/task 0.1` — ทำทีละงาน
   - `/phase-review 0` — ตรวจงานเมื่อจบ phase
4. ระหว่าง agent ทำงาน ให้ดู Plan และ Walkthrough ที่มันสร้าง ถ้าแผนผิดให้หยุดและแก้ก่อนปล่อยต่อ
5. ให้ agent ทำทีละงานเท่านั้น อย่าสั่งให้ทำทั้ง phase รวดเดียว

## เริ่มสั่ง AI — Claude Code

เปิด AI ในโฟลเดอร์: `cd ~/vcrm && claude`

### ขั้นที่ 1 — ให้ AI ทำความเข้าใจ (ยังไม่เขียนโค้ด)

```text
Read CLAUDE.md, docs/SYSTEM_DESIGN.md, docs/PHASE_PROMPTS.md and docs/tasks/phase-0.md.
Do NOT write code yet.
1. Summarize your understanding of vCRM in 10 bullet points.
2. Review docs/tasks/phase-0.md: point out missing tasks, wrong order or risks, and propose edits.
3. Add anything unclear to docs/OPEN_QUESTIONS.md.
Then stop and wait for my approval.
```

### ขั้นที่ 2 — ทำทีละ task

```text
Implement task 0.1 from docs/tasks/phase-0.md only.
Before coding: list the files you will create/change.
After coding: run lint, typecheck and tests, fix all failures, tick the checkbox in
docs/tasks/phase-0.md, show me how to verify it, then stop.
```

เปลี่ยนเลข task ไปเรื่อย ๆ (0.2, 0.3, …) และ `git commit` หลังจบแต่ละ task

### ขั้นที่ 3 — จบ Phase

1. ส่ง **Prompt R** (ใน `docs/PHASE_PROMPTS.md`) ให้ AI ตรวจและแก้
2. `git tag v0.1-phase0`
3. **ปิด session แล้วเปิดใหม่** ก่อนเริ่ม phase ถัดไป

### ขั้นที่ 4 — Phase ถัดไป (task แตกไว้แล้วใน docs/tasks/)

```text
We are starting Phase 1. Read CLAUDE.md, "Prompt 2 — Phase 1" in docs/PHASE_PROMPTS.md and
docs/tasks/phase-1.md. Do NOT code yet. Review the task list against what already exists in the
codebase: propose edits (missing, wrong order, too big), update CURRENT STATUS in CLAUDE.md,
then stop for my approval.
```

| Phase                    | Prompt ใน PHASE_PROMPTS.md | Task file        | ระยะเวลา                            |
| ------------------------ | -------------------------- | ---------------- | ----------------------------------- |
| 0 Foundation             | Prompt 1                   | tasks/phase-0.md | ~3 สัปดาห์                          |
| 1 Account & Customer 360 | Prompt 2                   | tasks/phase-1.md | ~3 สัปดาห์                          |
| 2 Case Management        | Prompt 3                   | tasks/phase-2.md | ~4–5 สัปดาห์                        |
| 3 Omnichannel            | Prompt 4                   | tasks/phase-3.md | ~5–6 สัปดาห์                        |
| 4 Voice 3CX V20          | Prompt 5                   | tasks/phase-4.md | ~3–4 สัปดาห์                        |
| 5 AI & QM                | Prompt 6                   | tasks/phase-5.md | ~5–6 สัปดาห์                        |
| 6 Survey                 | Prompt 7                   | tasks/phase-6.md | ~3 สัปดาห์                          |
| 7 Knowledge Base         | Prompt 8                   | tasks/phase-7.md | ~3 สัปดาห์ (ย้ายมาก่อน Phase 5 ได้) |
| 8 Reports & Go-live      | Prompt 9                   | tasks/phase-8.md | ~3 สัปดาห์                          |

ทำซ้ำขั้นที่ 2–4 จนครบ Phase 8

## กฎสำคัญ

- ห้ามวาง API key/รหัสผ่านใน prompt — ใส่ใน `.env` เท่านั้น
- สั่งทีละ task และต้องรัน test ทุกครั้ง
- ถ้า AI วนแก้จุดเดิม → หยุด, เปิด session/agent ใหม่, ให้อ่าน `docs/tasks/phase-N.md` แล้วทำต่อ
- แก้ `AGENTS.md` แล้วอย่าลืมแก้ `CLAUDE.md` ให้ตรงกัน (เป็นสำเนาเดียวกัน)
- AI ห้ามรัน `terraform apply` หรือแตะ production
- ระหว่างรอ 3CX (8SC+), LINE OA, Facebook App, บัญชี AI — AI ใช้ mock ไปก่อนได้

## สิ่งที่ควรเตรียมคู่ขนาน

- [ ] 3CX V20 ทดสอบ (license 8SC+) + Client ID/Secret ของ Call Control API และ XAPI
- [ ] LINE OA + Facebook Page/App สำหรับทดสอบ
- [ ] บัญชี AWS + บัญชี AI (STT/LLM)
- [ ] ไฟล์เสียงสายจริงภาษาไทย 50–100 สาย (ได้รับอนุญาตตาม PDPA) สำหรับ benchmark AI
- [ ] ตอบคำถามใน `docs/OPEN_QUESTIONS.md`
