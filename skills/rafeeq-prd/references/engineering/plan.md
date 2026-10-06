# Rafeeq build plan (engineering)

Author: Claude, acting as product engineer at the product owner's request (2026-10-05, overnight build). This file is the *how*; the PRDs in `docs/domains/*/features/` are the *what*. Order of authority when they disagree: `docs/agents/rules.md` → feature document → `docs/domains/knowledge/implementation-plan.md` (for KNW) → this plan. Decisions taken here are listed in `decisions-for-review.md`; PRD conflicts and how they were resolved are in `conflicts.md`.

## 1. Goal and definition of done

A working product at **https://rafeeq.nan.sa**, deployed from `main` by GitHub Actions, used by real learners, mentors, the Sharia reviewer and the team:

- Every P1 feature's examples pass as automated tests (backend pytest, frontend unit tests for client-side rules).
- PWA: installable, offline lessons after first load, web push.
- Arabic, English and Tagalog, RTL and LTR, on phone and desktop.
- AI: sourced answers (KNW-01), mistake explanations (LRN-03/KNW-10), learning guide (LRN-07), objective tagging (LRN-10/KNW-10), reliability test (KNW-04), all on OpenRouter within a hard $10 budget.
- Nothing Sharia-related reaches a learner before the Sharia reviewer approves it (`rules.md` §1.4). The reviewer approves in-app.

## 2. Stack (decided; product owner asked Claude to decide)

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React 19 + Vite + TypeScript + Tailwind v4 + shadcn/ui (radix-nova), the PLT-04 design system | Already built and approved direction; one codebase for phone and desktop |
| Routing / data | TanStack Router-free: React Router v7 (data mode) + TanStack Query | Mature, small; Query handles caching/offline retries |
| Local state | Zustand + `persist` (localStorage) | Guest progress lives on the device (LRN-02 R4, MOT-02 R5, LRN-10 R6) |
| PWA | `vite-plugin-pwa` (Workbox, injectManifest) | Precache app shell + lesson content; push handler in the service worker |
| i18n | Own typed dictionaries (ar/en/tl), no runtime CDN | Three languages, small; `rules.md` §4 forbids third-party runtime |
| Prayer times | `adhan` (MIT) on device; Umm al-Qura for KSA | PRC-01; location never leaves the device |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2 (async) + asyncpg, Alembic, Pydantic v2 | Typed, fast, the team's AI work is Python |
| DB | PostgreSQL 16 + pgvector | One database incl. vectors (KNW plan §2.4) |
| Auth | Argon2id passwords, short JWT access token + httpOnly refresh cookie, email OTP 2FA (optional) | `rules.md` §4, PLT-02 |
| Push | Web Push (VAPID) via `pywebpush` | MOT-05 reminders, help-request replies, group challenge |
| Jobs | APScheduler inside the backend process (single instance) | Reminders every minute, daily snapshots 00:00 Asia/Riyadh (MOT-08) |
| AI | OpenRouter (chat + embeddings) behind one `ai` module with model routing, budget guard and logging without identity | KNW plan §12.5, `rules.md` §2.6 |
| Deploy | Docker Compose (db, backend, web) on this server; nginx router `rafeeq.nan.sa` → `127.0.0.1:5380`; GitHub Actions self-hosted runner (container) deploys on push to `main` | Owner: "always prod, no staging" |

## 3. Repository layout

```
frontend/            app + design system (moved from design-system/); gallery at /design
backend/             FastAPI app (app/<domain>/...), alembic/, tests/
content/             approved-content sources: lessons (per unit, per language), cards, fixed replies, eval set
data/hisnmuslim/     adhkar data (PR #3)
infra/               compose.yml, web nginx.conf, runner compose
.github/workflows/   ci.yml (all pushes/PRs, GitHub-hosted), deploy.yml (push to main, self-hosted)
docs/engineering/    this plan, status, decisions, conflicts, AI agents, UX journey
```

Backend packages follow the six domains (`platform`, `learning`, `motivation`, `knowledge`, `companion`, `practice`). A domain never imports another domain's models; it publishes events on an in-process bus (`app/core/events.py`) recorded in an `outbox` table, as `domains.md` requires.

## 4. Where data lives (privacy by design)

| Data | Guest | Account | Server sees |
| --- | --- | --- | --- |
| Lesson progress, mastery, review queue, streak days, badges | Device (Zustand) | Device + account (merged on sign-in: union, max) | Account copy only |
| Learning events (MOT-07/08/09) | Anonymous events with random install ID (opt-out) | Same | install ID, event type, lesson/objective ID, date. No IP stored |
| Questions to the assistant | Never stored with identity | Same | Route + outcome + latency only (KNW plan 4.9) |
| City / prayer times | Device only | Device only | Nothing |
| Habits (worship) | Device only | Device only | Nothing |
| Help requests | Server (needed for a human to answer) | Server | Text only if the learner writes it; urgent requests carry question text only with consent |
| Push subscription + reminder time | Server | Server | Endpoint, chosen local time, time zone. Notification text is neutral |

## 4b. Content formats

The Learning team writes units in `content/units/<unit>/unit.json` (format in `content/README.md`, checker `content/check_content.py`). The app converts them on load (`backend/app/learning/team_units.py`); a team unit replaces any pipeline unit (`content/units.json` + `content/lessons/`) with the same order. New units arriving in the team format need no code change.

