# ORG-02 mentor management: implementation

**Feature:** `docs/domains/organizations/features/ORG-02-mentor-management.md` (PR #32) · **Rules touched:** `rules.md` §1.2 (no fatwa), §4 (mentors see only what the user allows; neutral notifications) · **Written:** 2026-10-06 by Claude.

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 one-time invite | `POST /api/org/{id}/invites` (`manage.py::create_invite`) writes a platform `Invite` with `org_id` and `expires_at` (+7 days); `platform/auth.py::register` refuses used or expired codes and publishes `AccountCreated` with `invite: {role, org_id}`; `organizations/events.py::on_account_created` adds the `OrgMember` and publishes `MentorApproved` | The volunteer signs up with the code. Security review B-H1 (2026-10-07): `create_invite` takes `{gender}` (422 without it) and stores it in `invites.gender` (migration `f0a1b2c3d4e5`); `register` gives the account that gender whatever the registrant sends. Codes made before the column keep the old behaviour (the registrant's gender, required). The admin's mentor codes (`POST /api/admin/invites`, `400 gender_required_for_mentor` without one) work the same way |
| R2 rules before the inbox | `companion/inbox.py::mentor_gate` (used by the inbox, mentees, profile, referrals and group creation), `GET/POST /api/inbox/rules`; `cmp_mentor_profiles.rules_accepted_at`; `frontend/src/app/companion/mentor/MentorRulesGate.tsx` around `pages/roles/Inbox.tsx` | 403 `mentor_rules_required` until accepted; not suggested (CMP-03) and not counted as an available responder (CMP-01 R3) until then. All mentors; team members exempt |
| R3 load and state only | `GET /api/org/{id}/mentors` with `companion/public.py::mentor_loads` | Display name, languages, gender, state, mentees of cap, group members of 25 |
| R4 missing pairs | `companion/public.py::waiting_pairs` minus the organisation's receiving mentors | «ينقصكم: مرشدة بالتاغالوغية»; pairs only |
| R5 suspend / withdraw | `POST …/suspend`, `POST …/reinstate`, `DELETE …/mentors/{id}`; `MentorSuspended` → `companion/events.py::on_mentor_suspended` (`cmp_mentor_profiles.suspended`, `cmp_mentor_ended`, neutral push `mentor_change`); learner notice in `companion/MentorHub.tsx` | Links and threads end, open requests return to the pool (same-gender rule), the notice names no reason and no organisation |

## 2. Tests

`backend/tests/test_sec_b_h1_mentor_gender.py` (invite gender: organisation, admin, application, old codes), `backend/tests/test_org02_mentors.py` (10), `frontend/src/app/org/org.rules.test.tsx` (`org02_*`, 4). Test helpers accept the mentor rules for mentors they create (`tests/cmp_helpers.py::accept_mentor_rules`).
