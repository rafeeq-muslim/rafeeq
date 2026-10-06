# CMP-08 mentor application: implementation

**Feature:** `docs/domains/companion/features/CMP-08-mentor-application.md` (draft by Claude, for review) · **Related:** ORG-02 (invites, mentor rules), CMP-01 R3 (gender), PLT-05 (policy, export, deletion) · **Rules touched:** rules.md §4 (minimum data, no third parties, neutral notifications), §5 (no real contacts in the repo)
**Written:** 2026-10-06 by Claude.

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 form | `app/companion/applications.py::apply` (`POST /api/mentor-applications`, no auth) | `ApplyIn`: display name ≤ 40, gender, 1–3 languages, optional place ≤ 80, about 1–600, contact (email, or phone normalised to `+digits`, 7–15 digits), `rules_accepted` must be true, optional `org_code`. `422` otherwise. Signed in: contact optional, the account's own gender wins |
| R2 one answer, anti-abuse | same | Always `201 {received, keep_days: 90}`. A pending row with the same contact (found by its keyed digest, §2.1) or account is replaced. `ratelimit.hit("mentor-apply:<ip>", 5, 3600)` in memory, IP never stored. Honeypot `website`: same answer, nothing stored. No captcha |
| R3 staff only | `staff` router, `require_role("team")` (admins pass) | `GET /api/admin/mentor-applications`. The contact is encrypted at rest (§2.1); `503 applications_closed` on apply while the keys are not set. `GET /api/mentor-applications/mine` returns status and date only |
| R4 decide | `_approve`, `_reject`, `remove` | Approve without an account: `platform/admin.py::new_invite` (the existing `invites` row; with `org_id` and 7 days when the application named an organisation). Reject: the contact (ciphertext, digest and any plain text left) and `about` set to NULL, optional `note`. `409 already_decided` on a second decision |
| R5 account | `_approve` → `organizations/public.py::approve_mentor` | Adds `mentor` to the roles, sets gender if unset, merges languages, adds the `org_members` row when an organisation was named, publishes `MentorApproved {mentor_id, user_id}`. `409 already_mentor` on apply. Neutral push to the applicant |
| R6 retention | `applications.py::purge`, `companion/jobs.py` (00:20 Asia/Riyadh daily) | Deletes pending rows older than 90 days and decided rows 90 days after `decided_at` |
| R7 rights | `companion/events.py` (AccountDeleted), `companion/export.py`, `DELETE /api/mentor-applications/mine` | FK `ON DELETE CASCADE` plus the handler; the export has the application without `note` and `invite_code` |
| R8 coordinator | `org` router, `organizations/manage.py::coordinator_of` | `GET/POST /api/org/{org_id}/mentor-applications[/{id}/approve|reject]`: only rows with that `org_id` (`404` otherwise), `note` always null, no delete |
| R9 notice | `notify.later(notify.to_role, ["team", "admin"], "notice", …)` | Title «لديك تنبيه جديد», empty body; only for a new row |

## 2. Data

Table `cmp_mentor_applications` (migration `d4e5f6a7b8c9`, on `1a9e0d5c3b7f`): display_name, gender, languages, locale, place, about, contact, user_id (FK users, cascade), org_id (no FK, like `invites.org_id`), status, created_at, decided_at, decided_by (FK users, set null), note, invite_code.


Migration `e8f9a0b1c2d3` (on `a7b8c9d0e1f2`, columns only): `contact_enc` (Text) and `contact_hmac` (String 64, indexed). The plain `contact` column stays for one release so the previous image still runs; a later release drops it.

### 2.1 Contact storage: encrypted at rest (security audit 2026-10-07, M4)

| What | How |
| --- | --- |
| Ciphertext | `contact_enc`: Fernet (AES-128-CBC + HMAC-SHA256, random IV, so equal contacts do not look equal) through `MultiFernet` in `app/core/crypto.py` |
| "Same contact applied before" (R2) | `contact_hmac`: HMAC-SHA256 of the normalised contact under its own key; `apply` looks the pending row up by it, without decrypting rows |
| Keys | `APPLICATION_CONTACT_KEYS` (Fernet keys, comma-separated, newest first) and `APPLICATION_CONTACT_HMAC_KEY` (32 characters or more), in the server's secrets file. Not derived from the sign-in secret |
| Write | `MentorApplication.set_contact`: ciphertext + digest, plain column left empty. `_reject` clears all three |
| Read | `MentorApplication.readable_contact`: staff list, coordinator list, the applicant's own export. A contact that no configured key opens shows **empty** (logged with the application id only), never an error |
| Outside production | No keys set: a fixed public development key (`DEV_ONLY_NOT_SECRET_*`), one warning. It protects nothing and is refused in production |

