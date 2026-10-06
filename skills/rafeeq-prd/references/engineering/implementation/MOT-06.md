# MOT-06 weekly group challenge: implementation

**Feature:** `docs/domains/motivation/features/MOT-06-weekly-group-challenge.md` · **Related:** CMP-05 (groups and membership events), MOT-02 (learning day), MOT-07 R6 (permission) · **Rules touched:** `rules.md` §3 (no points, no individual ranking, cooperation shown as counts; worship never rewarded)
**Written:** 2026-10-05 by Claude.

## 1. Rules → modules (`app/motivation/challenges.py`)

| Rule | Behaviour |
| --- | --- |
| Membership (definitions) | Subscribes to `GroupCreated` (mentor row, `is_mentor=true`), `GroupJoined`, `GroupLeft` → `mot_group_members`, Motivation's own copy (the open question's proposed names, now agreed by the CMP side) |
| Learning interactions | `POST /api/me/learning-log {entries:[{kind: lesson|unit|day, item_id, at, is_repeat}]}`. Stored **only** for accounts that are members of a group (minimum data); deduplicated on `(user, kind, item_id, at)` (day: `(user, day)`); device clock trusted within 30 days. The device bridge `frontend/src/app/companion/learningLog.ts` listens to the learning and motivation stores (lesson completions incl. repeats, unit badges, learning days incl. review days) and posts while signed in and in a group |
| R1 (one at a time, 7 days, six types) | `POST /api/groups/{id}/challenge` by that group's mentor. `409 challenge_running` while one is `pending_review` or `active` and not ended. Types: `lesson`, `unit`, `lessons_each`, `days_each` (1–7), `group_total`, `free_text` (text or `template_id`). `starts_at = now`, `ends_at = now + 7 d` when shown |
| R2 (auto from learning events only; nothing unlocked) | Counted from `mot_learning_log` rows with `starts_at ≤ at < ends_at`. Days = distinct device-local days. Nothing in the challenge touches path locks (LRN-02 stays on the device) |
| R3 (free text reviewed; worship rejected; templates) | Free text → `pending_review`, invisible to members. `GET /api/challenges/pending` and `POST /api/challenges/{id}/review {approve}` for `sharia_reviewer` (the P1 decision allows DB-only approval; the endpoint is the same state change). Approve → `active`, dates set, a `ChallengeTemplate` is created; reject → `rejected`, mentor gets a neutral push. A template is shown at once |
| R4 (count only, current members) | `GET /api/groups/{id}/challenge` → `{done, of}` over current members (`of` = target for `group_total`, capped display). Leavers drop out with their lessons. For the group mentor only: `shared_done` = user ids among the done members who share progress with **this** mentor, read live from `app/companion/public.py::shared_learner_ids` (never copied, so a withdrawn permission is never stale). Members also get `mine` (their own state) |
| R5 (end with encouragement) | `ended = now ≥ ends_at`; the last ended challenge stays visible with an encouraging line until a new one starts; no names |

## 2. Endpoints

`POST /api/me/learning-log` · `GET|POST|DELETE /api/groups/{id}/challenge` · `POST|DELETE /api/challenges/{id}/check` (free text, self-report) · `GET /api/challenges/templates?lang=` · `GET /api/challenges/pending` · `POST /api/challenges/{id}/review`.

## 3. Data

`mot_group_members.is_mentor` (new column). Existing `mot_challenges`, `mot_challenge_checks`, `mot_challenge_templates`, `mot_learning_log` (kinds `lesson | unit | day`).

## 4. Tests (`backend/tests/test_mot06_challenges.py`)

| Example | Test |
| --- | --- |
| R1 ex1 three lessons each, 7 days | `test_mot06_r1_mentor_sets_challenge_for_seven_days` |
| R1 ex2 second while running | `test_mot06_r1_second_challenge_while_running_is_refused` |
| R2 ex1 from where each is | `test_mot06_r2_lessons_each_counts_any_lessons_from_where_each_is` |
| R2 ex2 two lessons one day = one day | `test_mot06_r2_days_count_distinct_learning_days` |
| R2 ex3 nothing unlocked | `test_mot06_r2_lesson_challenge_unlocks_nothing` |
| R3 ex1 approved free text appears + template | `test_mot06_r3_approved_free_text_starts_and_becomes_template` |
| R3 ex2 worship rejected | `test_mot06_r3_rejected_free_text_is_never_shown` |
| R3 ex3 template reused at once | `test_mot06_r3_template_is_shown_immediately` |
| R4 ex1 «6 من 8» only | `test_mot06_r4_progress_is_a_count_without_names` |
| R4 ex2 leaver drops out | `test_mot06_r4_leaver_and_their_lessons_drop_out_of_total` |
| R4 ex3 mentor sees shared only | `test_mot06_r4_mentor_sees_only_members_who_share_with_him` |
| R5 ex1 end | `test_mot06_r5_ended_challenge_shows_result_without_names` |
| CMP-05 R6 ex1 | `test_cmp05_r6_group_page_challenge_shows_count_only` |
