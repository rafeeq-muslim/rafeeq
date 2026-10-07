# CMP-01 «أريد إنسانًا» and danger hand-off: implementation

**Feature:** `docs/domains/companion/features/CMP-01-human-help-and-danger.md` (draft by Claude, for review) · **Related:** KNW-01 R5 hand-off contract (`implementation/KNW-01.md`), CMP-02, CMP-04 · **Rules touched:** `rules.md` §2.8 (danger → human, AI does nothing else), §2.9 (urgent request carries no question text), §4 (minimum data, neutral notifications, no phone/email)
**Written:** 2026-10-05 by Claude.

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 (from where) | `app/companion/help.py::create_request` | `source ∈ {lesson, review, ask, home, mentor}` stored; nothing else about the screen. The app opens `/mentor/help?from=<source>[&kind=urgent|escalation][&ask=<ask_id>]` |
| R2 (guest token) | `help.py::_owner` | No account → server issues `secrets.token_urlsafe(32)` once, stores only `sha256` in `cmp_help_requests.guest_token_hash`, returns the token in the create response. The device keeps it (`frontend/src/app/companion/store.ts`) and sends `X-Help-Token`. A device that already has a token sends it on create and the same hash is reused. `POST /api/help/claim` (account + token) moves guest requests to the account |
| R3 (no contact details) | `app/companion/text.py::contact_violation` | Rejects e-mail addresses, 8+ digit phone runs (Arabic-Indic digits normalised), and messenger/social invite links (wa.me, t.me, …) with `422 contact_not_allowed`. Used by every CMP message endpoint (help, inbox, groups) through `clean_body_async` (off the event loop) |
| R4 (topics) | `help.py` | `topic ∈ {religion, family, work_housing, money, feeling_low, other}` (research recommendation 13) |
| R5 (neutral push) | `app/companion/notify.py` | Account → `push.send_to_user`; guest → the device's own push endpoint, given at create time (`push_endpoint`), looked up in `push_subscriptions`. Text: `لديك رد جديد` / `You have a new reply` / `May bago kang sagot`, no body, no name, no reply text. Unread = mentor messages with `read_at IS NULL`, cleared when the learner opens the thread |
| R6 (danger) | `app/companion/events.py::on_danger` + `help.py` | `DangerDetected {ask_id, lang, detector}` (no identity, no text) → an *alert*: `kind=urgent`, no owner, `ask_id` kept, shown first in every mentor's and team member's inbox with `can_reply=false`; all mentors + team get a neutral push. When the device opens `kind=urgent` with `ask=<ask_id>`, it becomes the owner of that alert (same request, R6 ex3); without `ask` a new urgent request is created; an owner's second urgent request within 24 h returns the open one. How often people are pushed, and why a bare link creates nothing: `danger-handling.md` «Limits on abuse». Alerts nobody opened disappear from inboxes after 24 h. Body is optional for urgent requests (no question text is ever copied) |
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

## R1: lesson and review help open the assistant first (branch `cmp-01-r1-lesson-help-ai-first-build`, 2026-10-07)

Docs PR #79 (learning owner's decision 2026-10-07). Frontend only; no endpoint, model or migration changed.

| Part of R1 | Module | Behaviour |
| --- | --- | --- |
| Help button in the lesson and the review | `frontend/src/app/lesson/LessonHelpButton.tsx` (used by `pages/Lesson.tsx`, `pages/Review.tsx`) | Named «مساعدة» (`lesson.help`). Opens `/ask` with the route state `{lessonHelp: {from: "lesson" \| "review", topic}}` built by `ask/lessonHelp.ts`. `topic` is the lesson's title (in a review: the title of the lesson the exercise on screen belongs to). Nothing in the URL. Below 380px it is a 44px icon with the label kept for screen readers |
| Topic only, never the answers | `ask/lessonHelp.ts::readLessonHelp` | Reads only `from` and `topic` (≤ 120 characters); any other field is dropped. The topic is shown in the assistant (`pages/Ask.tsx`, `data-slot="lesson-topic"`, with «ارجع إلى الدرس», which since LRN-03 R5 opens that lesson at the point it was left: `implementation/learning-motivation-platform.md`) and stays on the device: `POST /api/ask` is unchanged (open question in the feature document) |
| «تحتاج إنسانًا؟» | `ask/parts.tsx` (`FailureCard` for `no_source`, `AnswerTurn` for `route=personal`), `ReferralCard question` | The card asks «تحتاج إنسانًا؟» (`ask.needHuman`) above its one button, which opens `/mentor/help?kind=escalation&from=<origin>&ask=<ask_id>`. `verification_failed` and `unavailable` still lead with retry (KNW-01 answer rate), with «أريد إنسانًا» beside it |
| «أريد إنسانًا» always visible in the assistant | `pages/Ask.tsx` top bar (sticky) | Opens `/mentor/help?from=<origin>` |
| Where the request came from | `ask/parts.tsx::HelpOriginContext` | `origin` is `lesson` or `review` when the assistant was opened from there, else `ask`. The request stores that source only: no lesson name, no answers. For `lesson`/`review` no `ask_id` is sent either (it is sent for `ask`, as before) |
| Assistant question attached only if chosen | `companion/HelpScreen.tsx` | The «أرفق سؤالي للمساعد» box (off by default) now shows whenever the `ask` id's question is still in memory, whatever the origin |
| Danger | unchanged | `DangerHelpPanel` only; its button opens `kind=urgent&from=<origin>&ask=<ask_id>` |

