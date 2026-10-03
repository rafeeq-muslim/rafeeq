---
name: rafeeq-prd
description: Write, review, split and size product requirement documents (PRDs) for Rafeeq (رفيق), the hackathon app that accompanies new Muslims through their first year, using the team's PRD system (one product PRD at the root, linked feature PRDs, idea cards, user stories with Given/When/Then acceptance criteria, Sharia/content rules). Use this skill whenever a Rafeeq team member asks to turn an idea into a feature, write or fix a feature PRD, write user stories or acceptance criteria, add a row to the feature register, review a PRD for readiness, decide whether something is its own feature, or mentions PRD-000, F01–F16, PAC, FAC, رفيق, وثيقة متطلبات, وثيقة ميزة, بطاقة فكرة, قصة مستخدم, معايير قبول, سجل الميزات — even if they never say "PRD".
---

# Rafeeq PRD system

Rafeeq (رفيق) accompanies a new Muslim through their first year, in their own language: it teaches the basics step by step, answers only from approved Islamic sources, and connects the user to a human when needed. The team builds it for the Bathel "AI Challenge for Serving Islamic Content" (Track 3, Oct 4–6, 2026). Requirements live in the repo `rafeeq-muslim/rafeeq` under `docs/prd/`.

This skill lets you produce documents that drop straight into that repo and pass the team's review. The team reads Arabic, so **every document you write is in Arabic**; IDs, code names and technical terms stay in English.

## What is bundled, and when to read it

| File | Read it when |
| --- | --- |
| `references/guide-ar.md` | Always skim §2 (the 8 steps), §3 (ideas → register rows, with a worked example), and §10 (checklists) before writing. Read the rest when the user asks about the process, roles, borders or hackathon mode. |
| `references/product-prd.md` | Always. It is the root (PRD-000): problem, goals, **PAC-1…PAC-5**, non-goals, the **feature register (§5)**, and the **shared rules (§6)** every feature inherits. The register is grouped: §5.1 first-version features, §5.2 internal work (content preparation, answer-reliability testing), §5.3 if time remains, §5.4 later, §5.5 excluded. |
| `references/examples/F04-knowledge-assistant.md` | Writing an AI, assistant, retrieval or Sharia-sensitive feature. |
| `references/examples/F05-learning-progress.md` | Writing a UX, motivation, gamification or progress feature, or when you need to show how a big idea is split. |
| `assets/feature-prd-template.md` | The exact skeleton for a full feature PRD. |
| `assets/idea-card-template.md` | The exact skeleton for an idea card. |
| `references/agents-rules.md` | The user asks about implementation, coding agents, branches/commits, or repo hygiene. |
| `scripts/check_prd.py` | After writing or when reviewing a feature PRD, if you can run code. |

The bundled product PRD is a snapshot from 3 Oct 2026. The repo copy is the source of truth. If the user says the register or §6 changed, ask them to paste the current version and follow it.

## First, decide what the user actually needs

Most requests fall into one of these. Pick the lightest one that does the job, because the system's whole point is that only features chosen for building get full PRDs.

1. **A new idea** ("I have an idea…", "what if the app…") → **first search the register (§5) for a feature that already meets the same need.** If one exists, enrich its row and card and keep its ID, owner and group unless the user says otherwise; duplicates split the team's effort. Otherwise write an **idea card** plus **one register row** with the next free ID. Don't write a full PRD unless the user says the feature is chosen for building, or explicitly asks for one.
2. **A full feature PRD** ("write the PRD for F07", "we're building X today") → follow the 8 steps with the template and the closest example.
3. **Stories or acceptance criteria only** → write stories in the template's format for the named feature.
4. **A review** ("is this ready?", "check my PRD") → run the readiness checklist (guide §10) and `scripts/check_prd.py`, then list concrete fixes in priority order.
5. **A sizing question** ("is this one feature or two?") → apply the sizing table (guide §2) and say which features it becomes, as register rows.
6. **A change to a shared rule** (data model, auth, Sharia rules, notifications…) → don't edit it inside a feature. Draft the change as a proposal to the product owner (ناصر بن عبدالعزيز العويمر) for PRD-000 §6, with the reason and rejected alternatives.

## How to write a feature PRD

Follow guide §2 in order; skipping ahead produces stories that have nothing to be judged against.

1. **Parent and PAC.** Name PRD-000 as parent and the one PAC this feature moves (see product PRD §3). If it moves none, say so: it's scope creep or belongs to the North Star as a later item.
2. **Problem** in the formula: *[المستخدم] يصعب عليه [المهمة] لأن [السبب]، مما يكلّف [الأثر].* One cause of the product's pain, no solution words in it.
3. **Sub-goal:** one metric, baseline → target, with a date, and one line on how it moves the parent PAC.
4. **Non-goals** for this cycle.
5. **Three solution options** with the chosen one and why the others were rejected. This exists to stop the first idea from winning by default.
6. **Feature acceptance criteria (FAC)**: 3–5, outcomes the user sees, measurable.
7. **Stories** `Fnn-Sn`: *بصفتي … أريد … حتى …*. Split by workflow step, role, data type, or happy vs error path, never by technical layer. 3–12 stories; more than 12 means split the feature.
8. **Each story gets three criteria**, each written as *بافتراض … عندما … فإن …*: AC1 happy path, AC2 an error path, AC3 permissions. A story without all three isn't ready, because untestable work can't be called done.
9. **Technical requirements for this feature only.** Entities it owns vs uses, API, security, performance. Reference PRD-000 §6 for anything shared instead of restating it. Copies drift and cause integration and security bugs.
10. Dependencies, open questions (with owner and date), decision log, and the readiness checklist at the bottom.

