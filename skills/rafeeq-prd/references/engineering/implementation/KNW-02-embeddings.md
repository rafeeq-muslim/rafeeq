# KNW-02 §3.6/3.8 embeddings and search: implementation

**Feature:** `docs/domains/knowledge/features/KNW-02-approved-sources-ingestion.md` (R4: search in the asker's language only) · **Plan:** §2.2–2.4, §3.6, §3.8
**Written:** 2026-10-05 by Claude.

## 1. Model check (done 2026-10-05, live)

- `GET https://openrouter.ai/api/v1/embeddings/models` lists `baai/bge-m3` at **$0.01 per million input tokens** ✅.
- A real call returned 1024-dimension vectors (provider Parasail) with `usage.cost` in the body ✅. `EMBED_DIM = 1024` stays; no migration needed for the vector column.

## 2. Modules

| Step | Module | Behaviour |
| --- | --- | --- |
| 3.6 embed passages | `app/knowledge/embed.py` | `python -m app.knowledge.embed [--source X] [--kind K] [--lang L] [--limit N] [--batch 64] [--estimate]`. Selects rows with `embedding IS NULL` (so it resumes and re-embeds only changed text: the loader nulls the vector when `text_hash` changes), sends `quote_text + "\n\n" + context_text` capped at 6,000 characters, writes vectors per batch in its own transaction. Every batch passes the spend guard first; on `BudgetExceeded` it stops cleanly. `--estimate` prints rows, characters and a cost estimate without calling anything |
| production embedding | `app/knowledge/jobs.py` | `register(scheduler)`: every 15 minutes, embed at most `KNW_EMBED_JOB_LIMIT` (default 2,000) rows of the answer sources, only when a key is set. Registered in `app/jobs.py` |
| 3.8 `search(question, lang, k)` | `app/knowledge/search.py` | Embeds the question (in-memory LRU by hash, no identity), runs pgvector cosine top 24 and full-text top 24 **in `lang` only**, fuses them by reciprocal rank, collapses duplicate records (two translations of one ayah), returns `k` passages with their cosine score. If `KNW_MIN_SIMILARITY` > 0 and no vector hit reaches it, the result is empty. If the embedding call fails (outage or budget), full-text results alone are used |
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
| islamqa (not run: permission pending) | 96,511 | 198.9 | 60 | $0.60 |

Run locally tonight: QuranEnc + HadeethEnc + IslamHouse encyclopedia + a 2,000-row binbaz sample (≈ $0.07). Production embeds the rest through the job.

## 4. Tests (`backend/tests/test_knw02_search.py`)

- `test_knw02_r4_search_returns_only_asker_language`
- `test_knw02_embed_job_resumes_and_skips_embedded_rows`
- `test_knw02_embed_job_stops_at_budget`
- `test_knw02_search_falls_back_to_fulltext_when_embedding_fails`
- `test_knw02_search_threshold_returns_empty_list`
