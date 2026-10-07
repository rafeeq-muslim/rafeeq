# KNW-02 §3.6/3.8 embeddings and search: implementation

**Feature:** `docs/domains/knowledge/features/KNW-02-approved-sources-ingestion.md` (R4: search in the asker's language only) · **Plan:** §2.2–2.4, §3.6, §3.8
**Written:** 2026-10-05 by Claude. **Updated 2026-10-06** for source coverage (`docs/domains/knowledge/features/KNW-02-source-coverage-and-retrieval-prd.md`, report `KNW-02-source-coverage-report.md`) and the reliability PRD (`KNW-01-chatbot-reliability-report.md`).

## 1. Model check (done 2026-10-05, live)

- `GET https://openrouter.ai/api/v1/embeddings/models` lists `baai/bge-m3` at **$0.01 per million input tokens** ✅.
- A real call returned 1024-dimension vectors (provider Parasail) with `usage.cost` in the body ✅. `EMBED_DIM = 1024` stays; no migration needed for the vector column.

## 2. Modules

| Step | Module | Behaviour |
| --- | --- | --- |
| 3.6 embed passages | `app/knowledge/embed.py` | `python -m app.knowledge.embed [--source X] [--kind K] [--lang L] [--limit N] [--batch 64] [--estimate]`. Selects rows with `embedding IS NULL` (so it resumes and re-embeds only changed text: the loader nulls the vector when `text_hash` changes), sends `quote_text + "\n\n" + context_text` capped at 6,000 characters, writes vectors per batch in its own transaction. Every batch passes the spend guard first; on `BudgetExceeded` it stops cleanly. `--estimate` prints rows, characters and a cost estimate without calling anything |
| production embedding | `app/knowledge/jobs.py` | `register(scheduler)`: every `KNW_EMBED_JOB_MINUTES` (10), embed at most `KNW_EMBED_JOB_LIMIT` (4,000) rows of the sources `source_policy.eligible_sources()` returns, only when a key is set. Batches take turns over every (source, language) with work left (by id inside each), so one large group never starves another under the ceiling. Spend: agent `embed`, its own daily ceiling `AI_EMBED_DAILY_BUDGET_USD` ($1.00) under the $10 total; answers keep `AI_DAILY_BUDGET_USD` ($0.75). After each run, coverage per source and language (passages, embedded, remaining, %), model, last run, last success and stop reason go to `knw_sources.versions["embedding"]`; `ready` only when nothing remains |
| answer-source policy | `app/knowledge/source_policy.py` | The only parser of `KNW_ANSWER_SOURCES` (trim, no repeats, unknown names reported, never widening). Eligible = configured ∩ in the database ∩ `mode = index`; `None` = policy, `[]` = nothing. Per-language readiness cached 10 min. Vectors recorded under another model are not searched |
| 3.8 `retrieve(query, lang, k)` / `search()` | `app/knowledge/search.py` | Embeds the search form of the question (`query_normalization.py`); cache key = model + normalization version + language + exactly the embedded text. Runs pgvector cosine top 24 and full-text top 24 **in `lang` only**, both always; `KNW_MIN_SIMILARITY` > 0 drops weak vector hits only. Fuses by reciprocal rank, ties by passage id; when `KNW_PREFERRED_SOURCE` names a source, its candidate moves ahead of a near-tied candidate of another source (owner decision 2026-10-06 for islamqa: fused scores within `KNW_NEAR_TIE_EPSILON` = 0.0006, a shared channel, close cosine/full-text scores; never past a clearly better one). The default is empty since live source access v3, so no source is preferred. Collapses two translations of one ayah; keeps every other passage. Returns a `RetrievalResult`: status complete / degraded (embeddings down, or one channel's SQL failed) / unavailable (no channel worked), counts, per-source counters and exclusion reasons. A database error is never an empty "no source" result |
| corpus loader safety | `app/knowledge/load.py` | A requested source without its file fails; empty, non-JSON, incomplete rows, repeated ids, a mismatching `<source>.manifest.json`, or > 10 % fewer rows than stored refuse the whole source (rolled back, exit code 1); `--allow-shrink` for an intended removal |
| diagnostics | `app/knowledge/source_diagnostics.py` | Internal CLI only (`inventory`, `trace CASES.json`), no endpoint; ids, ranks, cosine and RRF kept apart, Recall@k; never question or passage text |
| R3 scripture by id | `app/knowledge/scripture.py` | `GET /api/scripture/quran?sura&from&to&lang` and `GET /api/scripture/hadith/{id}?lang` (stored HadeethEnc text, `grade`, `attribution`, `reference`, `url`, source version). No record in that language → 404 `not_loaded`, no other text |
| R6 approved team cards | `app/knowledge/cards.py` | Source `rafeeq_cards`, kind `approved_card`: one passage per lesson card with text, per language, while the lesson and its unit are live in the review desk (merged and not returned). Refreshed on `ContentApproved`, on a desk return, at every app start (one-shot job) and by a full `python -m app.knowledge.load`. In the text index at once; it gets vectors and answers only if `KNW_ANSWER_SOURCES` lists `rafeeq_cards` (not in the default: a product decision) |
| full-text column | Alembic `b3c1d2e4f5a6` | generated `tsv` (english config for `en`, simple for `ar`/`tl`; Arabic diacritics/tatweel removed and alef, ya, ta marbuta folded) + GIN index |

## 3. Cost estimate before running (2026-10-05, local corpus)

Characters per source (quote + context capped at 6,000) and tokens at ~3.3 characters per token for the XLM-R tokenizer used by bge-m3 (⚠️ approximation; the real figure is read back from `usage.cost`):

| Source / kind | Rows | Million chars | ≈ Million tokens | ≈ Cost |
| --- | --- | --- | --- | --- |
| QuranEnc translations (en, tl) | 18,708 | 3.2 | 1.0 | $0.010 |
| QuranEnc tafsir + Arabic text (ar) | 18,708 | 3.1 | 0.9 | $0.009 |
| HadeethEnc (ar, en, tl) | 7,851 | 12.8 | 3.9 | $0.039 |
| IslamHouse encyclopedia | 43 | < 0.1 | < 0.1 | < $0.001 |
| binbaz | 19,229 | 18.8 | 5.7 | $0.057 |
| islamqa (answer source since the owner's decision of 2026-10-06; permission request still pending) | 96,511 | 198.9 | 60 | $0.60 estimate; **measured on 1,000 ar passages (2026-10-06): $0.00657 → ≈ $0.63** |

Run locally tonight: QuranEnc + HadeethEnc + IslamHouse encyclopedia + a 2,000-row binbaz sample (≈ $0.07). Production embeds the rest through the job.

Production state 2026-10-06 (read-only, before the source-coverage deploy): every source fully embedded except islamqa (ar 60,943 and en 35,568 passages, 0 vectors). After the deploy the job embeds islamqa at 4,000 passages per 10-minute run: measured 6.7 s per 64 passages on the development database → ≈ 4 h (up to ≈ 8 h if runs overrun their tick), ≈ $0.63, within the $1.00 daily embedding ceiling. Until then islamqa is searched by words only (`embedding_pending` in the trace).

## 4. Tests (`backend/tests/test_knw02_search.py`)

- `test_knw02_r4_search_returns_only_asker_language`
- `test_knw02_embed_job_resumes_and_skips_embedded_rows`
- `test_knw02_embed_job_stops_at_budget`
- `test_knw02_search_falls_back_to_fulltext_when_embedding_fails`
- `test_knw02_search_threshold_drops_weak_vectors_but_checks_full_text` (replaces `…_threshold_returns_empty_list`: reliability R3)
- `backend/tests/test_knw02_source_coverage.py`: S01–S20 and the owner's islamqa decisions (table in `KNW-02-source-coverage-report.md` §6)
- `backend/tests/test_knw02_rules.py`: one test per example of KNW-02 R1, R2, R3, R5 and R6 (`test_knw02_r1_*` … `test_knw02_r6_*`), plus `test_knw02_sc3_embedding_turns_go_round_every_source_and_language`

## Word-search bounds (security review 2026-10-07, A-M6)

`search.tsquery` gives at most 12 words of the question (the longest, in the order asked; `MAX_TERMS`), a word is a prefix term only from 3 letters (`PREFIX_MIN`; a 2-letter word is searched as the exact word), and the vector query and the word query each run under `SET LOCAL statement_timeout` of 15 s (`RETRIEVAL_TIMEOUT_MS`), reset after the query. A cancelled query is a failed channel (`degraded` / `unavailable`, `retrieval_db_error`), never an empty result. Measured on the local corpus (161,050 passages), word query only, median of 3:

| Question | Before | After |
| --- | --- | --- |
| English, 600 characters of 2-letter words | 43.3 s (100 terms) | 0.19 s (12 terms) |
| English, 600 characters of common words | 13.7 s (60 terms) | 1.5 s (12 terms) |
| Arabic, 600 characters of 2-letter words | over 60 s (76 terms) | 1.7 s (12 terms) |
| Arabic, 600 characters of common words | over 60 s (98 terms) | 5.3 s (24 terms) |
| Ordinary questions (4 to 20 terms) | 0.8 to 4.0 s | 0.2 to 3.2 s |

Answer quality: for the 31 questions of `content/knowledge/eval/questions.jsonl` the 24 word-search candidates are identical for 30; Q014 keeps 21 of 24 («كم» is now the exact word, not a prefix). No KNW test changed. Tests: `backend/tests/test_sec_a_m6_retrieval.py`.
