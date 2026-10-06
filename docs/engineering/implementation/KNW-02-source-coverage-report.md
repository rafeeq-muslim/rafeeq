# KNW-02 source coverage and retrieval: implementation report

**PRD:** `docs/domains/knowledge/features/KNW-02-source-coverage-and-retrieval-prd.md` · **Handoff:** `KNW-02-source-coverage-handoff.md` · **Shared changes:** `KNW-01-chatbot-reliability-report.md` (tracing, outcomes, budget)
**Written:** 2026-10-06 by Claude. Not committed or deployed by this session.
Status words: **implemented** · **tested locally** (fixtures) · **smoke (dev)** (development database, real models) · **not run (live)**.

## 1. Verified cause

| Finding | Evidence |
| --- | --- |
| islamqa was excluded from answers by the default `KNW_ANSWER_SOURCES` | `config.py` default `quranenc,hadeethenc,islamhouse_enc,binbaz`; both retrieval channels and the embedding job used that list |
| Production used that default | `secrets.env` has no `KNW_*`/`AI_*`/`ASK_*` key (names checked, not values); a read-only `printenv` in `rafeeq-backend-1` found none. Effective value before: `quranenc,hadeethenc,islamhouse_enc,binbaz` |
| islamqa data was loaded but never embedded | Production (read-only, 2026-10-06): islamqa ar 60,943 / en 35,568 passages, **0** with vectors (table §2) |
| Two different parsers | `search.py` stripped spaces, `jobs.py` did not; `sources or answer_sources()` turned `[]` into "all"; `Source.mode` was never checked by the queries |
| A partial or empty corpus file could replace a source | `load.py` deleted rows missing from the file without any count check, and a requested source without its file was skipped silently |
| Ibn Baz appearing often is not by itself a fault | Before this change islamqa could not be retrieved at all, so no comparison was possible; no 50/50 target is set (PRD §9) |

**MCP:** nothing in `backend/app` or `frontend/src` calls an MCP server (searched for `mcp`); the answer path searches the local PostgreSQL index only. The ICSA MCP server is recorded in `docs/agents/sources.md` as development/ingestion only. The user's own MCP connection in Claude is outside the app and was not inspected; islamqa reaches the app only through the offline dump → `islamqa.py` → `load.py` path. A connected MCP without data in the database is reported as `missing_source` (S06), never as readiness.

## 2. Production inventory before deploy (read-only, 2026-10-06)

| source | mode | lang | passages | with vector |
| --- | --- | --- | --- | --- |
| binbaz | index | ar | 19,229 | 19,229 |
| hadeethenc | index | ar / en / tl | 3,574 / 2,328 / 1,949 | all |
| islamhouse_enc | index | ar / en | 18 / 25 | all |
| **islamqa** | index | **ar / en** | **60,943 / 35,568** | **0 / 0** |
| quranenc | index | ar / en / tl | 18,708 / 12,472 / 6,236 | all |