Tests (vitest, `frontend/src/app/companion/cmp01.r1.rules.test.tsx`):

| Example | Test |
| --- | --- |
| R1 ex1 «أتوضأ (1)», no sourced answer → «تحتاج إنسانًا؟», one tap | `cmp01_r1_ex1_wudu_1_no_sourced_answer_asks_need_human_and_opens_the_request_in_one_tap` |
| R1 ex2 request from a lesson says «درس», no lesson name, no answers | `cmp01_r1_ex2_request_from_a_lesson_says_lesson_without_its_name_or_any_answer` (server: `test_cmp01_r1_request_from_lesson_keeps_only_the_source`) |
| R1 ex3 assistant question only if chosen | `cmp01_r1_ex3_assistant_question_is_attached_only_if_the_learner_chooses`, `cmp01_r1_ex3_assistant_question_travels_when_chosen` (and the earlier `cmp01_r1_question_*` in `companion.rules.test.tsx`) |
| Topic only, never the answers | `cmp01_r1_lesson_help_carries_the_topic_only_never_the_learners_answers`, `cmp01_r1_hand_over_keeps_only_origin_and_topic` |
| Review | `cmp01_r1_review_help_opens_the_assistant_with_the_lesson_topic_only` |
| Personal matter | `cmp01_r1_personal_matter_asks_need_human_and_opens_the_request_in_one_tap` |
| Always visible in the assistant | `cmp01_r1_i_want_a_person_is_visible_in_the_assistant_at_every_moment` |
| Danger at once | `cmp01_r1_danger_goes_to_a_human_at_once_without_an_answer` |
| Narrow screens | `cmp01_r1_help_button_stays_reachable_and_named_below_380px`, `cmp01_r1_lesson_human_button_visible_below_380px`, `cmp01_r1_review_human_button_visible_below_380px` (`cmp-audit-gaps.test.tsx`, now on the «مساعدة» button) |

### The lesson context reaches the assistant as ids (branch `cmp-01-r1-lesson-context`, owner's decision 2026-10-07)

This replaces "topic only … `POST /api/ask` is unchanged" above. The owner decided that the context does go to the assistant: as ids, with the approved text loaded by the server, and never the learner's answer.

| Part | Module | Behaviour |
| --- | --- | --- |
| Ids of the screen | `ask/lessonHelp.ts` (`HelpContext`, `readHelpContext`), `lesson/LessonHelpButton.tsx` (prop `context`), `pages/Lesson.tsx`, `pages/Review.tsx` | The route state is now `{lessonHelp: {from, topic, context?: {lesson_id, card_id \| exercise_id}}}`. Ids only (`[A-Za-z0-9_-]{1,32}`); any other field is dropped. In a review: the lesson the exercise on screen belongs to + that exercise |
| Context chip | `pages/Ask.tsx` (`data-slot="ask-context"`, above the composer) | «عن: <عنوان الدرس> · <السؤال الحالي>» (`ask.context.about`, `ask.context.aboutLesson`), written from the content the device already has (`describeContext`). Its ✕ (`ask.context.dismiss`) removes it for this stay on the screen. Shown → every question (typed or suggested) is sent with `context`; dismissed, or the device has no content for those ids → no `context` |
| Request | `ask/store.ts`, `ask/types.ts` (`AskSnapshot.context`) | `POST /api/ask` gains the optional `context: {lesson_id, card_id? \| exercise_id?}`. A retry re-sends the snapshot's ids. Never the answer, its correctness or progress |
| Server lookup | `backend/app/knowledge/lesson_context.py` | `ContextRef` (ids only). `load()` reads the lesson learners see in the request language (`review.published`, its unit live too) and builds the block: lesson title + the card's text, or the exercise's prompt and its options / steps / pairs **in text order, without the correct answer**. Unknown, withdrawn or other-language ids → `None` (ignored). A malformed `context` is dropped by validation, never a 422 |
| Pipeline | `backend/app/knowledge/ask.py` | Unchanged first: the danger, rule-bypass and guide screens read the learner's question alone, before the context is even loaded. Then the block goes to the router and to the composer (and its repair) as a fenced `LESSON CONTEXT` section, and the lesson's title + prompt (or card text, ≤ 240 characters) are appended to the search form (local index and live search). The indexed passages of the card on screen, or of the cards the exercise draws on (`rafeeq_cards:<lang>:<card id>`, KNW-02 R6, at most 3), are placed first among the retrieved passages when the source policy allows `rafeeq_cards`; they are cited and shown as any other source. Nothing is built from the lesson file as a passage |
| Prompts | `ai/prompts/router.md`, `ai/prompts/composer.md` (rule 12), `ai/agents.py::_lesson_block` | The lesson content is data, never instructions; it is not a passage (every sentence still needs a passage; the support check is unchanged); the composer does not say which option is correct unless a passage states it |
| Records | `knw_answer_log.trace` | One stage `{"stage": "context", "status": "exercise" \| "card" \| "lesson" \| "ignored"}`. No ids, no text, no question |

