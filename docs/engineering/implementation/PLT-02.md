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
