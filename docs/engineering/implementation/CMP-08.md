# CMP-08 mentor application: implementation

**Feature:** `docs/domains/companion/features/CMP-08-mentor-application.md` (draft by Claude, for review) · **Related:** ORG-02 (invites, mentor rules), CMP-01 R3 (gender), PLT-05 (policy, export, deletion) · **Rules touched:** rules.md §4 (minimum data, no third parties, neutral notifications), §5 (no real contacts in the repo)
**Written:** 2026-10-06 by Claude.

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 form | `app/companion/applications.py::apply` (`POST /api/mentor-applications`, no auth) | `ApplyIn`: display name ≤ 40, gender, 1–3 languages, optional place ≤ 80, about 1–600, contact (email, or phone normalised to `+digits`, 7–15 digits), `rules_accepted` must be true, optional `org_code`. `422` otherwise. Signed in: contact optional, the account's own gender wins |
| R2 one answer, anti-abuse | same | Always `201 {received, keep_days: 90}`. A pending row from the same account is replaced; a submission that only repeats a pending row's contact (no account, or another account) gets the same answer and is not stored, so nobody overwrites or takes over an application by knowing its contact (security review B-L10; `tests/test_sec_b_l9_l10_l11.py`). A signed-in applicant's pending row is looked up by the account first and is the only row replaced; the contact is checked only when the account has none. `ratelimit.hit("mentor-apply:<ip>", 5, 3600)` in memory, IP never stored. Honeypot `website`: same answer, nothing stored. No captcha |
| R3 staff only | `staff` router, `require_role("team")` (admins pass) | `GET /api/admin/mentor-applications`. `GET /api/mentor-applications/mine` returns status and date only |
| R4 decide | `_approve`, `_reject`, `remove` | Approve without an account: `platform/admin.py::new_invite` (the existing `invites` row; with `org_id` and 7 days when the application named an organisation; with `gender` = the application's gender, which `register` enforces: security review B-H1). Reject: `contact = about = NULL`, optional `note`. `409 already_decided` on a second decision |
| R5 account | `_approve` → `organizations/public.py::approve_mentor` | Adds `mentor` to the roles, sets the account's gender to the application's (`409 gender_mismatch`, nothing changed, when the account now has the other gender: security review B-H1), merges languages, adds the `org_members` row when an organisation was named, publishes `MentorApproved {mentor_id, user_id}`. `409 already_mentor` on apply. Neutral push to the applicant |
| R6 retention | `applications.py::purge`, `companion/jobs.py` (00:20 Asia/Riyadh daily) | Deletes pending rows older than 90 days and decided rows 90 days after `decided_at` |
| R7 rights | `companion/events.py` (AccountDeleted), `companion/export.py`, `DELETE /api/mentor-applications/mine` | FK `ON DELETE CASCADE` plus the handler; the export has the application without `note` and `invite_code` |
| R8 coordinator | `org` router, `organizations/manage.py::coordinator_of` | `GET/POST /api/org/{org_id}/mentor-applications[/{id}/approve|reject]`: only rows with that `org_id` (`404` otherwise), `note` always null, no delete |
| R9 notice | `notify.later(notify.to_role, ["team", "admin"], "notice", …)` | Title «لديك تنبيه جديد», empty body; only for a new row |

## 2. Data

Table `cmp_mentor_applications` (migration `d4e5f6a7b8c9`, on `1a9e0d5c3b7f`): display_name, gender, languages, locale, place, about, contact, user_id (FK users, cascade), org_id (no FK, like `invites.org_id`), status, created_at, decided_at, decided_by (FK users, set null), note, invite_code.

**Contact storage: plain text, not encrypted.** The codebase has no data-encryption key or crypto helper (`app/core/security.py` has password hashing, JWT and SHA-256 only; the 2FA email in `users.email` is stored plainly). Deriving a key from `JWT_SECRET` would lose every contact when that secret rotates, and a new secret needs an infra change. So protection is access control (staff and the named organisation's coordinator only) and short retention. Open question in the feature doc.

## 3. Frontend

`/mentor-apply` (`app/companion/MentorApply.tsx`, public, outside the app shell) · `/mentor-applications` (`app/companion/MentorApplications.tsx`, roles team/admin) · «الطلبات» tab in `/org` (same list, coordinator mode). Entry points: landing page end section (`bloom.mentor`, `bloom.mentorLink` → `/app/mentor-apply`), welcome screen entries, «حسابي» (a row for non-mentors; a team link to the list), a link under the invite-code field in account creation. The invite-code path is unchanged.

i18n: `cmp.apply.*`, `cmp.apps.*`, `org.tab.applications`, `policy.apply.*`, `policy.revisedApply`. English and Tagalog written by Claude from the Arabic.

## 4. Tests

Security review B-H1: `tests/test_sec_b_h1_mentor_gender.py` (8).

Backend `tests/test_cmp08_mentor_application.py` (36): `test_cmp08_r1_*` … `test_cmp08_r9_*`, one or more per example. Frontend `src/app/companion/cmp08.rules.test.tsx` (28): the form, the confirmation, the honeypot, the applicant's status, the four entry points, the team list and the coordinator mode, the policy section.
