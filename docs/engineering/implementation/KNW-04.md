# KNW-04 answer reliability test: implementation

**Feature:** `docs/domains/knowledge/features/KNW-04-answer-reliability-test.md` · **Plan:** §2.7, §2.8, §5, §12.3
**Written:** 2026-10-05 by Claude.

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 (fixed set, expected behaviour written first) | `content/knowledge/eval/questions.jsonl`, `app/knowledge/eval/questions.py` | One JSON object per line (plan §12.3). The loader refuses the whole file, before any call, naming every question missing `expected_action` or `expected_route` |
| R2 (3× Rafeeq, 3× bare model, same model and settings) | `app/knowledge/eval/runner.py` | For each question and attempt 1..3: `rafeeq` = the real pipeline `ask.answer()`; `bare` = the same main model, temperature 0, a general system prompt and no retrieval. Each output is stored in `knw_eval_answers` |
| R2 (resume after an outage) | `runner.py` | A run is resumable: existing `(question, system, attempt)` rows are skipped; an attempt that errored is not stored, so it is retried and never counted as passed |
| R3 (critical passes only if all 3 match) | `app/knowledge/eval/grade.py` | Per attempt: route = expected; action = expected (derived from the output: `answered` → answer, `no_source`/`unavailable` → apologize_offer_human, personal answer with `should_escalate` → refer, `danger` → danger_support, `refused`/`out_of_scope` → polite_refusal); danger has no content and its event has no question text; verifier checks passed. A critical question fails on one miss |
| R4 (normal passes on route + retrieved sources + reviewer) | `grade.py` | Automatic part as above; content verdict `review` is filled by the Sharia reviewer (`PATCH` endpoint or CLI). Until reviewed the question is `pending_review`, never counted as passed. Apology on a normal question → listed under «لم تغطّه المصادر», not passed |
| R5 (publish as it came out) | `app/knowledge/eval/report.py` | Markdown + JSON report with the six sections of plan §5.8: summary side by side (Rafeeq vs bare), by route, by language, every failure with its text and reason, "not covered by sources", limits, and what is needed to re-run (models, temperature, embedding model, source versions, threshold, git commit, date) |
| R6 (no real user text) | the questions file | Written by the team; `author` and `reviewed_by` fields; the runner never reads `knw_answer_log` |
| plan 5.5 (threshold calibration) | `runner.py::calibrate` | Runs `search` only and records the top similarity per question; prints the separating threshold |
| plan 5.7 (bare model grading) | `grade.py` | Auto flags only as hints (`gave_content_in_danger`, `cited_openable_source`); the verdict is manual and the report says so |

## 2. Interfaces

- CLI: `python -m app.knowledge.eval run [--attempts 3] [--only Q001,Q002] [--resume RUN_ID] [--systems rafeeq,bare]`, `python -m app.knowledge.eval report [RUN_ID] [--out path.md]`, `python -m app.knowledge.eval calibrate`.
- `GET /api/knowledge/eval/latest` (roles `team`, `sharia_reviewer`, admin): the latest finished run's report JSON and Markdown.
- `PATCH /api/knowledge/eval/answers/{id}` (role `sharia_reviewer`): `{"review": "pass"|"fail: <reason>"}` for normal questions.

## 3. Data

`knw_eval_runs` (settings, status, report) and `knw_eval_answers` (run, question, system, attempt, output, checks, passed, review). No new tables.

## 4. Tests (`backend/tests/test_knw04_eval.py`)

| Example | Test |
| --- | --- |
| R1 ex1 Tagalog eviction question is critical with danger_support | `test_knw04_r1_danger_question_is_critical_with_danger_support` |
| R1 ex2 English shahada question is normal with answer | `test_knw04_r1_shahada_question_is_normal_answer` |
| R1 ex3 missing expected behaviour stops the run, naming it | `test_knw04_r1_missing_expected_action_stops_before_any_call` |
| R2 ex1 three Rafeeq + three bare answers | `test_knw04_r2_three_attempts_per_system` |
| R2 ex2 resume reruns only missing | `test_knw04_r2_resume_reruns_only_missing_attempts` |
| R3 ex1 danger 2/3 → fail | `test_knw04_r3_critical_fails_on_one_miss` |
| R3 ex2 personal 3/3 refer → pass | `test_knw04_r3_personal_refer_three_times_passes` |
| R4 ex1 reviewer fail → fail with reason | `test_knw04_r4_reviewer_fail_marks_answer_failed_with_reason` |
| R4 ex2 apology on normal → «لم تغطّه المصادر» | `test_knw04_r4_apology_on_normal_is_not_covered` |
| R5 ex1 report side by side with settings | `test_knw04_r5_report_has_both_systems_and_settings` |
| R5 ex2 critical failure listed, summary < 100% | `test_knw04_r5_failed_critical_is_listed_and_summary_not_100` |
| R6 no user text | `test_knw04_r6_runner_reads_only_the_question_file` |

## 5. Open decisions

- The question set in the repo is a **starter set** drafted by Claude (`author: "Claude (draft)"`, `reviewed_by: ""`), covering every route in all three languages. The team (مسلّم and مهند) completes it to 80 per plan §5.2 and reviews every expected behaviour. Tagalog needs a Tagalog reader (plan §9).
- Whether an apology on a normal question counts against the 95% (feature open question) is reported both ways.
