# PLT-02 optional account: implementation (update for PR #25)

**Feature:** `docs/domains/platform/features/PLT-02-optional-account.md` · **Rules touched:** `rules.md` §4 · **Written:** 2026-10-06 by Claude. The first build is mapped in `learning-motivation-platform.md` → «PLT-02 optional account».

## 1. What changed

| Rule | Module | Change |
| --- | --- | --- |
| R1 offer after the first lesson, skippable; mentor/group invite; progress moves | `Home.tsx` (existing offer with «لاحقًا»), `ChooseMentor.tsx`, `GroupPage.tsx`, `lib/sync.ts` (existing) | Tests added for the invite and for three guest lessons reaching another device |
| R2 three fields; gender only when matching | `Account.tsx`, `PUT /api/mentors/me/match` (existing) | Test: no gender at sign-up, set when matching. A mentor invite still asks the mentor's own gender (CMP-03 matching) |
| R3 credentials shown once to copy | `Account.tsx` | **Bug fixed:** after sign-up the page switched to the account settings at once, so the credentials screen never showed. The page now keeps the credentials (with copy buttons and the warning) until «حفظتها، تابع» |
| R4 data promise and no recovery, before creating | `Account.tsx` | The no-recovery warning (`acct.noRecoveryBefore`) now shows before the account is created, not only after; a privacy policy link sits above the fields (PLT-05 R1) |
| R6 email service not ready | `/api/me/2fa/available` (existing) | Test added |

## 2. Tests

Backend `tests/test_plt02_account.py`: added `test_plt02_r1_guest_is_invited_not_forced_for_a_mentor_or_group`, `test_plt02_r1_three_guest_lessons_move_into_the_account_and_reach_another_device`, `test_plt02_r2_gender_is_not_taken_at_sign_up_but_when_matching`, `test_plt02_r6_email_service_not_ready_is_reported`.

Frontend `src/app/platform.rules.test.tsx` (`plt-02 …`): three fields with the promise, the warning and the policy link before creating; generated credentials shown once with copy buttons.

## 3. Security hardening (audit 2026-10-07, branch `sec-auth-config-hardening`)

Tests: `backend/tests/test_sec_auth_config_hardening.py` (`test_sec_<finding>_…`).

| Finding | Module | Behaviour now |
| --- | --- | --- |
| C-M2 | `core/config.py` | With `ENV=production` the settings refuse to load (the backend does not start) when `JWT_SECRET` is the default, the `.env.example` placeholder or under 32 characters, or when `BOOTSTRAP_ADMIN_PASSWORD` is set and under 16. The error names the variable and what to set; values are never printed (`hide_input_in_errors`). Local runs and tests are untouched |
| C-M3 | `core/db.py`, `platform/mailer.py`, `platform/push.py`, `companion/notify.py` | `hide_parameters=True`; delivery failures log the exception type only (no recipient, no push endpoint, no traceback) |
| C-M5 | `platform/admin.py::new_invite`, `organizations/manage.py::_invite`, `platform/auth.py::register` | Invite codes are `PREFIX-` + `secrets.token_urlsafe(16)` (128 bits, 26 characters, case-sensitive; column `String(32)`). Codes issued earlier keep working. 50 failed invite claims in 10 minutes from all addresses together → every claim gets `invite_invalid` until the window passes; sign-up without a code is untouched |
| A-H2, C-L2 | `core/ratelimit.py`, `platform/auth.py` | Limiter keys are stored as 16-byte digests; a key is dropped when its window empties (on read, and by a sweep every 60 s); at most 50,000 keys, least recently used first out. `hit()` and `reset()` unchanged; new read-only `full()`. Bounds: sign-in username 40, passwords 128, `username-available?u=` 64, invite code 64, language lists 8. `/api/auth/login/2fa`: 30 per 10 minutes per address |
| C-L4 | `platform/auth.py::_send_code`, `_check_code` | A new code deletes the account's earlier unused codes of the same kind. 10 wrong codes per account in 10 minutes → 429 for that account's codes until the window passes |
| C-L5 | `platform/auth.py` | `/api/me/2fa/confirm`: 6 per 10 minutes per account. An attempt is counted by one `UPDATE … WHERE attempts < 5`, so parallel guesses cannot share an attempt; the code is marked used the same way |
| C-L7 | `users.password_changed_at` (migration `b8c9d0e1f2a3`, one nullable column), `core/deps.py` | An access token whose `iat` is before the last password change gets 401 `invalid_token`. The device that made the change refreshes with its new cookie (`lib/api.ts` already retries once after a 401). Sign-out and two-step changes do not set it |
| C-L8 | `platform/auth.py::change_password` | 5 per 10 minutes per account |
| C-L9 | `platform/auth.py` | Production sets `__Secure-rafeeq_refresh` (Secure, HttpOnly, SameSite=Lax, Path=/api/auth) and removes the old `rafeeq_refresh`; the old name is still read, so nobody is signed out. Local runs keep the plain name (`__Secure-` needs HTTPS). `__Host-` was not used: it requires `Path=/`, which would send the refresh token with every request. `__Secure-` stops a plain-http or network attacker from planting the cookie; another HTTPS site under the same parent domain can still set one for the parent domain: only `__Host-` (with `Path=/`) or a domain on the Public Suffix List closes that. Open decision for the owner |
| C-L10 | `platform/retention.py` (job `plt-retention-purge`, daily 00:40 Riyadh) | Deletes expired `refresh_sessions` and used or expired `one_time_codes`. Turning two-step off deletes the account's codes at once (with `pending_email`). The outbox purge belongs to `app/core/retention.py` (audit A-H5) |
| C-L11 | `platform/auth.py::delete_account` | Outbox rows naming the account as `mentor_id` are deleted too |
| C-L12 | `main.py::api_docs` | No `/api/docs`, `/api/redoc` or `/api/openapi.json` in production |

Deferred, with the reason:

- **C-L3** (`login-user:` counted before the password check): counting failures only would let a correct password through while someone else is guessing, which is what the limit is for; the present limit lets a stranger who knows a username keep its owner out for 10 minutes at a time (8 tries). Both are a product trade-off (accounts have no recovery path), so it stays as is until the owner decides. 💬
- **C-L6** (refresh reuse detection): needs a token family id and kept, revoked rows (a schema change and a new sign-out path that can hit a real user whose refresh raced on two tabs: `lib/api.ts` shares one refresh per tab, not across tabs). Too much for a hardening batch; own change with its own tests.
- **C-L15** (8-character minimum): the app generates long passwords by default (PLT-02 R3) and sign-in is limited per address and per username; raising the minimum changes PLT-02 R2's wording and the three languages' texts. Owner decision. 💬

## 4. Security review 2026-10-07: refresh and sign-out check the page's origin (B-L4; branch `sec-injection-hardening`)

`POST /api/auth/refresh` and `POST /api/auth/logout` are the two routes authorised by the refresh cookie alone. SameSite=Lax keeps other sites out, but an app on a sibling subdomain is the same site. Both routes now refuse (`403 cross_site_request`) a request whose `Origin` is neither `PUBLIC_URL` nor the host the request was sent to, an `Origin: null`, and `Sec-Fetch-Site: cross-site` (`app/platform/origin.py`, attached as a dependency in `auth.py`). A request with no `Origin` (not a browser) is accepted. Production needs `PUBLIC_URL` to be the address people open (`infra/compose.prod.yml` sets it) or the Host header to reach the backend unchanged (`infra/web.nginx.conf` passes it); either is enough. Tests: `backend/tests/test_sec_l4_origin.py`. The cookie's name prefix is §3, C-L9.
