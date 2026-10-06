# CMP-03 choose a mentor: implementation

**Feature:** `docs/domains/companion/features/CMP-03-choose-mentor.md` (draft by Claude, for review) · **Related:** CMP-02 R6, MOT-07 R6 (`share_progress_with_mentor`) · **Rules touched:** `rules.md` §4 (account optional, mentors see only what the user allows), PLT-02 R5 (display name only)
**Written:** 2026-10-05 by Claude.

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 (account needed) | `app/companion/mentors.py` | Every endpoint uses `CurrentUser` → guests get `401 sign_in_required`; the screen invites them to an account and keeps «أريد إنسانًا» |
| R2 (ask gender + languages only here; ≤ 3, same gender, a shared language, accepting, under capacity, least loaded first) | `mentors.py::suggestions` | `PUT /api/mentors/me/match {gender, languages}` writes `users.gender` / `users.languages` (the columns exist for CMP-03/05; PLT `PATCH /api/me` does not accept gender). Without a gender → `409 match_profile_required`. Query: role `mentor`, same gender, languages overlap, `accepting`, mentee count < `capacity`, not blocked by/blocking the learner, order by mentee count then random |
| R3 (card fields) | `mentors.py::_card` | `id`, `display_name`, `languages`, `about`, `availability`. Never username |
| R4 (one at a time; change/end; permission resets) | `mentors.py::choose` / `end` | `cmp_mentor_links` keyed by learner: choosing replaces the row with `share_progress=false`, `welcomed_at=null`; ending deletes it. The old mentor's open `kind=mentor` thread is closed and leaves his inbox for good; the learner's requests he held move to the new mentor or the pool (see «R4: an ended link stays ended») |
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
| R2 ex3 none available | `test_cmp03_r2_no_sister_in_her_language_returns_empty` |
| R3 ex1 no username | `test_cmp03_r3_card_shows_no_username_or_contact` |
| R4 ex1 change mentor | `test_cmp03_r4_changing_mentor_removes_old_and_resets_permission` |
| R4 ex2 end | `test_cmp03_r4_ending_leaves_no_mentor` |
| R5 ex1 push + needs welcome | `test_cmp03_r5_mentor_is_notified_and_sees_welcome_flag` |
| R5 ex2 first message clears | `test_cmp03_r5_first_message_clears_welcome_flag` |
| R6 ex1 private thread | `test_cmp03_r6_private_thread_reaches_own_mentor_only` |
| R6 ex2 permission off | `test_cmp03_r6_share_progress_is_off_until_turned_on` |

## Rewrite (PR #21, 2026-10-06)

Rules unchanged in substance. The cap comes from CMP-02 R4 (8, at most 10; group members not counted); a paused mentor is not suggested. R2 ex3 copy says «لا مرشدة متاحة بلغتك الآن» to a sister. Tests: `backend/tests/test_cmp03_mentors.py`.

## R4: an ended link stays ended (cmp-03-r4-ended-link, audit 2026-10-06)

Before: `end_link` closed the pair's thread but kept `mentor_id`; the learner writing in it set `status=open`, and the inbox showed it again to the former mentor (`mentor_id = me AND status != closed`), also after suspension and reinstatement. Open human/escalation requests stayed with the old mentor unless the learner blocked him.

Now (no migration):

- **A mentor thread lives with its link.** `inbox.assigned_clause`: a `kind=mentor` request is visible to its mentor only while `cmp_mentor_links` has that (learner, mentor) row. Every inbox read, reply, close, referral and report goes through `visible_request` → `visible_clause`.
- **Writing in an ended thread** (`help.post_message`, `_link_ended`): the message goes to the current mentor's thread (`get_or_create_thread`), or with no mentor becomes a new `kind=human` request (the learner's gender and locale, `source=null`, no mentor) in the pool (CMP-01 R3). The old thread stays closed and readable; `GET /api/help/requests/{id}` returns `link_ended=true`, and the response of the post is the summary of where the message went, so `HelpThread.tsx` navigates there and shows `cmp.thread.endedNote` instead of «اكتب لتفتحها من جديد».
- **Former mentor.** `end_link` keeps (or creates, closed and empty) the pair's thread as the record that he was this learner's mentor. `inbox.former_mentor_clause` hides the learner's pool requests (human/escalation) from him until the learner chooses him again. Urgent requests are not filtered: danger goes to the first available person (rules.md §2.8). An empty closed mentor thread is not listed to the learner.
- **Requests follow the link.** `end_link(link, new_mentor_id)` moves the learner's human/escalation requests held by the old mentor (open and closed, so a later message never reaches him) to the new mentor when he can take them (`can_take`: same gender, speaks the request's language), otherwise to the pool (`mentor_id=null`). Urgent requests are untouched. Called by choose (with the new mentor), end, block (`/mine/block` and now also `/api/help/requests/{id}/block` when it ends the link) and `MentorSuspended`.
- Known limit: `same_gender_available` (the «waiting for a brother/sister» note) does not discount a former mentor, so the note can be missing when he is the only one free.

Tests: `backend/tests/test_cmp03_r4_ended_link.py` (change, end, suspend→reinstate, revoke→approve, requests moved/returned, urgent unchanged, both block paths, live thread unchanged), `frontend/src/app/companion/cmp03-r4-ended-link.test.tsx`.
