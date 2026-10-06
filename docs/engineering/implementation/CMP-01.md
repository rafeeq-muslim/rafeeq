# CMP-01 «أريد إنسانًا» and danger hand-off: implementation

**Feature:** `docs/domains/companion/features/CMP-01-human-help-and-danger.md` (draft by Claude, for review) · **Related:** KNW-01 R5 hand-off contract (`implementation/KNW-01.md`), CMP-02, CMP-04 · **Rules touched:** `rules.md` §2.8 (danger → human, AI does nothing else), §2.9 (urgent request carries no question text), §4 (minimum data, neutral notifications, no phone/email)
**Written:** 2026-10-05 by Claude.

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 (from where) | `app/companion/help.py::create_request` | `source ∈ {lesson, review, ask, home, mentor}` stored; nothing else about the screen. The app opens `/mentor/help?from=<source>[&kind=urgent|escalation][&ask=<ask_id>]` |
| R2 (guest token) | `help.py::_owner` | No account → server issues `secrets.token_urlsafe(32)` once, stores only `sha256` in `cmp_help_requests.guest_token_hash`, returns the token in the create response. The device keeps it (`frontend/src/app/companion/store.ts`) and sends `X-Help-Token`. A device that already has a token sends it on create and the same hash is reused. `POST /api/help/claim` (account + token) moves guest requests to the account |
| R3 (no contact details) | `app/companion/text.py::contact_violation` | Rejects e-mail addresses, 8+ digit phone runs (Arabic-Indic digits normalised), and messenger/social invite links (wa.me, t.me, …) with `422 contact_not_allowed`. Used by every CMP message endpoint (help, inbox, groups) |
| R4 (topics) | `help.py` | `topic ∈ {religion, family, work_housing, money, feeling_low, other}` (research recommendation 13) |
| R5 (neutral push) | `app/companion/notify.py` | Account → `push.send_to_user`; guest → the device's own push endpoint, given at create time (`push_endpoint`), looked up in `push_subscriptions`. Text: `لديك رد جديد` / `You have a new reply` / `May bago kang sagot`, no body, no name, no reply text. Unread = mentor messages with `read_at IS NULL`, cleared when the learner opens the thread |
| R6 (danger) | `app/companion/events.py::on_danger` + `help.py` | `DangerDetected {ask_id, lang, detector}` (no identity, no text) → an *alert*: `kind=urgent`, no owner, `ask_id` kept, shown first in every mentor's and team member's inbox with `can_reply=false`; all mentors + team get a neutral push. When the device opens `kind=urgent` with `ask=<ask_id>`, it becomes the owner of that alert (same request, R6 ex3); without `ask` a new urgent request is created; an owner's second urgent request within 24 h returns the open one. Alerts nobody opened disappear from inboxes after 24 h. Body is optional for urgent requests (no question text is ever copied) |
| R6 (emergency guidance first) | `frontend/src/app/companion/HelpScreen.tsx` | `kind=urgent` renders `DangerHelpPanel` before anything else, with the generic "call your country's emergency number" line and **no** numbers button (open question) |

## 2. Endpoints

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| POST | `/api/help/requests` | anyone | body `{kind: human|escalation|urgent, source?, topic?, prefer_gender?: m|f, lang, body?, ask_id?, push_endpoint?}` → `{request, guest_token?}`. Rate limit 10/h per owner/IP |
| GET | `/api/help/requests` | owner | my threads: kind, topic, status, last message preview, unread |
| GET | `/api/help/requests/{id}` | owner | thread; marks mentor messages read |
| POST | `/api/help/requests/{id}/messages` | owner | reopens a closed request (CMP-02 R4) |
| POST | `/api/help/claim` | account + token | guest → account |
| POST | `/api/help/requests/{id}/block` | owner | CMP-04 R5: block the mentor who answered |

Owner = signed-in learner (`learner_id`) or the holder of the guest token (`X-Help-Token`).

## 3. Data (`app/companion/models.py`, migration `cmp_01_05_*`)

`cmp_help_requests` gains `source`, `prefer_gender`, `ask_id`, `first_reply_at`, `push_endpoint`. `cmp_help_messages` gains `hidden`. Kinds: `human | escalation | urgent | mentor`. Status: `open` (waiting for a human) · `answered` (a human wrote last) · `closed`.

## 4. Real-time

Polling with TanStack Query: 10 s while a thread is open, 30 s for lists, paused in background tabs. Reason: help is asynchronous (minutes to hours), one backend instance, no WebSocket path in the nginx router, and polling survives flaky mobile networks without reconnect logic. Push covers the "not looking" case.

