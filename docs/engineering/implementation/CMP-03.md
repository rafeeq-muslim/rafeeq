# CMP-03 choose a mentor: implementation

**Feature:** `docs/domains/companion/features/CMP-03-choose-mentor.md` (draft by Claude, for review) · **Related:** CMP-02 R6, MOT-07 R6 (`share_progress_with_mentor`) · **Rules touched:** `rules.md` §4 (account optional, mentors see only what the user allows), PLT-02 R5 (display name only)
**Written:** 2026-10-05 by Claude.

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 (account needed) | `app/companion/mentors.py` | Every endpoint uses `CurrentUser` → guests get `401 sign_in_required`; the screen invites them to an account and keeps «أريد إنسانًا» |
| R2 (ask gender + languages only here; ≤ 3, same gender, a shared language, accepting, under capacity, least loaded first) | `mentors.py::suggestions` | `PUT /api/mentors/me/match {gender, languages}` writes `users.gender` / `users.languages` (the columns exist for CMP-03/05; PLT `PATCH /api/me` does not accept gender). Without a gender → `409 match_profile_required`. Query: role `mentor`, same gender, languages overlap, `accepting`, mentee count < `capacity`, not blocked by/blocking the learner, order by mentee count then random |
| R3 (card fields) | `mentors.py::_card` | `id`, `display_name`, `languages`, `about`, `availability`. Never username |
| R4 (one at a time; change/end; permission resets) | `mentors.py::choose` / `end` | `cmp_mentor_links` keyed by learner: choosing replaces the row with `share_progress=false`, `welcomed_at=null`; ending deletes it. The old mentor's open `kind=mentor` thread is closed and leaves his inbox |
| R5 (neutral push, «رحّب به») | `mentors.py::choose` + `inbox.py::reply` | Push `اختارك مستفيد جديد` to the mentor; `welcomed_at` set on the mentor's first message in any thread of that learner; `needs_welcome = welcomed_at IS NULL` |
| R6 (private thread; permission off by default) | `mentors.py::thread`, `share` | `POST /api/mentors/mine/thread` gets or creates one `kind=mentor` request assigned to the mentor; `PUT /api/mentors/mine/share {share}` |

## 2. Endpoints (account)

`PUT /api/mentors/me/match` · `GET /api/mentors/suggestions` · `POST /api/mentors/choose {mentor_id}` · `GET /api/mentors/mine` · `DELETE /api/mentors/mine` · `PUT /api/mentors/mine/share` · `POST /api/mentors/mine/thread` · `POST /api/mentors/mine/block` (CMP-04 R5).

## 3. Frontend

`/mentor` hub (my mentor card, share toggle, private thread, group, human help), `/mentor/choose` (two steps: who you are → three cards). `ShareProgressToggle` is exported from `frontend/src/app/companion/ShareProgressToggle.tsx` for the Me screen.

## 4. Tests (`backend/tests/test_cmp03_mentors.py`)

| Example | Test |
| --- | --- |
| R1 ex1 guest invited | `test_cmp03_r1_guest_cannot_choose_a_mentor` |
| R2 ex1 three same-gender, least loaded first | `test_cmp03_r2_suggests_three_same_gender_least_loaded_first` |
| R2 ex2 full or paused hidden | `test_cmp03_r2_full_or_paused_mentor_is_not_suggested` |
| R2 ex3 none available | `test_cmp03_r2_no_mentor_available_returns_empty` |
| R3 ex1 no username | `test_cmp03_r3_card_shows_no_username_or_contact` |
| R4 ex1 change mentor | `test_cmp03_r4_changing_mentor_removes_old_and_resets_permission` |
| R4 ex2 end | `test_cmp03_r4_ending_leaves_no_mentor` |
| R5 ex1 push + needs welcome | `test_cmp03_r5_mentor_is_notified_and_sees_welcome_flag` |
| R5 ex2 first message clears | `test_cmp03_r5_first_message_clears_welcome_flag` |
| R6 ex1 private thread | `test_cmp03_r6_private_thread_reaches_own_mentor_only` |
| R6 ex2 permission off | `test_cmp03_r6_share_progress_is_off_until_turned_on` |
