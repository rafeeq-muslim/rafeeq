# KNW-03 unified glossary: implementation (backend only)

**Feature:** `docs/domains/knowledge/features/KNW-03-unified-glossary.md` · **Plan:** `docs/domains/knowledge/implementation-plan.md` §8.1
**Written:** 2026-10-05 by Claude (overnight build, Discover half).

**Scope decision:** the overnight brief listed a glossary under Discover, but KNW-03 «خارج النطاق» excludes «قاموس يتصفحه المستخدم أو يبحث فيه». The rule wins: no learner-facing glossary screen. What is built is the approved-term service that lessons and the assistant consume.

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 (one approved term per concept per language, with definition and source) | `backend/app/knowledge/glossary.py` | Terms are written in `content/glossary/terms.json` (`{concept, langs: {ar|en|tl: {term, alternates[], definition, source_ids[]}}}`). The loader rejects a file that gives a concept two entries for one language (`DuplicateTerm`); the DB index `uq_knw_glossary_approved` enforces the same on `knw_glossary` |
| R2 (only after the reviewer's approval) | `glossary.py` | Each concept is a review-desk item `glossary_term` with per-language views; `GET /api/glossary?lang=` returns approved snapshots only |
| R3 (assistant and lessons use the approved term) | consumers | `approved_terms(session, lang)` is the function the Ask agent and lesson checks import |
| R4 (source text never changed) | — | Nothing here touches scripture or source text |
| R5 (no approved term → no machine translation) | `approved_terms` | Returns nothing for that language; callers keep the passage's wording |

## 2. Endpoints

`GET /api/glossary?lang=` → `{lang, terms: [{concept, term, alternates[], definition, source_ids[]}]}` (public cache).

## 3. Data

`content/glossary/terms.json` starts empty: no translations are invented; the term list waits for مهند (KNW-03 open question). `knw_glossary` is not written tonight.

## 4. Tests (`backend/tests/test_knw03_glossary.py`)

| Example | Test |
| --- | --- |
| R1 ex1 (approved term with definition and source) | `test_knw03_r1_approved_term_with_definition_and_source` |
| R1 ex2 (second approved term for a language rejected) | `test_knw03_r1_second_term_for_language_is_rejected` |
| R2 ex1/ex2 (only approved terms are used) | `test_knw03_r2_proposed_term_is_not_served` |
