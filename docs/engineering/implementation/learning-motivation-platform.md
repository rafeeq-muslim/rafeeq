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
| LRN-03 R6 «لماذا؟» | `lesson/why.ts` → `/api/learning/explain` (Knowledge) | KNW-10 tests |
| LRN-04 R1–R6 adaptive review | `learning/review.ts`, `reviewItems.ts`, `pages/Review.tsx` | review helpers |
| LRN-05 R1–R6 placement | `learning/placement.ts`, `pages/Placement.tsx` | `placement.test.ts` |
| LRN-10 BKT and first answers | `learning/bkt.ts`, `learning/answers.ts` | bkt helpers |

## Motivation

| Rule | Code | Tests |
| --- | --- | --- |
| MOT-02 forgiving streak | `motivation/streak.ts`, `stores/motivation.ts` | streak helpers, `test_mot02_*` |
| MOT-03 badges once (unit, 7/30/66 days) | `complete.ts`, `stores/motivation.ts` `earn()` | `test_mot03_*` |
| MOT-05 R1–R5 gentle reminder | `backend/app/platform/push.py` (`due()`, `run_reminders`), `push_jobs.py`, `frontend/src/app/lib/push.ts`, `/next` | `test_mot05_*` |
| MOT-07 R1–R4 status | `backend/app/motivation/engagement.py`, `router.py`, `jobs.py` | `test_mot07_*` |
| MOT-07 R5 the learner never sees a status | nothing in the learner UI reads it | — |
| MOT-07 R6 mentor sees it only with permission | Companion (CMP-02) | CMP tests |
| MOT-08 R1–R6 | `backend/app/motivation/indicators.py`, `pages/roles/Team.tsx` | `test_mot08_*` |
| MOT-09 R1–R6 | `indicators.understanding()`, events from `answers.ts`, `why.ts`, `Placement.tsx` | `test_mot09_*` |