Use the next free ID from the register (F01–F16 exist in the snapshot, so a new feature starts at F17 unless the user's register shows otherwise). Name the file `Fnn-short-english-name.md`.

### Naming and referring to features

The team, the judges and new members read these documents without context, so a feature must be understandable from its name alone.

- **Name a feature by what it gives the user**, in plain Arabic: «التواصل مع مرشد», not «طبقة الإحالة»; «تجهيز المحتوى والمصادر», not «خط المحتوى». Internal work is named by what it produces: «اختبار موثوقية الإجابات», not «منظومة التقييم».
- **Never refer to a feature by its ID alone.** Write the name and the ID together, for example «التواصل مع مرشد (F07)». A sentence like "F04 تحتاج F08" is unreadable.
- In the register, the first column cell is the name in bold followed by one sentence saying what the feature does for the user.

## Rules that are never traded for features

Rafeeq serves people at a fragile moment in their faith, and the challenge judges reliability and scientific safety. These rules come from the challenge's reference package and the team's decisions (full text in product PRD §6.4–§6.7). If a requested feature conflicts with one, keep the rule, flag the conflict, and offer a compliant alternative.

- **No independent fatwa.** Personal cases (level D) get general information and a referral to a qualified person.
- **No source, no answer.** Answers come only from retrieved approved sources. Low confidence means refuse, hedge or refer.
- **Scripture from the database only.** Quran and hadith text are shown from stored records by ID, never generated by a model.
- **Disputed matters (level C):** state that views differ; never auto-prefer one.
- **Danger cases go straight to a human.** The AI does nothing else. An urgent help request must not carry the user's question text unless the user allows it.
- **Disclose the AI** in any feature where a user might think they are talking to a person.
- **Never gamify worship.** No points, streaks or levels for prayer, fasting or any act of worship, and no "religiosity" scores. Motivation counts meaningful learning interactions only. Prefer progress over points, continuity over perfection, cooperation over competition, encouragement over blame. Notifications are gentle, never about missed worship.
- **Privacy:** collect the minimum, never infer the user's religious or sensitive traits, and let the user decide what a mentor sees. The account is optional (display name is the only public field; username/password are for sign-in only; email only for optional 2FA).

## Writing quality

- **Mark every claim** ✅ (from a written source), 💬 (said by the team), or ⚠️ (inferred, needs checking). Never invent statistics, sources, owners or dates; mark them ⚠️ or put them in open questions. The team uploads these documents to the judges, so a made-up number is a real risk.
- Write plain, professional Arabic: short sentences, no promotional phrasing, no English words where a clear Arabic term exists.
- When a key input is missing (owner, PAC, time box), make a sensible proposal marked ⚠️ and continue. Ask the user at most 2–3 short questions, and only if the answer changes the document's shape.
- Keep the PRD about **what** and **why**; leave **how** (UI layout, code) to the builder. Acceptance criteria describe what the user sees, not implementation.

## Output

- **Full feature PRD:** one Markdown document following `assets/feature-prd-template.md`, ready to save as `docs/prd/features/Fnn-name.md`. After it, give the register row to paste into PRD-000 §5 and any proposed changes to shared rules.
- **Idea card:** the five lines from `assets/idea-card-template.md`, saved as `docs/prd/ideas/Fnn-name.md`, plus the register row (or the replacement row for an existing feature).
- **Review:** a short verdict (جاهزة / تحتاج تعديلًا), then the failed checklist items with the exact fix for each.
- If you can create files, save the document as a `.md` file; otherwise output it in one Markdown block the user can copy.

### Register row format (PRD-000 §5)

Say which group the row belongs in (§5.1–§5.4), then give it in that group's columns:

`| Fnn | **اسم الميزة:** جملة تشرح ما تقدّمه للمستخدم | المشكلة التي تعالجها، دون حل | مؤشر النجاح | PAC-n أو نجم الشمال | المالك | فكرة |`

The later-features group (§5.4) drops the PAC and status columns. Give a numeric target only when it comes from a source; otherwise describe the metric and leave the target to the feature PRD.

### Checking a PRD

If code execution is available, run:

```bash
python scripts/check_prd.py path/to/Fnn-name.md
```

It checks the header fields, the four core sections, the problem formula, the solution options, the FAC count, story count, and that every story has AC1–AC3 in بافتراض/عندما/فإن form. Fix whatever it reports, then still read the readiness checklist yourself: the script checks structure, not judgment.
