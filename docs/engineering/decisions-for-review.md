# Decisions for the product owner's review

Written by Claude during the overnight build (2026-10-05/06), at the product owner's request to decide as an expert product engineer and gather every decision here. Each line says what was decided, why, and what it would take to change it. Product rules in `docs/agents/rules.md` were never changed; where a PRD and a rule disagreed, the rule won (see `conflicts.md`).

## Postponed: needs you (5)

| # | What | Why it waits for you | Until then |
| --- | --- | --- | --- |
| 1 | **Email provider for two-step sign-in codes** (PLT-02 R6) | Needs an account with a mail service (e.g. Amazon SES, Postmark, or a Google Workspace SMTP relay) in the organisation's name; I must not create accounts | The feature is fully built and tested; the app says «إرسال الرموز بالبريد غير متاح الآن». Add `SMTP_HOST/PORT/USER/PASSWORD/FROM` to `~/.config/rafeeq/secrets.env` and redeploy |
| 2 | **Verified helpline numbers per country** for the danger panel (rules.md §2) | Numbers must be verified by a person; inventing them is forbidden | Danger cases show «تحدث مع إنسان الآن» (our team) and a generic "call your local emergency number" |
| 3 | **Permission letters**: islamqa.info (AI and app use of the offline archive), binbaz.org.sa (AI use), IslamHouse (own API key, self-hosting the Osoul videos and Al-Fatiha audio), dorar.net (stays link-only) | Sending email on your behalf needs your approval | islamqa is indexed on your explicit instruction and labelled "permission pending"; its files stay outside the public repo; dorar/islamenc/dawa.center are link-only |
| 4 | **Sharia approval of the content** by مهند بن صالح الفوزان | Only he may approve (KNW-05 R5) | 25 lessons are ready and waiting in the review desk. Learners see an honest "being reviewed" message. Invite code for his account: `~/.config/rafeeq/invites.txt` (role `sharia_reviewer`) |
| 5 | **Native Tagalog review** of exercises, objectives and UI strings | Needs a fluent speaker | Tagalog is live after approval but marked as needing review in `frontend/src/app/i18n/tl.ts` and `content/README.md` |

## Platform and engineering

| Decision | Why | To change |
| --- | --- | --- |
| React 19 + Vite + TypeScript + Tailwind v4 + shadcn (the existing design system), React Router, TanStack Query, Zustand | Builds on the design system already approved (PR #1); smallest set that covers offline-first state and server cache | — |
| FastAPI + async SQLAlchemy 2 + Alembic + PostgreSQL 16 with pgvector; uv; ruff; pytest against a real Postgres | One database for app data and vectors; typed, testable, fast to build | — |
| **Guest first, device is the source of truth** for progress; an account keeps a merged copy (union of lessons, latest answer per objective, larger set of learning days) | PLT-02 R1 and rules.md §4 (minimum data); works offline | — |
| Access token in memory, refresh token in an httpOnly cookie scoped to `/api/auth`; Argon2id passwords; rate limits on login and codes | Standard, avoids tokens in localStorage | — |
| Mentors, reviewer and team join with **invite codes** created in Admin | ORG domain is postponed; codes stand in for organisation approval | Replace with ORG approval later |
| **No staging**: every push to `main` deploys to `https://rafeeq.nan.sa` via the self-hosted runner, with health check and automatic rollback to the previous images | Your instruction | — |
| CI also runs on the self-hosted runner | GitHub-hosted runners never started for this private organisation (jobs stayed queued) | Enable Actions minutes for the org, then switch `runs-on` back |
| Source corpus (QuranEnc, HadeethEnc, islamqa, binbaz, IslamHouse book) lives in `~/.local/share/rafeeq/corpus`, mounted read-only into the backend and reloaded on deploy only when it changed | The repo is public; several licences forbid redistribution | — |
| **No IP addresses in logs** (nginx log format without the address; uvicorn access log off) | MOT-07 R4 and rules.md §4 | The host router (outside the app) still logs addresses; ask the server owner to drop them for `rafeeq.nan.sa` |
| Web push with our own VAPID keys (no third-party push service) for MOT-05 reminders and replies | rules.md §4: no third parties | — |
| Reminders are checked every 5 minutes in the learner's own time zone | Web push cannot schedule on the device; 5 minutes late is gentle enough | — |

## Learning and content

| Decision | Why | To change |
| --- | --- | --- |
| Arabic and English card text from the **spreadsheet you supplied**; Filipino from the book's official site | You asked to use the spreadsheet; it matches the printed book where the site is wrong (e.g. the Zabur and Dawud) | Point `SOURCE_FILES` in `content/tools/build.py` back at the site |
| Lessons cite Quran verses **by reference only**; the words come from the stored QuranEnc record (Arabic + Saheeh International for English, Rowwad for Tagalog) | rules.md §1.3 | Translation keys in `backend/app/knowledge/scripture.py` |
| English and Filipino prayer steps no longer contain transliterated adhkar or their translations | Avoids learners reciting a translation in prayer; Arabic keeps every dhikr | Restore from each lesson's `dropped` list |
| The wiping-over-socks invalidator follows each language's source (Arabic: what requires wudu or ghusl; English/Filipino: ghusl only); no exercise asks about it | A fiqh difference between editions; the reviewer decides | Flagged for مهند in `content/README.md` |
| **Approval stores a snapshot**: learners always get exactly the approved text; an edit waits for re-approval while the old approved text stays visible | KNW-05 R3 | — |
| Team accounts can preview lessons still in review (switch on the path) | The team must walk the product before approval without showing it to learners | — |
| Ordering and matching exercises use taps, not drag | Reliable with one thumb, screen readers and both directions | — |
| A returning wrong exercise starts fresh; no limit, no penalty; the feedback shows the card text | LRN-03 R3 | — |
| Path nodes gained a fourth state, **open** (unlocked by placement) | LRN-02 and LRN-05 together need it; showing a check mark would claim completion | — |
| Placement asks knowledge questions only, offers «لا أعرف», and never marks answers | LRN-05 R5 and rules.md (no "do you pray") | — |
| Lesson completion shows a **unit flower** gaining the earned petal; badges are celebrated first | One orchestrated moment of delight, from the brand's petal geometry | — |

## Motivation and indicators

| Decision | Why |
| --- | --- |
| Engagement status computed on the server from anonymous events, refreshed on each interaction and daily at 00:00 Riyadh, when the snapshot is taken | MOT-07 R3, MOT-08 R2 |
| An account with several devices counts once in snapshots (the most recently used device's status) | Avoid double counting after sign-in |
| Indicators hide any number based on fewer than 10 people | MOT-08 R6, MOT-09 R6 |
| The mentor-contact comparison (MOT-08 R6) waits for Companion's contact events | Shown as "not enough data" until then |
| Reminder text: «لحظة لك / لديك درس قصير جاهز متى شئت» (and en/tl equivalents) | No app name, no religious word, no streak (MOT-05 R3) |

## AI

See `ai-agents.md` (written with the AI build): agents, models, measured prices, bake-off, budget guard at $10 cumulative.
