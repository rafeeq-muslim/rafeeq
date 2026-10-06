# Implementation map: Learning, Motivation, Platform, KNW-05

Rule → where it lives → the test that proves it. Written before each feature was coded (PRD → plan → code → tests), kept current with the code. Backend tests in `backend/tests/`, client tests next to the module (`*.test.ts`).

## PLT-02 optional account

Updated for the PR #25 documents in `PLT-02.md` (and PLT-01, 03, 05, 06, 07 in their own files).

| Rule | Code | Tests |
| --- | --- | --- |
| R1 no account needed | guest-first stores (`frontend/src/app/stores/*`), offer on Home after the first lesson and in Me | `test_plt02_r1_guest_needs_no_account` |
| R2 three fields | `RegisterIn` in `backend/app/platform/auth.py`; `Account.tsx` | `test_plt02_r2_only_three_fields` |
| R3 generate any field; taken name → suggestions | `GET /api/auth/suggest`, 409 `username_taken` | `test_plt02_r3_*` |
| R4 data promise | `acct.promise` shown beside the form | UI |
| R5 display name only is public | `MeOut` vs public views | `test_plt02_r5_only_display_name_is_public` |
| R6 optional email 2FA | `/api/me/2fa/*`, `/api/auth/login/2fa` | `test_plt02_r6_wrong_2fa_code_is_rejected`, `test_plt02_2fa_reports_missing_email_provider` |
| Sync after sign-in | `PUT /api/me/learning`, `PUT /api/me/motivation`, `frontend/src/app/lib/sync.ts` | `test_lrn02_device_and_account_progress_are_united`, `test_mot02_larger_set_of_days_wins`, `test_mot03_badge_is_kept_once_with_the_earliest_date` |

## LRN-01 R6 / KNW-05 content review

| Rule | Code | Tests |
| --- | --- | --- |
| R1 only approved text is shown; approval emits `ContentApproved` | `backend/app/knowledge/review.py` (registry, desk API), `backend/app/learning/content.py` (`build_content`) | `test_knw05_r1_*` |
| R2 citation beside the stored source | `ReviewDesk.tsx` renders each verse with `VerseBlock` from `/api/scripture/quran`, and each cited hadith (team unit cards' `hadith_ids`, HadeethEnc ids) from the stored record with its grade and reference (`hadith` per language in `GET /api/review/items/…`, `DeskCitations.tsx`) | `test_knw05_r2_reviewer_sees_the_cited_hadith_text_grade_and_reference_from_the_record`; vitest `DeskCitations.test.tsx` |
| R2 ex2 a citation to an unknown id is refused | `content/check_content.py` refuses a Quran reference to a verse that does not exist and a `hadith_ids` entry not in the stored HadeethEnc corpus (`$RAFEEQ_DATA_DIR/corpus/hadeethenc.jsonl`; without the corpus it warns that ids were not checked). The same check covers the content outside the team units (`check_content.py --learner-content`, a CI step): each pipeline lesson card's `quran` {sura, ayat} in `content/lessons/*.json`; each `quran_excerpts.json` ref (exists, is the verse its card shows, and `verse_words` equals the stored Arabic verse's word count, `$RAFEEQ_DATA_DIR/corpus/quranenc.jsonl`); each `quran_recitation.json` ref (one verse that exists and that its cards show); each `discover/daily-cards.json` `hadith_id` in the HadeethEnc corpus. Verse ranges use the static ayah-count table and always run; the corpus parts warn and are skipped when the corpus is absent (CI) | `test_knw05_r2_content_check_refuses_an_unknown_ayah`, `…_refuses_a_hadith_id_missing_from_the_record`, `…_shipped_unit_has_no_unknown_citation`, `…_refuses_a_lesson_card_with_an_unknown_ayah`, `…_learner_content_check_refuses_a_wrong_excerpt_recitation_or_daily_hadith`, `…_refuses_excerpt_words_that_do_not_match_the_stored_verse`, `…_without_the_corpus_still_checks_verse_ranges`, `…_shipped_lessons_and_learner_content_have_no_unknown_citation`, `…_shipped_learner_content_matches_the_stored_corpus` (skipped without the corpus) |
| R3 approval bound to the exact version; old approved text stays visible after an edit | `ContentApproval.snapshot`, hash check (409) | `test_knw05_r3_*` |
| R4 return needs a written reason the writer sees | `decide()` | `test_knw05_r4_*` |
| R5 only the Sharia reviewer decides | `decide()` checks `sharia_reviewer` | `test_knw05_r5_*` |
| R6 per language | one row per item and language | `test_knw05_r6_*` |
| Team preview | `GET /api/content?preview=true` | `test_lrn01_preview_is_for_team_only` |

## LRN-02 path, LRN-03 lesson, LRN-04 review, LRN-05 placement, LRN-10 mastery