## 5. Tests (`backend/tests/test_cmp01_help.py`, `frontend/src/app/companion/companion.test.tsx`)

| Example | Test |
| --- | --- |
| R1 ex1 lesson source, nothing else | `test_cmp01_r1_request_from_lesson_keeps_only_the_source` |
| R2 ex1 guest gets a token and sees the reply | `test_cmp01_r2_guest_request_returns_token_and_sees_reply` |
| R2 ex2 other device sees nothing | `test_cmp01_r2_other_device_cannot_open_guest_request` |
| R2 ex3 guest → account | `test_cmp01_r2_guest_requests_move_to_new_account` |
| R5 ex1 phone rejected (was R3) | `test_cmp01_r5_contact_details_are_not_sent` |
| R4 ex1 topic reaches the responder | `test_cmp01_r4_topic_is_shown_to_responder` |
| R6 ex1 neutral push (was R5) | `test_cmp01_r6_reply_push_is_neutral` |
| R6 ex2 unread without push (was R5) | `test_cmp01_r6_unread_reply_shows_in_threads` |
| Danger (was R6 ex1; now `danger-handling.md`) event → urgent first + push | `test_cmp_danger.py::test_cmp_danger_event_creates_urgent_alert_first_in_every_inbox` |
| Danger (was R6 ex2) no question text | `test_cmp_danger.py::test_cmp_danger_urgent_request_carries_no_question_text` |
| Danger (was R6 ex3) same request, not a second | `test_cmp_danger.py::test_cmp_danger_opening_urgent_reuses_the_alert` |
| R6 ex4 emergency guidance first, no invented numbers | `cmp01_r6_urgent_screen_shows_emergency_guidance_first` (vitest) |

## Rewrite (PR #21, 2026-10-06)

Danger left CMP-01 (still in the companion domain: README fixed rule). Rules renumbered: R1 source only (+ the assistant question only if chosen), R2 guest device, R3 same gender, R4 topics, R5 no contact details, R6 neutral notice.

| Rule | Change |
| --- | --- |
| R1 ex2 | `HelpScreen.tsx`: «أرفق سؤالي للمساعد», off by default, only when the ask turn is still in memory (`questionOf`); ticked → the question goes inside the person's own message (`composeHelpBody`) |
| R3 | `RequestIn.gender` replaces `prefer_gender`; stored as `requester_gender` (same column). Account gender wins; a guest's earlier answer on the same token is reused; none → `422 gender_required`. Urgent requests ask nothing. `ThreadSummary` gains `gender` and `awaiting_same_gender` (no same-gender responder free in that language) |
| R3 ex3 | `common.py::same_gender_available`; the thread and the list say «ستردّ عليك أخت حين تتاح» |
| R6 | Scholar answers count as replies (unread, neutral push) |

Tests: `backend/tests/test_cmp01_help.py` (R1–R6), `test_cmp_danger.py` (danger, incl. first-available across genders), vitest `companion.rules.test.tsx` (`cmp01_*`, `cmp_danger_*`).

## Audit gaps (branch `cmp-audit-gaps`, 2026-10-06)

Danger handling now has its own factual note: `danger-handling.md`.

| Rule | Change |
| --- | --- |
| R1 | `HumanHelpButton compact` on the lesson and review headers: below 380px it is a 44px icon with the label kept for screen readers (it used to be hidden below 380px) |
| R2 ex3 | `lib/sync.ts::onSignedIn` (called by sign-up, sign-in and 2FA sign-in) calls `claimGuestRequests`; opening «مرشدي» still does too |
| R5 | `text.py::contact_violation` returns `email`, `link`, `handle` or `phone`: e-mails with spaces or «at/dot», any URL or bare domain (x.com, linkedin, threads, kik, lnkd.in…), a network name with a handle («snap: …», «سناب …», «@handle»), phone numbers with separators and 7-digit local numbers with a separator. Quran references (`2:255`, `255-257`), dates, times and lists of verse numbers pass. The client words a refused handle with `cmp.gaps.err.handle` |
| Open question «أخت بكل لغة» | `GET /api/team/coverage` (team/admin, `coverage.py`): per language × gender, how many can answer and how many take requests now, plus responders without a gender. Shown on the team screen (`ResponderCoverage`) with uncovered slots marked |
| Security | A mentor's or team member's gender, once set, changes only by an admin (`PUT /api/admin/users/{id}/gender`, Admin screen); `PUT /api/mentors/me/match` and `PATCH /api/me` answer `403 gender_locked`. Mentors and team members set it once in the account settings (`Account.tsx::ResponderGender`) |

Tests: `backend/tests/test_cmp_audit_gaps.py`, vitest `companion/cmp-audit-gaps.test.tsx`.