islamqa has no Tagalog (the site's dump has none): Tagalog questions keep using the other sources (S08).

## 3. Product owner's decision (2026-10-06), as implemented

Recorded also in `docs/engineering/decisions-for-review.md`.
1. **islamqa is a main source**: in the default answer sources, Arabic and English. Its permission status in `docs/agents/sources.md` is unchanged ("owner decision 2026-10-05, permission request still to send").
2. **The whole islamqa set is embedded within the first day**: the embedding job has its own ceiling `AI_EMBED_DAILY_BUDGET_USD = 1.00` (answers keep `AI_DAILY_BUDGET_USD = 0.75`; the $10 total covers both) and runs `KNW_EMBED_JOB_LIMIT = 4000` passages every `KNW_EMBED_JOB_MINUTES = 10`.
3. **Near-tie preference for islamqa** (`KNW_PREFERRED_SOURCE = islamqa`, `KNW_NEAR_TIE_EPSILON = 0.0006`): an islamqa candidate moves ahead of another source's candidate only when (a) the other's fused RRF score is higher by at most 0.0006 (≈ one rank position in each of the two channels at the top: 2 × (1/60 − 1/61) = 0.00055), (b) they were found by a common channel and the other has no channel islamqa lacks, and (c) in each shared channel their scores are close (cosine within 0.02; full-text rank at least 90 % of the other's). It never passes a clearly better candidate or another islamqa candidate, never adds a passage, and every citation is still verified. `KNW_NEAR_TIE_EPSILON=0` turns it off. Conditions (b) and (c) were added after a dev measurement showed RRF alone treats a text-only and a vector-only candidate of equal rank as tied, which is not a real tie.
4. **Card label**: «الإسلام سؤال وجواب» in Arabic, "IslamQA" in English and Tagalog, linking to the passage's own `islamqa.info` URL.

## 4. What was built (SC1–SC6)

- **SC1** `backend/app/knowledge/source_policy.py`: one parser (trim, no blanks or repeats, unknown names reported and never widening the search; strict mode raises); `eligible_sources()` (configured ∩ in database ∩ `mode = index`, with an exclusion reason per source); `None` = policy, `[]` = nothing; per-language readiness (passages, vectors) cached 10 min; vectors recorded under another embedding model are not searched (S19). Used by `search.py`, `jobs.py`, `approved.py`, `ask.py` (cards) and `source_diagnostics.py`.
- **SC2** `load.py`: a requested source without its file fails; an empty file, a non-JSON line, a row missing a required field, a row of another source or a repeated id refuses the whole source; an optional `<source>.manifest.json` (`{"rows": N, "complete": true}`) must match; a file with more than 10 % fewer rows than the database is refused unless `--allow-shrink`; every refusal rolls back, so the stored corpus stays whole; the command exits non-zero. The embedding record survives a reload.
- **SC3** `embed.py` / `jobs.py`: the job takes its sources from the policy; per source and language it records passages, embedded, remaining, %, model, last run, last success and stop reason in `knw_sources.versions["embedding"]`; `ready` only when nothing remains; a source whose vectors came from another model is skipped until `--reembed` (clears that source's vectors on purpose). Batches are not redistributed between sources: in production only islamqa has work left, so alphabetical order delays nothing.
- **SC4** measured, not re-ranked: no per-source quota, no reserved slots, no prompt asking for a source name. Stable tie-break by id; the owner's near-tie rule above. The crowding check (S14) is a diagnostic (`context_limit`), not a ranking change.
- **SC5** `frontend/src/app/ask/answer.ts::sourceLabel` (islamqa per language); names and links come from the passage and its source row, never the model; an islamqa passage quoting Ibn Baz stays an islamqa card (S16). Cards grouped per reference (KNW-01 R8).
- **SC6** per request, `knw_answer_log.trace.sources` holds for each source: eligible or the exclusion (`disabled_by_answer_config`, `mode_link`, `missing_source`, `unknown_source`, `no_passages_for_lang`), vector note (`embedding_pending`, `embedding_model_mismatch`, `partial:<pct>`), counts of vector and text candidates, below-threshold hits, passages in context, cited and verified, and the stage where it stopped (`no_relevant_hits`, `below_threshold`, `context_limit`, `not_cited`, `verification_rejected`). Internal tool `python -m app.knowledge.source_diagnostics inventory | trace CASES.json [--sources …] [--ignore-config]` (no HTTP endpoint; `--ignore-config` refused in production; output has ids, ranks, cosine and RRF kept apart, never question or passage text).

## 5. Retrieval measurements

| Measure | Result | Status |
| --- | --- | --- |
| islamqa embedding cost and speed | 1,000 islamqa ar passages: $0.00657, 17 calls, 6.7 s per 64-passage batch → ≈ $0.63 for all 96,511 (the code's estimate says $0.36 for ar; real usage costs more per character) | smoke (dev) |
| Arabic smoke, 5 questions, islamqa enabled with 1.6 % ar vectors on dev | 5/5 answered; islamqa reached the context (1–5 passages) but was not cited; cited: binbaz 6940, binbaz 13158/10755 + QuranEnc 17:23, IslamHouse + HadeethEnc, binbaz 12544 | smoke (dev) |
| English «What does the shahada mean?» with and without islamqa (islamqa en **without vectors** on dev) | without islamqa: answered from `hadeethenc:en:6203`; with islamqa: three text-only islamqa passages entered the top 8, `hadeethenc:en:6203` fell out of the top 11, the composer judged the rest insufficient twice → `no_source` (run before the §3 fix of the near-tie rule). The near-tie rule does not decide it: with the rule off, 6203 is still outside the top 11 | smoke (dev), one case |
| Recall@8 per source on a reviewed set (≥ 10 islamqa, 10 binbaz, 10 overlap/negative) | No reviewed set with proven evidence exists; the tool is ready (`source_diagnostics trace CASES.json`, reports `recall_at_k`) | not run (live) |

Reading of the English case: while a source is searched by words only, its full-text hits compete with other sources' vector hits on rank alone, and can push a useful passage out of the 8. This is expected to shrink once islamqa has vectors (it then competes on both channels), but that is not measured. Per the PRD (no ranking change from one case), ranking was not changed. **Decision (product owner via the main session, 2026-10-06): accepted.** islamqa stays in the answer sources while its vectors are being made (a few hours); there is no coverage gate, because S07 requires the full-text fallback for a source without vectors. Watch `reason_code = insufficient_evidence` in the answer log during that window (§8 step 5).

## 6. S01–S20 (tests in `backend/tests/test_knw02_source_coverage.py` unless noted)

| ID | Status | Tests / note |
| --- | --- | --- |
| S01 | tested locally | `test_knw02_s01_islamqa_in_database_but_not_configured` (retrieval trace and inventory say `disabled_by_answer_config`) |
| S02 | tested locally | `test_knw02_s02_islamqa_exclusive_evidence_reaches_the_answer` |
| S03 | tested locally | `test_knw02_s03_binbaz_exclusive_evidence_still_answers` |
| S04 | tested locally | `test_knw02_s04_s15_evidence_in_one_source_no_padding_and_not_cited_is_traced` |
| S05 | tested locally | `test_knw02_s05_both_sources_relevant_both_reported` |
| S06 | tested locally | `test_knw02_s06_configured_source_without_data_is_missing_source` |
| S07 | tested locally | `test_knw02_s07_islamqa_without_vectors_uses_full_text_and_full_checks` (+ KNW-01 `t09`) |
| S08 | tested locally | `test_knw02_s08_tagalog_request_without_islamqa_tagalog` |
| S09 | tested locally | `test_knw02_s09_link_mode_source_is_never_used`; approved answers: KNW-01 `test_knw01_t19_approved_answer_from_a_disabled_source_is_not_served` |
| S10 | tested locally | `test_knw02_s10_empty_list_searches_nothing_none_uses_the_policy` |
| S11 | tested locally | `test_knw02_s11_list_parsing_is_uniform_and_unknown_names_are_reported` |
| S12 | tested locally | `test_knw02_s12_missing_empty_broken_or_shrunk_file_never_replaces_the_corpus`, `test_knw02_sc2_reload_keeps_the_embedding_record` |
| S13 | tested locally | `test_knw02_s13_embedding_ceiling_stops_safely_and_reports_what_remains`, `test_knw02_sc3_answer_ceiling_does_not_stop_the_embedding_job`, `test_knw02_sc3_job_uses_the_policy_and_records_coverage`, `test_knw02_embed_job_stops_at_budget` |
| S14 | tested locally as a measurement; ranking unchanged | `test_knw02_s14_crowding_is_measured_not_reranked` |
| S15 | tested locally | `test_knw02_s04_s15_…` (`not_cited`, no card) |
| S16 | tested locally | `test_knw02_s16_islamqa_card_names_the_site_it_came_from`; app label: `frontend/src/app/pages/Ask.test.tsx` "names islamqa by the site it came from in each language" |
| S17 | tested locally (env precedence); live check is step 2 of §8 | `test_knw02_s17_environment_value_overrides_the_default` |
| S18 | tested locally | `test_knw02_s18_index_failure_is_a_technical_failure` (+ KNW-01 `t23` ×2) |
| S19 | tested locally | `test_knw02_s19_other_model_vectors_are_never_mixed`; query-cache side: KNW-01 `t07` |
| S20 | tested locally | `test_knw02_s20_rollback_keeps_service_and_data`, `test_knw02_owner_near_tie_off_keeps_the_plain_order` |
| Owner | tested locally | `test_knw02_owner_islamqa_is_a_default_answer_source`, `…_near_tie_prefers_islamqa`, `…_clearly_better_binbaz_stays_first`, `…_irrelevant_islamqa_is_not_put_in_context`, `…_near_tie_never_passes_a_clearly_better_or_another_preferred_candidate`, `test_knw02_inventory_reports_readiness_per_language` |

Gate status (PRD §9): eligibility, contract and missing-file tests 100 % with fixtures (29/29); Recall@8 ≥ 95 % per source group: not run (live); zero citations of an unretrieved or disabled source: enforced by the verifier and the card check, tested.

## 7. Files changed

See `KNW-01-chatbot-reliability-report.md` §5 (one change set). KNW-02-specific: `backend/app/core/config.py` (answer sources, embedding ceiling, job size and interval, near-tie settings), new `backend/app/knowledge/source_policy.py` and `source_diagnostics.py`, `search.py`, `jobs.py`, `embed.py`, `load.py`, `frontend/src/app/ask/answer.ts`, `parts.tsx`, `backend/tests/test_knw02_source_coverage.py`, `backend/tests/knw_fakes.py` (islamqa fixture source). `infra/compose.prod.yml` and `infra/scripts/deploy.sh` reviewed, not changed: the backend reads `secrets.env` (no override today) and `deploy.sh` reloads the corpus only when its files change; `load.py` now exits non-zero on a refused source, which `deploy.sh` already reports as "corpus load failed (app keeps the previous corpus)".

## 8. Production steps for the main session (in order, after the deploy in the KNW-01 report §9)

1. Confirm the effective configuration (KNW-01 report §9 step 2): the answer sources must end in `islamqa`.
2. Inventory (read-only):
   `docker exec rafeeq-backend-1 sh -c 'export DATABASE_URL=postgresql+asyncpg://rafeeq:${POSTGRES_PASSWORD}@db:5432/rafeeq && python -m app.knowledge.source_diagnostics inventory'`
   Expected: islamqa `effective_for_answers: true`, ar/en `embedding_pending` at first.
3. **Embedding: nothing to start.** The scheduler job (every 10 min, 4,000 passages) embeds islamqa, the only source with work left. Expected: ≈ $0.63 in total (measured rate), ≈ 4 h if the provider answers as fast as on dev (6.7 s per 64 passages, 24 k passages/hour), up to ≈ 8 h if runs overlap ticks; within the first day. The embedding ceiling is $1.00 per UTC day; production had already spent $0.13 on embeddings today at the read, so $0.87 remains today: enough, and otherwise it resumes after 00:00 UTC. Do **not** run `python -m app.knowledge.embed` at the same time (it would embed the same rows in parallel and pay twice). A free estimate: `… python -m app.knowledge.embed --source islamqa --estimate`.
4. Watch coverage (read-only):
   `docker exec rafeeq-db-1 psql -U rafeeq -d rafeeq -tAc "SELECT lang, count(*), count(embedding) FROM knw_passages WHERE source_id='islamqa' GROUP BY 1"` and the job's spend: `… -tAc "SELECT round(sum(cost_usd)::numeric,4) FROM knw_ai_calls WHERE agent='embed' AND at >= date_trunc('day', now() at time zone 'utc')"`.
5. Until coverage is 100 %, watch `insufficient_evidence` in the answer log (KNW-01 report §9 step 4); the transitional crowding is accepted (§5), no coverage gate.
6. After coverage is 100 %: run `source_diagnostics trace` on a reviewed case file (≥ 10 islamqa, 10 binbaz, 10 overlap/negative, with expected passage ids) per source and with the policy, and record Recall@8 here.
7. No corpus reload is needed (islamqa is already loaded). The weekly islamqa refresh from the dump manifest is the main session's host timer; `load.py` now refuses a missing, empty, broken or much smaller file.

## 9. Rollback

No data is deleted to roll back.
- Ranking preference off: `KNW_NEAR_TIE_EPSILON=0`.
- islamqa out of answers: `KNW_ANSWER_SOURCES=quranenc,hadeethenc,islamhouse_enc,binbaz` (its passages and vectors stay).
- Pause the embedding job: `KNW_EMBED_JOB_LIMIT=0`.
Set in `secrets.env`, then recreate the backend (`docker compose -p rafeeq -f infra/compose.prod.yml up -d backend`) so `get_settings` reads it, and check step 1 again.

## 10. Remaining limitations

- Recall@8 and answer quality per source: not run (live); needs a reviewed case set.
- The transitional crowding in §5 until islamqa is embedded (accepted by the owner; S07 requires the text fallback).
- islamqa permission: still "request to send" (unchanged; owner's decision to use it stands).
- Per-source batch redistribution in the job is not built (not needed by the measurement: islamqa is the only source with work left).