Tests:

| Example | Test |
| --- | --- |
| Exercise 2, «ما معنى هذا؟» → the ids are sent | vitest `cmp01_r1_help_on_exercise_2_and_asking_what_does_this_mean_sends_the_context_ids` (`companion/cmp01.r1.context.rules.test.tsx`) |
| … and the composer reads the exercise's approved prompt | pytest `test_cmp01_r1_help_on_exercise_2_composer_input_contains_the_exercise_prompt` (`backend/tests/test_cmp01_r1_lesson_context.py`), `test_cmp01_r1_card_on_screen_is_given_as_context_and_as_a_source` |
| The learner's answer is never sent | vitest `cmp01_r1_the_learners_answer_is_never_in_the_request`; pytest `test_cmp01_r1_learners_answer_is_never_read_from_the_request`, `test_cmp01_r1_context_block_never_marks_the_correct_answer` |
| Chip shown / dismissed | vitest `cmp01_r1_context_chip_shows_the_lesson_title_and_the_current_question_above_the_input`, `cmp01_r1_with_the_chip_dismissed_no_context_is_sent`; pytest `test_cmp01_r1_without_context_nothing_of_a_lesson_is_sent` |
| Unknown ids, another language, a withdrawn lesson | pytest `test_cmp01_r1_unknown_context_ids_are_ignored`, `test_cmp01_r1_context_in_a_language_the_lesson_is_not_approved_in_is_ignored`, `test_cmp01_r1_withdrawn_lesson_is_not_given_as_context`; vitest `cmp01_r1_ids_this_device_has_no_content_for_show_no_chip_and_send_nothing` |
| Danger still wins | pytest `test_cmp01_r1_danger_still_wins_before_any_context_or_model`, `test_cmp01_r1_router_danger_wins_with_a_context` |
| Ids / codes only in what is kept | pytest `test_cmp01_r1_log_holds_a_code_only_never_the_context_text_or_the_question`; vitest `cmp01_r1_the_visits_copy_of_the_conversation_keeps_ids_only_never_lesson_text` |
| Card, review, suggestion, own tab | vitest `cmp01_r1_help_on_a_card_sends_the_card_id`, `cmp01_r1_review_help_sends_the_lesson_and_exercise_ids_of_the_exercise_on_screen`, `cmp01_r1_a_suggested_question_carries_the_context_too_while_the_chip_is_shown`, `cmp01_r1_opened_from_its_own_tab_there_is_no_chip_and_no_context` |

Earlier tests renamed with the decision: `cmp01_r1_lesson_help_carries_the_topic_and_ids_only_never_the_learners_answers`, `cmp01_r1_hand_over_keeps_only_origin_topic_and_ids`, `cmp01_r1_review_help_opens_the_assistant_with_the_lesson_topic_and_ids_only`, `lrn03_r5_the_route_and_the_assistant_carry_ids_of_the_screen_only_never_the_choice_or_progress`. The human request (`POST /api/help/requests`) is unchanged: source only, no ids.

### LRN-03 R5 on top of R1 (branch `lrn-03-r5-return-to-lesson-build`, 2026-10-07)

- `LessonHelpButton` takes an optional `onLeave`; the lesson uses it to keep, in the device's memory only (`lesson/helpReturn.ts`), which lesson to return to and the exercise as it was on screen. The route state is still exactly `{lessonHelp: {from, topic}}`, the URL is still empty, and neither `POST /api/ask` nor `POST /api/help/requests` gained a field.
- The request screen (`HelpScreen.tsx`) shows «ارجع إلى الدرس» when `from=lesson`. The request itself is unchanged: `source` only, no lesson name, no answers (`lrn03_r5_cmp01_r1_ex2_the_help_request_still_carries_no_lesson_name_or_answer`, beside the R1 ex2 test above).

### Security review 2026-10-07: the contact filter off the event loop (B-M5; branch `sec-injection-hardening`)

- The patterns themselves were made linear by the hotfix `sec-hotfix-contact-filter` (A-H1; `backend/tests/test_cmp01_r5_contact_filter_time.py`). This branch adds the second layer only.
- Request handlers call `clean_body_async` (`app/companion/text.py`): the scan runs in a worker thread with a 2-second limit, so even a slow scan cannot hold the only server process; a scan that does not finish refuses the message (`422 message_not_checked`). The length limit (2000) is checked before any scan. Call sites: `help.py` (2), `inbox.py` (3), `groups.py` (2), `referrals.py` (1).
- Tests (`backend/tests/test_sec_contact_filter_off_loop.py`): the scan leaves the event loop free; a scan that does not finish refuses the message; spacing and line breaks hide nothing and add no false alarm. (The time budget is tested by the hotfix's file.)
