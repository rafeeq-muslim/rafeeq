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

## Security review 2026-10-07: refresh and sign-out check the page's origin (B-L4; branch `sec-injection-hardening`)

`POST /api/auth/refresh` and `POST /api/auth/logout` are the two routes authorised by the refresh cookie alone. SameSite=Lax keeps other sites out, but an app on a sibling subdomain is the same site. Both routes now refuse (`403 cross_site_request`) a request whose `Origin` is neither `PUBLIC_URL` nor the host the request was sent to, an `Origin: null`, and `Sec-Fetch-Site: cross-site` (`app/platform/origin.py`, attached as a dependency in `auth.py`). A request with no `Origin` (not a browser) is accepted. Production needs `PUBLIC_URL` to be the address people open (`infra/compose.prod.yml` sets it) or the Host header to reach the backend unchanged (`infra/web.nginx.conf` passes it); either is enough. Tests: `backend/tests/test_sec_l4_origin.py`. The cookie's name prefix is a separate change (branch `sec-auth-config-hardening`).
