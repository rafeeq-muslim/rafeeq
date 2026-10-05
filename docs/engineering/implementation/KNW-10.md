# KNW-10 assistant learning tasks: implementation

**Feature:** `docs/domains/knowledge/features/KNW-10-assistant-learning-tasks.md` (proposed by the LRN owner; built as written, per its open question) · **Related:** LRN-03 R6, LRN-07, LRN-10 R5, MOT-09 R4 · **Agents:** `docs/engineering/ai-agents.md`
**Written:** 2026-10-05 by Claude.

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1, LRN-03 R6 (explain from the card only) | `app/knowledge/tasks.py::explain` | Looks up the **approved** lesson snapshot (`review.published(session, "lesson", lang)`), finds the exercise, and uses the text of the cards listed on the exercise (falling back to its objectives' cards) as the only passage. The learner's answer is mapped to the option text. No identity is sent |
| R2 (check before return) | `tasks.py::_check_explanation` + `app/knowledge/ai/textcheck.py` | Code checks: ≤ 60 words; no quotation marks, «…», ﴿…﴾ or "said/قال/sinabi" attributions; no ﷺ-led quotes; no Arabic letters in a non-Arabic text except ﷺ; no Latin transliteration of dhikr or ayat (list in `textcheck.TRANSLIT`). Then a fast-model support check: every sentence's meaning is in the card. Any failure → `{"text": null}` and the app shows the card text |
| LRN-03 R6 reviewer block | `tasks.py` | `lrn_explanation_blocks(exercise_id, lang)` → `{"text": null}` without a model call |
| R4 (log shown explanations, no identity) | `tasks.py` | `knw_explanation_log(exercise_id, lang, text)` only when the text is returned |
| R3, LRN-07 (guide message from the learning summary only) | `tasks.py::guide` | Server resolves objective and lesson ids to their **approved** names, the model writes ≤ 3 sentences, the checker requires every quoted name to come from the summary and rejects rulings, ayat, hadith, worship and missed-day talk. Fail → `{"text": null}`; the app shows its fixed message (LRN-07 R4) |
| R3 (ask "what should I learn now?" in chat) | `ask.py` | A no-model phrase match returns `outcome: "learning_guide"`; the app then sends its on-device summary to `/api/learning/guide`. The assistant never answers that from Sharia sources |
| R4/LRN-07 R6 (summary not kept) | `tasks.py` | The summary is used in memory only; nothing about it is logged except the model call's cost row |
| R5 (objective tagging with consent only) | `ask.py` + `tasks.py::tag_objective` | Only when the request carries `consent_objectives: true` (the device flag `askConsent`, off by default) **and** the answer was given on route `general` or `disputed`. Fast model chooses one id from the approved objectives in that language, or none. Event `ObjectiveAsked {objective_id}`; the id is also returned so the device updates guest progress |
| R6 (tasks in the reliability test) | `app/knowledge/eval` | The question set has `task: explain|guide` cases with a planted addition; the runner counts how many the checker blocks |

## 2. Endpoints

`POST /api/learning/explain` (contract fixed by `frontend/src/app/lesson/why.ts`)
- Body `{lesson_id, exercise_id, lang, answer}` → `{text: string|null}`. Never an error for model trouble: outage, budget, block, unknown or unapproved lesson all return `{text: null}` (LRN-03 R6 error example: the card alone, no technical error). Rate limit 20/min per client.

`POST /api/learning/guide`
- Body `{lang, mastered: [objective_id], reviewing: [objective_id], next: {lesson_id}|{review: true}|null, returning: bool}` (the LRN-07 "learning summary": objective levels, next step, review objectives, language; no identity, no question text) → `{text: string|null}`. Unknown or unapproved ids are dropped before the model sees them.

## 3. Data

No new tables. Uses `knw_explanation_log`, `lrn_explanation_blocks` (read only), `content_approvals` (read only through `review.published`), `knw_ai_calls`.

## 4. Tests (`backend/tests/test_knw10_tasks.py`)

| Example | Test |
| --- | --- |
| KNW-10 R1 / LRN-03 R6 ex1 (niyyah card, English, ≤ 60 words) | `test_knw10_r1_explanation_rewords_card_in_learner_language` |
| KNW-10 R2 / LRN-03 R6 ex2 (added hadith → not returned) | `test_knw10_r2_explanation_citing_hadith_is_not_returned` |
| LRN-03 R6 ex3 (outage → card only, no error) | `test_knw10_r2_outage_returns_null_without_error` |
| LRN-03 R6 reviewer block | `test_knw10_r2_blocked_exercise_gets_no_explanation` |
| explain uses the approved snapshot only | `test_knw10_r1_unapproved_lesson_gets_no_explanation` |
| KNW-10 R3 / LRN-07 R3 ("what should I learn now?") | `test_knw10_r3_what_next_in_chat_asks_for_summary`, `test_knw10_r3_guide_message_from_summary_only` |
| LRN-07 R4 ex1 (added ruling → fixed message) | `test_knw10_r3_guide_with_ruling_is_rejected` |
| KNW-10 R4 (summary not kept, no identity) | `test_knw10_r4_summary_is_not_stored` |
| KNW-10 R5 ex1 (consent → ObjectiveAsked with id only) | `test_knw10_r5_consented_question_sends_objective_id_only` |
| KNW-10 R5 ex2 (sensitive/danger/personal → no tagging) | `test_knw10_r5_sensitive_routes_are_never_tagged` |
| KNW-10 R5 ex3 (no consent → no event) | `test_knw10_r5_no_consent_no_event` |

## 5. Open decisions

- The objective list offered to the tagger is every objective of every approved lesson in the learner's language. LRN-10 may later restrict it to "taught" objectives; the tagger contract does not change.
- MOT-09 R4's one-in-five card-only arm stays on the device (`why.ts`), so the server never knows which arm a learner is in.
