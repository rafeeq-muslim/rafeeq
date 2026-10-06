# ORG-03 organisation dashboard: implementation

**Feature:** `docs/domains/organizations/features/ORG-03-organization-dashboard.md` (PR #32) · **Rules touched:** `rules.md` §4 (minimum data), MOT-08 R6 (under 10), research/10 (small-cell suppression) · **Written:** 2026-10-06 by Claude.

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 coordinators only, counts only | `organizations/manage.py::coordinator_of`, `GET /api/org/{id}/dashboard`; `frontend/src/app/pages/roles/Org.tsx` (`/org`, role `org_coordinator`) | 403 for other organisations, mentors and admins. Empty organisation: «لا أرقام بعد» and its codes |
| R2 under 10 | `organizations/figures.py::count`, `share`, `partition` | `{"n": null}` = «أقل من 10»; no share on a hidden count or when the rest is 1–9; complementary suppression across statuses |
| R3 continuation per monthly cohort | `figures.py::cohorts`, using `org_link_statuses` | Due only when every member has reached 30/90 days, else «لم يحن بعد» |
| R4 statuses today, return rate | `figures.py::partition`, `returned` | MOT-07 statuses plus «لم يُتمّ درسًا بعد»; return = lapsed at the start of the last 30 days → «عائد» during them |
| R5 language only | `figures.py::language_groups`, `?lang=ar|en|tl|other` (any other parameter is ignored; an unknown language is 422) | Languages under 10 pooled in «لغات أخرى» |
| R6 unlinked people leave, past days stay | `organizations/jobs.py::snapshot_all` at 00:10 Asia/Riyadh into `org_daily_snapshots`; `GET /api/org/{id}/dashboard/{day}` | Unlinking deletes the link, so later figures exclude it; a frozen day is never recomputed |

## 2. Tests

`backend/tests/test_org03_dashboard.py` (14), `frontend/src/app/org/org.rules.test.tsx` (`org03_*`, 5).
