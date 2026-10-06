# Overnight build: status and handoff

Owner of this file: Claude (product engineer). Updated: 2026-10-06 ~01:10 (server time, UTC).

Live: https://rafeeq.nan.sa (every push to `main` deploys; health check + automatic rollback).

## Done and deployed
- Foundations: `frontend/` (React PWA on the design system), `backend/` (FastAPI, Postgres + pgvector, Alembic), Docker images, compose, nginx, router app `rafeeq.nan.sa`, CI + deploy on two self-hosted runners.
- PLT-01 onboarding, PLT-02 accounts (generated credentials, optional email 2FA, invite codes for roles), Me (privacy, quick exit, discreet mode, reminder, language, delete account, erase device), Admin (invites, roles).
- LRN-01/03/09 content: 6 units, 25 lessons in ar/en/tl, all waiting for Sharia approval. LRN-02 path, LRN-03 lesson player, LRN-04 review, LRN-05 placement, LRN-10 mastery.
- KNW-02 corpus loader and Quran scripture API (QuranEnc, HadeethEnc, islamqa, binbaz, IslamHouse book loaded in production). KNW-05 review desk.
- MOT-02 streak, MOT-03 badges, MOT-05 reminders (web push), MOT-07 engagement status, MOT-08/09 team indicators.
- Docs: `plan.md`, `decisions-for-review.md`, `conflicts.md`, `ux-journey.md`, sources research, convert research, AI tool layer.

## Heartbeat 22:30
- Merged مهند's commit on `lrn-01-04-mot-02-08-learning-motivation-docs`: unit 1 content draft in his format with 21 step photos and `content/check_content.py`. Unit 1 is now served from it (photos, Al-Fatiha audio, support videos); units 2–6 from the pipeline. No open PRs.

## Done since 22:30
- Practice (PRC-01/02/04/05/07) and Discover (KNW-03/06/07/08/09), Companion (CMP-01..05, MOT-06), Ask first pass (KNW-01/04/10): committed in `4bd9f4a` after the full suite passed (231 backend, 86 frontend).
- Landing page (Scrollcraft) at `/landing/`; first visit at `/` goes there; its call to action opens `/welcome`.
- Me shows «شارك تقدّمي مع مرشدي»; Team shows the reports queue.

## Incident 23:00 (resolved)
- The deploy of `4bd9f4a` failed: a full-text migration over the whole corpus outlived the 3-minute health window; the rollback then ran the old image on the migrated schema and could not start (502 for ~20 minutes). Fixed in `1baf417`: migrations now run as their own step before the switch, with no time limit. Rule kept: migrations are additive only.

## Done since 23:30
- Ask and AI (KNW-01/04/10) finished and committed (`e3c96af`); `ai-agents.md` with prices, bake-off, model choice and spend (about $0.43 of the $10 budget so far).
- Security review: all findings fixed except the four that need the server owner (see `decisions-for-review.md` → Security review). CSP and security headers live with zero violations.

## 2026-10-06 07:20
- GitHub Actions now wakes the session on teammate pushes and PRs (`.github/workflows/notify.yml`); polling stopped.
- Merged PR #6 (مهند): reviewer decisions and first review pass of unit 1 (22 objectives, 45 exercises). Applied both decisions to units 2–6 through recorded edits (`content/tools/edits.py`).

## State
All features in the PRDs are built, tested (237 backend, 86 frontend) and deployed. What remains needs people: Sharia approval of the content (nothing is shown to learners before it), the five postponed items, and the four server-owner security items. New PRs or teammate commits follow the PRD → plan → code → tests procedure.

## Credentials and access (never in git)
- Secrets: `/home/naser/.config/rafeeq/secrets.env` (OpenRouter key, DB, JWT, VAPID, bootstrap admin `rafeeq-admin`).
- Invite codes for production (Sharia reviewer, mentors, team): `/home/naser/.config/rafeeq/invites.txt`.

## Needs the product owner
See `decisions-for-review.md` → "Postponed: needs you" (email provider, helplines, permission letters, Sharia approval, Tagalog review).

## Next
1. Keep watching GitHub for new PRs and commits; apply the PRD → plan → code → tests procedure to anything new.
2. When مهند approves content, walk every learner screen on the live site in all three languages.