**Keys missing or unusable in production: closed, not down.** The app starts and works; the start logs one warning naming the two settings and how to generate them. `POST /api/mentor-applications` answers `503 applications_closed` (the form shows «التقديم غير متاح الآن», `cmp.apply.closed`), so nothing is ever stored in plain text. Staff and coordinator lists load: encrypted contacts show empty, rows not encrypted yet stay readable. The migration adds columns only, so a deploy never fails for a missing key.

**Rows from before the encryption** (and rows the previous image writes during a rollback) keep the contact in the plain column and stay readable. `applications.py::encrypt_plaintext` moves them: it runs 20 seconds after every start and in the daily job (`companion/jobs.py`), does nothing without keys, can run any number of times, and empties the plain column in the same statement that stores the ciphertext. By hand:

```
docker compose -p rafeeq -f infra/compose.prod.yml exec -T backend sh -c 'export DATABASE_URL=postgresql+asyncpg://rafeeq:${POSTGRES_PASSWORD}@db:5432/rafeeq && python -m app.core.crypto migrate'
```

**Generating the keys** (on the server; add both lines to the secrets file, then deploy):

```
echo "APPLICATION_CONTACT_KEYS=$(python3 -c 'import base64,os;print(base64.urlsafe_b64encode(os.urandom(32)).decode())')"
echo "APPLICATION_CONTACT_HMAC_KEY=$(python3 -c 'import secrets;print(secrets.token_urlsafe(32))')"
```

**Rotation.** Put a new Fernet key in front of the old one (`APPLICATION_CONTACT_KEYS=new,old`), deploy, run the command above with `rotate` instead of `migrate`, then remove the old key and deploy again. `rotate` re-encrypts every contact with the first key and recomputes the digest, so `APPLICATION_CONTACT_HMAC_KEY` can be replaced in the same run (between replacing it and the run, a returning applicant's pending row is not found and a second row is created). It exits 2 and leaves a row untouched when no key opens it.

**Losing the keys** loses the contacts (they show empty); the applications themselves remain and can still be decided. Keep a copy of the two values wherever the other secrets are kept.

**What this protects, and what it does not.**

- Protects: a database dump, a backup file, or anyone who can read only the database (SQL access, a leaked `pg_dump`).
- Does not protect against someone who controls the server: the keys are in the secrets file on the same host as the database, and the running backend holds them.
- Nightly backups (`infra/scripts/backup.sh`, 7 kept, not encrypted themselves) made before a row was encrypted still hold that contact in plain text until they age out, up to 7 days.
- The digest tells someone holding the database that two rows have the same contact, and lets someone who also holds the digest key test a guessed contact. Display name, place and the «about» text are not encrypted.

**Not done here (follow-up):** the 2FA email (`users.email`, `one_time_codes.pending_email`) is still plain text. No code looks an account up by email, so the same helper fits, but it needs two new columns (a Fernet token does not fit `String(254)`), a data step for existing accounts and changes in `platform/auth.py`, which another security branch is editing now.

## 3. Frontend

`/mentor-apply` (`app/companion/MentorApply.tsx`, public, outside the app shell) · `/mentor-applications` (`app/companion/MentorApplications.tsx`, roles team/admin) · «الطلبات» tab in `/org` (same list, coordinator mode). Entry points: landing page end section (`bloom.mentor`, `bloom.mentorLink` → `/app/mentor-apply`), welcome screen entries, «حسابي» (a row for non-mentors; a team link to the list), a link under the invite-code field in account creation. The invite-code path is unchanged.

i18n: `cmp.apply.*`, `cmp.apps.*`, `org.tab.applications`, `policy.apply.*`, `policy.revisedApply`. English and Tagalog written by Claude from the Arabic.

## 4. Tests

Backend `tests/test_cmp08_contact_encryption.py` (`test_cmp08_r3_*`: round trip, storage, lookup, rejection, export, wrong key, rows in plain text, production without keys, keys added later, rotation) and `tests/test_cmp08_mentor_application.py` (36): `test_cmp08_r1_*` … `test_cmp08_r9_*`, one or more per example. Frontend `src/app/companion/cmp08.rules.test.tsx` (28): the form, the confirmation, the honeypot, the applicant's status, the four entry points, the team list and the coordinator mode, the policy section.