| Rule | Code | Tests |
| --- | --- | --- |
| LRN-02 R1–R3 states and one next step | `frontend/src/app/learning/path.ts`, `Learn.tsx`, `Home.tsx` | path helpers |
| LRN-03 R1 cards then exercises | `learning/session.ts` `current()` | `session.test.ts` R1 |
| LRN-03 R2 three exercise types | `lesson/Exercises.tsx` | `session.test.ts` checks |
| LRN-03 R3 safe mistakes, exercise returns | `answer()` re-queues | `session.test.ts` R3 |
| LRN-03 R4 complete when all right | `isComplete()`, `learning/complete.ts` | `session.test.ts` R4 |
| LRN-03 R5 resume; choose after 24 h; offline | `needsResumeChoice()`, persisted sessions, SW NetworkFirst for content | `session.test.ts` R5 |
| LRN-03 R5 back from help at the same point (docs PR #82) | `lesson/helpReturn.ts`, `pages/Lesson.tsx`, `lesson/LessonHelpButton.tsx`, `pages/Ask.tsx`, `companion/HelpScreen.tsx`; see «LRN-03 R5: back from help» below | `pages/Lesson.r5.rules.test.tsx` |
| LRN-03 R6 «لماذا؟» | `lesson/why.ts` → `/api/learning/explain` (Knowledge) | KNW-10 tests |
| LRN-04 R1–R6 adaptive review | `learning/review.ts`, `reviewItems.ts`, `pages/Review.tsx` | review helpers |
| LRN-05 R1–R6 placement | `learning/placement.ts`, `pages/Placement.tsx` | `placement.test.ts` |
| LRN-10 BKT and first answers | `learning/bkt.ts`, `learning/answers.ts` | bkt helpers |

## LRN-03 R5: back from help (branch `lrn-03-r5-return-to-lesson-build`, 2026-10-07)

Docs PR #82 (learning owner's decision 2026-10-07), on top of CMP-01 R1 (PR #79/#86). Frontend only; no endpoint, model or migration changed.

| Part of R5 | Module | Behaviour |
| --- | --- | --- |
| Same card or exercise, remaining exercises | `stores/learning.ts` `sessions` (already persisted on the device) | Unchanged: the card index and the exercise queue were already saved at every step, so the lesson reopens on them |
| The choice not yet checked | `lesson/helpReturn.ts`, `pages/Lesson.tsx` | The lesson's help button calls `holdLessonForHelp(lessonId, {exerciseId, value, round, result})` before leaving. Opening that lesson again reads it once (`heldDraft`) and restores the choice, the option order (`round`) and, if the answer had already been checked, its result panel (so it is the same exercise, not the next one). An unchecked choice is restored only onto the exercise the session is on; a session old enough to ask continue-or-restart (24 h) restores nothing |
| Where it is held, and until when | `lesson/helpReturn.ts` | One module variable in memory. Never the URL, the route state, `localStorage`/`sessionStorage`, `POST /api/ask` or the help request. Dropped when any lesson is opened (`dropLessonHelpReturn` on the player's mount), when the assistant is opened from its own tab (no lesson origin), and with the page (reload, app closed) |
| «ارجع إلى الدرس» in the assistant | `pages/Ask.tsx` (`data-slot="back-to-lesson"` in the topic line) | Shown when the route state says `from: "lesson"`. Goes to `/learn/lesson/{id}` through the router (basename `/app`), replacing the assistant's entry; if the device no longer knows the lesson (reload), one step back as before. The Arabic text of `ask.lesson.back` is now the document's «ارجع إلى الدرس». A review keeps «عُد إلى المراجعة» and `navigate(-1)` |
| «ارجع إلى الدرس» in the human request | `companion/HelpScreen.tsx::BackToLesson` | Shown when `from=lesson`. Goes to `/learn/lesson/{id}`; if the device no longer knows the lesson, to `/learn` (the path) |

Not built (open questions in the feature document): the button on the conversation screen after the request is sent; keeping the choice across a reload; the same for a review (LRN-04).

Tests (vitest, `frontend/src/app/pages/Lesson.r5.rules.test.tsx`):

| Example | Test |
| --- | --- |
| R5 ex1 help on exercise 2, asks the assistant, «ارجع إلى الدرس» → exercise 2, choice kept, not checked, rest unchanged | `lrn03_r5_ex1_help_on_exercise_2_then_back_to_the_lesson_resumes_exercise_2_with_the_choice_kept` |
| R5 ex1 the same through the human request | `lrn03_r5_ex1_help_on_exercise_2_then_back_from_the_human_request_resumes_exercise_2_with_the_choice_kept` |
| R5 ex1 the same with the browser's back | `lrn03_r5_ex1_the_browsers_own_back_from_the_assistant_resumes_exercise_2_with_the_choice_kept` |
| R5 ex1 «أو يعود بعد ثلاث ساعات» | `lrn03_r5_ex1_back_after_three_hours_resumes_exercise_2_without_asking` (and `session.test.ts` R5) |
| R5 ex2 two days → continue or restart | `lrn03_r5_ex2_two_days_later_the_lesson_asks_and_an_old_choice_is_not_brought_back` (and `session.test.ts` R5) |
| R5 ex3 offline completion | `lrn03_r5_ex3_offline_the_lesson_completes_and_its_completion_is_sent_when_the_connection_returns` (and `lib/sync.plt15.test.ts`) |
| Same card | `lrn03_r5_help_on_a_card_then_back_lands_on_the_same_card` |
| Help after a checked answer | `lrn03_r5_help_after_a_checked_answer_then_back_shows_the_same_exercise_and_its_result` |
| Button shown from a lesson | `lrn03_r5_back_to_the_lesson_is_shown_in_the_assistant_when_coming_from_a_lesson`, `lrn03_r5_back_to_the_lesson_is_shown_in_the_human_request_when_coming_from_a_lesson` |
| Button absent otherwise | `lrn03_r5_back_to_the_lesson_is_absent_when_the_assistant_is_opened_from_its_tab`, `lrn03_r5_back_to_the_lesson_is_absent_in_a_human_request_not_made_from_a_lesson`, `lrn03_r5_a_review_keeps_its_own_way_back_and_never_says_lesson` |
| Lesson forgotten (reload) | `lrn03_r5_back_to_the_lesson_still_leads_somewhere_when_the_device_forgot_which_lesson` |
| Nothing leaves the device (CMP-01 R1 ex2) | `lrn03_r5_the_route_and_the_assistant_carry_no_lesson_id_choice_or_progress`, `lrn03_r5_cmp01_r1_ex2_the_help_request_still_carries_no_lesson_name_or_answer`, `lrn03_r5_nothing_is_written_to_storage_for_the_return` |
| Kept only as long as needed | `lrn03_r5_the_kept_choice_is_dropped_once_the_lesson_is_open_again`, `lrn03_r5_the_kept_choice_is_dropped_when_the_assistant_is_opened_from_its_tab` |

## Motivation

| Rule | Code | Tests |
| --- | --- | --- |
| MOT-02 forgiving streak | `motivation/streak.ts`, `stores/motivation.ts` | streak helpers, `test_mot02_*` |
| MOT-03 badges once (unit, 7/30/66 days) | `complete.ts`, `stores/motivation.ts` `earn()` | `test_mot03_*` |
| MOT-05 R1–R5 gentle reminder | `backend/app/platform/push.py` (`due()`, `run_reminders`), `push_jobs.py`, `frontend/src/app/lib/push.ts`, `/next` | `test_mot05_*` |
| MOT-07 R1–R4 status | `backend/app/motivation/engagement.py`, `router.py`, `jobs.py` | `test_mot07_*` |
| MOT-07 R5 the learner never sees a status | nothing in the learner UI reads it | — |
| MOT-07 R6 mentor sees it only with permission | Companion (CMP-02) | CMP tests |
| MOT-07 R2/R6 one status per account | `engagement.account_timeline` (earliest first lesson, latest interaction, a return only if the whole account was lapsed); `router.publish_account_status` / `jobs.refresh_and_snapshot`. `EngagementStatusChanged` has two subjects: device `{install_id, status}` for ORG (links are per device, ORG never learns the account) and account `{user_id, status}` for CMP, sent only when the account status changes (last sent value read from the outbox; no migration). A device opt-out removes only that device; the account's status is None when no device is left. `POST /api/me/install` keeps a device that signs in before its first lesson; the app links only devices that share events (`sync.ts`) | `test_mot07_account_status.py`, `lib/mot07.link.test.ts` |
| MOT-08 R1–R6 | `backend/app/motivation/indicators.py`, `pages/roles/Team.tsx` | `test_mot08_*` |
| MOT-09 R1–R6 | `indicators.understanding()`, events from `answers.ts`, `why.ts`, `Placement.tsx` | `test_mot09_*` |
| MOT-09 R6 on placement and R5 | `indicators.placement_figures()`: each device counts once by its last outcome (done or skipped); under 10 people in all hides everything; a bucket under 10 is hidden, with complementary suppression (as ORG-03) so it cannot be worked out from the others; events unlinked by an opt-out are left out. `guide_followed` and `quick_check_correct` stay rates over messages and answers, but need 10 distinct devices. Team page shows «لا تكفي البيانات بعد» (`team.notEnough`) in place of each hidden figure | `test_mot09_r6_placement.py`, `Team.placement.test.tsx` |
| Security review 2026-10-07 A-H5: anonymous events and the event history | `POST /api/events`: at most 100 events per request (`EVENTS_PER_REQUEST`; the app sends its queue in batches, `lib/api.ts EVENT_BATCH`; an older app with more than 100 queued events gets 422 once and drops that batch, as it always did on 422); stored events are counted, 300 a minute per device and 600 a minute per address, on top of the request limits; an opt-out is never held back by the event count. Lookups in `outbox` by device or account use two expression indexes (revision `f9a0b1c2d3e4`; `core/events.py::payload_text` writes the key inline so the planner matches them). Retention, both nightly: `motivation/jobs.py::purge_old_anon_events` removes anonymous events older than 90 days (the indicators read 7 or 30 days; statuses and frozen snapshots are untouched); `core/retention.py::purge_old_events` removes outbox rows older than 90 days except the latest `EngagementStatusChanged` per account, which `published_account_statuses` reads however old it is (`MentorContacted` is read for 30 days) | `test_sec_a_h5_events.py`, `lib/api.events.test.ts` |
