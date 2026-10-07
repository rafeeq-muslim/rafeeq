# CMP-02 mentor inbox: implementation

**Feature:** `docs/domains/companion/features/CMP-02-mentor-inbox.md` (draft by Claude, for review) · **Related:** CMP-01, CMP-03, MOT-07 R6 · **Rules touched:** `rules.md` §4 (mentors see only what the user allows)
**Written:** 2026-10-05 by Claude.

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 (languages, gender preference, urgent for all) | `app/companion/inbox.py::_visible` | Mentor sees a non-urgent request when `lang ∈ user.languages` and (`prefer_gender` is null or equals `user.gender`). Urgent (`kind=urgent`, not closed) is visible to every mentor and every `team` member regardless of language, until closed. Team members who are not mentors see urgent requests only |
| R2 (order) | `inbox.py::list_requests` | urgent first; then waiting (`status=open`) by `last_activity_at` ascending (longest wait first); then answered by most recent |
| R3 (first reply claims; own mentor first; 24 h) | `inbox.py::reply` + `_visible` | A reply sets `mentor_id` (if empty) and `first_reply_at`. A request with `mentor_id` set is visible only to that mentor, unless `first_reply_at IS NULL` and it is older than 24 h, then the R1 pool sees it too and the first replier takes it. A learner with a chosen mentor (CMP-03) gets `mentor_id` = that mentor at creation |
| R4 (close, escalate, reopen) | `inbox.py` | `POST …/close` → `closed`; `POST …/urgent` → `kind=urgent` (team + all mentors, push); a learner message on a closed request sets `open` again (`help.py`) |
| R5 (what a request shows) | `inbox.py::_out` | `handle` (display name, or a 4-digit guest number), `is_guest`, `lang`, `topic`, `source`, `kind`. Never username, device, IP or token |
| R6 (mentees; status only with permission) | `inbox.py::mentees` + `events.py::on_engagement` | `EngagementStatusChanged {user_id, status}` → `cmp_mentee_status` (CMP's own copy). The list shows display name, chosen date, `needs_welcome`; `status` is included **only** when `MentorLink.share_progress` is true at read time. Non-mentors → 403 |

**Security review B-M3 (2026-10-07), `inbox.py::visible_clause`, `may_close`, `close`, `make_urgent`; `help.py::_notify_mentor_of`.** An urgent request is visible to every responder only while `mentor_id IS NULL`; once held (the first reply sets `mentor_id`) only its holder (`assigned_clause`) and team/admin see, answer or close it, and it returns to everyone when the holder is cleared (block, suspension). `POST …/close` answers `403 not_assigned` unless the caller is the assignee or team/admin (`RequestRow.can_close` drives the menu item). `POST …/urgent` on a held conversation (`kind = mentor`, or any request with a first reply) keeps `mentor_id` and pushes team/admin only; on an unanswered request it clears `mentor_id` and pushes every responder (rules.md §2.8). A learner's new message in a held urgent request pushes its holder and team/admin, not every mentor. The team reads the whole escalated thread (open question in the feature doc). Tests: `backend/tests/test_sec_b_m3_urgent_threads.py` (9), `frontend/src/app/companion/sec-b.m3.close.test.tsx` (2).

Blocks (CMP-04 R5) are applied in `_visible`: a request whose owner blocked this mentor is never shown to them.

## 2. Endpoints (role `mentor`, or `team` for urgent)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/inbox/requests` | list (R1–R3, R5); alerts without owner carry `can_reply=false` |
| GET | `/api/inbox/requests/{id}` | thread; marks learner messages read |
| POST | `/api/inbox/requests/{id}/messages` | reply (claims); learner gets neutral push |
| POST | `/api/inbox/requests/{id}/close` · `/urgent` | R4 |
| GET | `/api/inbox/mentees` | R6 |
| GET/PUT | `/api/inbox/profile` | `about`, `availability`, `accepting`, `capacity` (1–10, default 8) |

## 3. Data

`cmp_mentee_status(user_id PK, status, changed_at)` (new). `cmp_mentor_links.welcomed_at` (new, CMP-03 R5).

## 4. Frontend

`frontend/src/app/pages/roles/Inbox.tsx` routes: `/inbox` (tabs: requests · mentees · groups · reports for team), `/inbox/r/:id` (thread), `/inbox/g/:id` (group, CMP-05 + MOT-06), `/inbox/profile`. Polling 15 s on the list, 10 s in a thread.

## 5. Tests (`backend/tests/test_cmp02_inbox.py`)

| Example | Test |
| --- | --- |
| R1 ex1 languages | `test_cmp02_r1_mentor_sees_only_requests_in_his_languages` |
| R1 ex2 same gender | `test_cmp02_r1_sister_request_is_hidden_from_a_brother` |
| R1 ex3 urgent in any language | `test_cmp02_r1_urgent_request_is_visible_in_any_language_first` |
| R2 ex1 urgent first | `test_cmp02_r2_urgent_first_then_longest_waiting` |
| R3 ex1 claim | `test_cmp02_r3_first_reply_claims_and_hides_from_others` |
| R3 ex2 own mentor | `test_cmp02_r3_request_goes_to_own_mentor_only` |
| R3 ex3 after 24 h | `test_cmp02_r3_unanswered_after_a_day_opens_to_others` |
| Reopen a closed request (was R4 ex1) | `test_cmp02_closed_request_reopens_when_learner_writes` |
| R5 escalate to urgent (was R4 ex2) | `test_cmp02_r5_mentor_turns_harm_into_urgent` |
| R6 ex1 guest handle only (was R5) | `test_cmp02_r6_guest_request_shows_handle_only` |
| R6 ex1 shared status | `test_cmp02_r6_shared_status_is_visible` |
| R6 ex2 not shared | `test_cmp02_r6_unshared_mentee_shows_name_and_date_only` |
| R6 ex3 non-mentor | `test_cmp02_r6_learner_cannot_open_inbox` |

## Rewrite (PR #21, 2026-10-06)

| Rule | Change |
| --- | --- |
| R1 | Pool = ordinary requests in the responder's languages **of the responder's gender**; responders are mentors and team members with a gender. Urgent requests: everyone, first |
| R3 ex2 | After a day, the pool sees a mentee's request, still same-gender only |
| R4 | `MENTEE_CAP_DEFAULT = 8`, `MENTEE_CAP_MAX = 10`; group members not counted. Paused (`accepting = false`): not suggested, no new pool requests; mentees, claimed threads and urgent stay. Availability text checked for contact details |
| R5 | `referrals.py`: `POST /api/inbox/requests/{id}/refer {message_id}` (a learner message, once) → `cmp_scholar_referrals` row + system line `scholar_referral`; `GET /api/referrals` and `POST /api/referrals/{id}/answer` for `sharia_reviewer` only; the answer is a `scholar` message. Frontend: «أحِله إلى أهل العلم» on learner messages, `/referrals` screen |
| R6 | «زائرة» label for sisters (frontend); fields unchanged |

Tests: `backend/tests/test_cmp02_inbox.py` (every example), vitest `cmp02_*`.

## MentorContacted for MOT-08 R6 (owner approval 2026-10-06)

| Rule | Module | Behaviour |
| --- | --- | --- |
| R7 (MOT-08 R6) | `app/companion/contact.py::mentor_contacted`, called from `inbox.py::reply` | Publishes `MentorContacted {user_id}` (learner's account id only, source `CMP`) through `app.core.events.publish` when the replier is the learner's chosen mentor (`MentorLink.mentor_id`) and `MentorLink.share_progress` is on, in any of that learner's requests (mentor thread or help request). At most one per learner per Asia/Riyadh day (checked in the outbox). Never for guests, team members or other mentors, or Sharia-reviewer answers (`referrals.py`). Account deletion removes the rows with every outbox row naming the account (`platform/auth.py::delete_account`) |

Tests: `backend/tests/test_mot08_r6_mentor_contacted.py`.
