# KNW-03 unified glossary: implementation (backend only)

**Feature:** `docs/domains/knowledge/features/KNW-03-unified-glossary.md` · **Plan:** `docs/domains/knowledge/implementation-plan.md` §8.1
**Written:** 2026-10-05 by Claude (overnight build, Discover half).

**Scope decision:** the overnight brief listed a glossary under Discover, but KNW-03 «خارج النطاق» excludes «قاموس يتصفحه المستخدم أو يبحث فيه». The rule wins: no learner-facing glossary screen. What is built is the approved-term service that lessons and the assistant consume.

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 (one approved term per concept per language, with definition and source) | `backend/app/knowledge/glossary.py` | Terms are written in `content/glossary/terms.json` (`{concept, langs: {ar|en|tl: {term, alternates[], definition, source_ids[]}}}`). The loader rejects a file that gives a concept two entries for one language (`DuplicateTerm`); the DB index `uq_knw_glossary_approved` enforces the same on `knw_glossary` |
| R2 (only after the reviewer's approval) | `glossary.py` | Each concept is a review-desk item `glossary_term` with per-language views; `GET /api/glossary?lang=` returns approved snapshots only |
| R3 (assistant and lessons use the approved term) | `ask.py`, `tasks.py`, `ai/agents.py`, prompts `composer.md` (rule 11) and `explainer.md` | `glossary.prompt_terms` + `prompt_block`: when approved terms exist in the asker's language, the composer (and its repair) and the mistake explainer get a `GLOSSARY` section (`- concept: term (not: alternates)`) and are told to use the approved term. No terms → no section, so the model input is exactly as before. Lesson text display: PLT-03 R5 (plt-audit-gaps) |
| R3 ex2 (team card with a non-approved spelling flagged for the reviewer) | `glossary.spelling_flags`, `review.item_detail`, `content/check_content.py` | A listed concept written with one of its `alternates` in that language: `glossary_flags` per language in the review desk (shown above the item) and a warning from the content check |
| R4 (source text never changed) | — | Nothing here touches scripture or source text |
| R5 (no approved term → no machine translation) | `approved_terms`, `glossary.record_gaps` | Returns nothing for that language; callers keep the passage's wording. A listed concept found in a verified answer (or its cited passages, or an explanation) with no approved term in that language is recorded once in `knw_glossary` (`status = missing`, concept and language only); the desk lists them at `GET /api/review/glossary/missing` |

## 2. Endpoints

`GET /api/glossary?lang=` → `{lang, terms: [{concept, term, alternates[], definition, source_ids[]}]}` (public cache).
`GET /api/review/glossary/missing` (Sharia reviewer and team) → `{items: [{concept, lang}]}`.

## 3. Data

`content/glossary/terms.json` starts empty: no translations are invented; the term list waits for مهند (KNW-03 open question). `alternates` are the known other spellings (plan §8.1 step 3). `knw_glossary` holds only the R5 gaps (`status = missing`); approved terms are read from the file through the review desk.

## 4. Tests (`backend/tests/test_knw03_glossary.py`, `test_knw03_glossary_use.py`)

| Example | Test |
| --- | --- |
| R1 ex1 (approved term with definition and source) | `test_knw03_r1_merged_term_served_with_definition_and_source` |
| R1 ex2 (second approved term for a language rejected) | `test_knw03_r1_second_term_for_language_is_rejected` |
| R2 ex1/ex2 (only approved terms are used) | `test_knw03_r2_merged_term_served_only_in_its_written_languages`, `test_knw03_r2_returned_term_withdrawn_until_corrected`, `test_knw03_r2_returned_term_is_not_given_to_the_composer` |
| R3 ex1 (assistant writes the approved term) | `test_knw03_r3_composer_receives_the_approved_terms_in_the_askers_language`, `test_knw03_r3_explainer_receives_the_approved_terms`, `test_knw03_r3_without_approved_terms_the_composer_input_is_unchanged` |
| R3 ex2 (non-approved spelling flagged) | `test_knw03_r3_non_approved_spelling_is_found_and_the_approved_term_is_not`, `test_knw03_r3_review_desk_flags_a_card_using_a_non_approved_spelling`, `test_knw03_r3_content_check_flags_a_non_approved_spelling`; vitest `DeskCitations.test.tsx` |
| R5 (no approved term → recorded, never translated) | `test_knw03_r5_term_without_approved_translation_is_recorded_for_review`, `test_knw03_r5_a_concept_with_an_approved_term_is_not_recorded` |