## 5. Personas → accounts and roles

| Persona | How they get in | Role |
| --- | --- | --- |
| جوزيف / دانيال / ليلى (learners) | Guest by default; optional account (PLT-02: display name, username, password, all generatable; optional email 2FA) offered **after the first completed lesson**, never on first screen | `learner` |
| أبو عبدالله (mentor) | Mentor sign-up with an invite code issued by the team (ORG domain is postponed; codes stand in for organisation approval). Gender and languages for matching | `mentor` |
| مهند (Sharia reviewer) | Account created by an admin, role granted in-app | `sharia_reviewer` |
| Team / coordinator | Account; `team` role granted by admin; sees MOT-08/09 page | `team`, `admin` |

The account option for learners lives in **Me → Save my progress** and in a gentle sheet after the first lesson ("احفظ تقدّمك"). Never a gate (PLT-02 R1).

## 6. Phases (each ends deployed)

| # | Phase | Contents |
| --- | --- | --- |
| 0 | Foundations | Repo restructure, backend skeleton, DB, auth, compose, router, CI/CD, PWA shell |
| 1 | Learning core | Content pipeline from المختصر المفيد (3 languages) → units/lessons/cards/objectives/exercises; path (LRN-02), lesson player (LRN-03), mastery BKT (LRN-10), review (LRN-04), placement (LRN-05), reviewer approval |
| 2 | Motivation | Streak (MOT-02), badges (MOT-03), anonymous events + engagement status (MOT-07), team indicators (MOT-08/09), reminders (MOT-05) via web push (PLT-06) |
| 3 | Knowledge & AI | Ingestion QuranEnc + HadeethEnc + embeddings (KNW-02), assistant (KNW-01), KNW-10 tasks (explain, guide, objective tagging), reliability test runner and report (KNW-04) |
| 4 | Companion | «أريد إنسانًا» + danger (CMP-01), mentor inbox (CMP-02), mentor choice (CMP-03), groups (CMP-05) + reporting (CMP-04), group challenge (MOT-06) |
| 5 | Practice & Discover | Prayer times + qibla (PRC-01), Hijri + Ramadan (PRC-04), adhkar (PRC-07), daily card (KNW-07), library (KNW-06), Quran listening (KNW-08), saved items (KNW-09), glossary (KNW-03) |
| 6 | Platform polish | Onboarding + language (PLT-01, PLT-03), privacy + discreet mode + quick exit + data deletion (PLT-05), account deletion |
| 7 | Landing page | scrollcraft landing at `/` for visitors, app at `/app` |

Per feature: re-read the PRD → write its section in `implementation/<ID>.md` (rules → modules, endpoints, tests) → code → one test per example → deploy.

## 7. AI agents (detail in `ai-agents.md`)

Ten agents, all behind `app/knowledge/ai/`. None writes Quran or hadith text; none sees identity.

| Agent | Feature | Model tier |
| --- | --- | --- |
| Danger screen (phrases, no model) | KNW-01 | — |
| Router (route + level) | KNW-01 | fast |
| Answer composer (from passages only, JSON) | KNW-01 | main |
| Answer verifier (code checks 1–7 + support check) | KNW-01 | fast |
| Mistake explainer + checker | LRN-03 / KNW-10 | main + fast |
| Learning guide + checker | LRN-07 / KNW-10 | fast |
| Objective tagger | LRN-10 / KNW-10 | fast |
| Reliability runner (Rafeeq vs bare model) | KNW-04 | same as composer |
| Content preparation (objectives + exercises from book cards, offline, reviewed) | LRN-03/10 method | main |
| Glossary suggester (offline) | KNW-03 | fast |

## 8. Models and budget (detail in `ai-agents.md`)

Measured prices on OpenRouter, 2026-10-05 (USD per million tokens, in/out): `google/gemma-4-31b-it` 0.09/0.34 · `google/gemma-4-26b-a4b-it` 0.076/0.255 · `deepseek/deepseek-v4-pro` 0.209/0.418 · `qwen/qwen3.8-flash` 0.15/0.47 · embeddings `baai/bge-m3` 0.01. Final choice after a small bake-off on Arabic/English/Tagalog JSON tasks (`ai-agents.md` §models). A spend guard stops paid calls at $10 cumulative (configurable) and falls back to fixed replies; usage is read back from OpenRouter's `usage.cost`.

## 9. Testing

- Backend: pytest + httpx AsyncClient against a real Postgres (test DB in CI service container). Model calls replaced by recorded fixtures (KNW plan 4.11).
- Frontend: Vitest for client rules (streak, BKT, review selection, lesson state, daily card), Playwright smoke on the deployed URL.
- Names carry the rule: `test_knw01_r2_no_source_apologises`, `streak.mot02_r3_pause_keeps_count`.

## 10. Operations

- Secrets only in `/home/naser/.config/rafeeq/secrets.env` (server) and GitHub encrypted secrets if ever needed. Never in git.
- Backups: nightly `pg_dump` to `/home/naser/backups/rafeeq/` (7 kept).
- Health: `/api/health`; deploy waits for it and rolls back to the previous image on failure.
