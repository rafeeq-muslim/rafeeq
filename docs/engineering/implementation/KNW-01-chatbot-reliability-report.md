# KNW-01 chatbot reliability: implementation report

**PRD:** `docs/domains/knowledge/features/KNW-01-chatbot-reliability-prd.md` (all sections, §14 binding) · **Handoff:** `KNW-01-chatbot-reliability-handoff.md` · **Companion report:** `KNW-02-source-coverage-report.md`
**Written:** 2026-10-06 by Claude. Not committed or deployed by this session; the main session commits and deploys.
**Code tested:** working tree on top of `main` at `0966ae1` (uncommitted changes listed in §5). **Data:** fixtures in the tests; the local smoke used the development database (corpus files of 2026-10-05: binbaz 19,229 ar; islamqa 60,943 ar / 35,568 en; QuranEnc, HadeethEnc, IslamHouse encyclopedia).

Status words in this report: **implemented** (code in the tree) · **tested locally** (automated test with fakes/fixtures, passing) · **smoke (dev)** (a few real model calls on the development database) · **not run (live)** (needs production data, real traffic or a reviewed set; never claimed).

This report does not say the problem is fully solved: the live acceptance runs of §10.2 (first-attempt rate ≥ 95 %, 20 repeats per suggestion, P95) have not been run.

## 1. What was found (causes)

| # | Finding | Evidence | Status |
| --- | --- | --- | --- |
| C1 | Every rejected answer, and a verifier outage, was returned as `no_source` («لم أجد جوابًا موثّقًا») | Old `ask.py` mapped any `verify()` failure to `_no_source`; old `verify.py` returned `["verifier_unavailable"]` as a failure code | **Confirmed in code**; fixed (Phase 1) |
| C2 | In production, **all 8** recorded `no_source` answers were compositions rejected by the deterministic checks (or `sufficient:false`), not empty retrieval and not an outage | Read-only production query, 2026-10-06: router 28 calls, search embeddings 20, composer 21, verifier 13, all `ok`; no fallback model call; answer log: answered 13, no_source 8, out_of_scope 7, learning_guide 2. 21 compositions = 13 answered + 8 no_source, and the verifier ran 13 times (= answered), so the 8 never reached the verifier | **Confirmed in aggregate**. Which check rejected each one is unknown: the old log kept no reason (now it does) |
| C3 | Composer output is not stable: a first composition can fail a check that a second one passes; a resend gives a new composition, which explains "fails, then works when asked again" | Local smoke (dev, real models): 2 of 6 questions failed the first composition (`malformed_marker`; `malformed_marker` + `scripture_copied_outside_marker`) and passed after the one bounded repair with full re-verification. The old code would have shown «لم أجد جوابًا موثّقًا» for both | **Reproduced** (smoke, n = 6); fixed by R5 repair |
| C4 | The question-embedding cache key was built from `normalize(question)` but the vector from the raw question, so two forms sharing a key could get the first form's vector | Old `search.py::embed_query`; `test_knw01_t07_cache_key_is_exactly_the_embedded_text` | **Confirmed in code**; fixed |
| C5 | «مامعنى» was never split | Old `textcheck.normalize`; new `query_normalization.py`; smoke: «ما معنى الشهادتين؟» and «مامعنى الشهادتين» both answered from binbaz 6940 | Code confirmed; its effect on the photographed request **not provable** (no trace existed) |
| C6 | The suggestion button already sent its own text (`send(s)`); no second submission path existed | Old `Ask.tsx`; `t01` tests now prove identical payloads | Hypothesis 4 of §3.1 **not supported**; contract unified anyway |
| C7 | The similarity gate could empty a search before the full-text channel ran | Old `search.py`; production `KNW_MIN_SIMILARITY` is the default 0 (no override in the secrets file) | Not a production cause; fixed |
| C8 | Provider fallback / transient outage | Production: 0 failed calls, 0 fallback-model calls | Not seen; separated anyway (`unavailable`) |
| C9 | Long waits | Production answer latency max 18.4 s (answered avg 10.5 s, no_source avg 9.3 s) | No hang seen; server 45 s and app 50 s deadlines added |

## 2. What was built

### Phase 1: failures kept apart from missing evidence; tracing
- `verify.py` returns `VerificationResult(status=passed|rejected|unavailable, codes, unsupported)`.
- Outcomes: `answered`, `cached`, `no_source` (`retrieval_empty`, `insufficient_evidence`), **`verification_failed`** (`verification_rejected`), `unavailable` (`temporarily_unavailable`, `deadline_exceeded`, `service_limit`), plus the existing `danger`, `refused`, `out_of_scope`, `learning_guide`. Every response has `reason_code` and `retryable`; `retryable` is false for budget or missing configuration (`service_limit`).
- §14.1 order: a degraded retrieval (embeddings down, or a database error) that ends without evidence is `unavailable` (`retrieval_degraded_no_evidence` / `retrieval_db_error`), never `no_source`; content violations are reported as `verification_failed` even when `sufficient:false` came with them; `answered` only after every cited passage still exists and is allowed when the cards are built.
- A database error in either channel rolls the session back and is a technical failure (no more `except Exception: return []`).
- Migration `ef83fa7deee6` (autogenerated against the development database only): nullable `ask_id` (indexed) on `knw_ai_calls` and `knw_answer_log`; `reason_code`, `detail`, `entrypoint`, `suggestion_id`, `client_request_id`, `trace` (JSONB) on `knw_answer_log`. The trace holds stage names, durations, counts, known codes and per-source counters; never question, answer or passage text (tested).
- The answer log is written in its own session after the response is decided: a failing log never changes the answer (§14.4). A failing required effect (event commit) returns HTTP 503 `effects_failed` with nothing half-saved; an unexpected error returns 500 `internal_error` and a log row.
- Fixed replies `no_source`, `verification_failed` (new) and `unavailable` reworded from the PRD table (`content/knowledge/fixed-replies.json`, still draft for the reviewer).

### Phase 2: one submission contract and an end to every wait
- `useAsk.submitQuestion({text, lang, entrypoint, suggestionId})` for typing, Enter and suggestions; suggestions have stable ids (`learning_next`, `shahada_meaning`, `wudu_virtue`, `parents_treatment` in `frontend/src/app/ask/suggestions.ts`) and send their shown text.
- Validation (trimmed, 2–600) before any bubble; the lock is set in the same synchronous update as the bubbles, before any await; the draft is cleared only after acceptance; a too-long question stays in the box with a message.
- Request body adds optional `client_request_id`, `entrypoint` (enum `typed|suggestion`), `suggestion_id` (validated pattern); the server records them for tracing only.
- App deadline `ASK_CLIENT_DEADLINE_MS = 50_000` per attempt, including a 401 refresh and the retried request; the shared refresh is never aborted (`untilAborted` in `api.ts`). Server deadline `ASK_DEADLINE_SECONDS = 45`: a monotonic `RequestContext` caps every call's timeout to the time left (embeddings no longer 60 s), and a hard `asyncio.timeout` ends the pipeline.
- `api.ts` keeps the HTTP status of a non-JSON body (an HTML 502 page) and reports `invalid_response` for a 200 that is not JSON; the store also rejects a 200 that is not the contract. Retry-After is read for 429.
- Error states: `network`, `timeout`, `cancelled`, `rate_limited` (with the wait in seconds when given), `invalid` (422: edit, no retry), `server` (5xx), `invalid_response`. Every end releases the lock only if its attempt still holds it.
- Retry re-sends the stored snapshot (question, language at the time, consent, entry point, suggestion id) into the same assistant message: no new user bubble, the draft untouched. Each attempt has an id; a late reply of an older attempt is dropped.
- The waiting bubble shows one honest message («أبحث عن إجابة موثوقة…»), not timed fake stages. The learning guide keeps its bounded 10 s request with the fixed message as fallback, and a thrown error now also falls back.

### Phase 3: search-only normalization, cache, text channel, tie-break
- `query_normalization.py` (version `qn1`): NFKC, Arabic diacritics and tatweel removed, punctuation to spaces, spaces collapsed, and a reviewed list of glued openers split **at the first word only** (`مامعنى`, `ماهو`, `ماهي`, `ماحكم`). «مالك», «ماهر» and everything else are untouched; no word is dropped, so negation, names, numbers and personal details stay. Safety screens run on the original text and on every derived form. The router and composer still receive the question as asked.
- Embedding cache key = SHA-256 of (model, normalization version, language, exactly the embedded text).
- `search.retrieve()` returns a `RetrievalResult` (passages, status complete/degraded/unavailable, reason, vector and text counts, max similarity, channel, embedding status, per-source counters, ranked candidates). Both channels always run; the threshold drops weak vector hits only; text candidates go to the composer and verifier, which decide whether they are evidence. Ties break by passage id; the vector and text SQL also order by id.
- One expansion round (shared counter, max 2 rounds per question): the predefined variant (question words dropped) or the next candidates of the same query.

### Phase 4: shared budget, bounded repair, approved answers, cards
- `RequestContext` (context variable): max 8 external calls (every model and embedding call, JSON retries and fallback included), max 2 retrieval rounds, max 2 compose rounds; time for the verifier (8 s) is reserved before composing, and no composition starts without room for its verification.
- One bounded repair (`agents.repair_answer`, composer prompt rule 10): same passages, the failure codes and the verifier's unsupported quotes; the repaired output goes through **every** check again; an unchanged repair is refused without asking the checker again; an expansion after `insufficient` uses the second compose round, so repair and expansion never both happen.
- Approved answers (`approved.py`) behind `ASK_APPROVED_FAQ_ENABLED=false`: served only if approved with a reviewer and a date, same language, every cited passage present with the approved version from a source the policy allows now; exact match always; approximate match only for router `general` A/B with the same negation words, no personal detail and at most two extra words; router down → exact match only. `content/knowledge/approved-answers.json` is still empty: tested with fixtures only.
- Source cards: the server keeps one card per cited passage (every id stays for markers and verification); the app groups strips by `(source_id, ref_key, lang, version)` (`groupSources` in `answer.ts`).
- Objective tagging stays optional: if it fails the verified answer is returned with `objective_id = null` and no event.

## 3. Feature flags (Settings, `backend/app/core/config.py`)

| Setting | Default | Why this default (owner rule: production is the only environment) |
| --- | --- | --- |
| `ASK_DEADLINE_SECONDS` | 45 | PRD value; error separation and deadlines need no flag |
| `ASK_MAX_EXTERNAL_CALLS` | 8 | PRD value |
| `ASK_MAX_RETRIEVAL_ROUNDS` | 2 | PRD value (1 disables the expansion) |
| `ASK_MAX_COMPOSE_ROUNDS` | 2 | PRD value (1 disables repair and recomposition) |
| `ASK_QUERY_NORMALIZATION_ENABLED` | **true** | Acceptance and safety cases pass: `t04` (four photo forms → identical passages, one embedding), `t05` ×3 («مالك», first-word-only rule, negation and personal details kept, negated question gets its own embedding, personal question never matches a general approved answer), `t07` ×2 (cache key = embedded text; version/model change never reuses). Smoke (dev): both photo forms answered from the same source |
| `ASK_REPAIR_ENABLED` | **true** | `t12` ×2, `t13` ×3 (repair fixes, unsupported text never shown, full re-verification, unchanged repair never re-checked, repair off refuses), `t21` (personal note kept after a repair), `t28` ×2 (caps). Smoke (dev): 2 of 6 real questions were answered only thanks to the repair; it added one composer and one verifier call (≈ $0.0013) and 5–9 s (totals 18.7 s and 14.0 s, under the 45 s deadline) |
| `ASK_APPROVED_FAQ_ENABLED` | **false** | No approved content exists; enabling it serves nothing until the reviewer approves entries |
| `AI_EMBED_DAILY_BUDGET_USD` | 1.00 | Embedding job's own daily ceiling (KNW-02 SC3); answers keep `AI_DAILY_BUDGET_USD` 0.75; `AI_BUDGET_USD` 10 total unchanged |

## 4. Acceptance tables

### R1–R8

| Req | Status | Evidence |
| --- | --- | --- |
| R1 one submission contract | implemented · tested locally | `store.test.ts` t01/t17; `Ask.test.tsx` t01–t03, t17; backend `t01`, `t02`, `t03` |
| R2 search-only normalization | implemented · tested locally · smoke (dev) | `t04`, `t05` ×3, `t07` ×2; flag on |
| R3 explainable retrieval | implemented · tested locally | `t08`, `t09`, `t10`, `test_knw01_r3_equal_scores_break_ties_by_id`, `t23` ×2, `test_knw02_search_threshold_drops_weak_vectors_but_checks_full_text`. Text candidates are judged by the composer and verifier, not by a new calibrated relevance score (none exists yet in KNW-04) |
| R4 outcome ≠ failure reason | implemented · tested locally | `t11` ×2, `t08`, `t16`, `t24` ×2, updated `test_knw01_ask.py` cases |
| R5 bounded recovery | implemented · tested locally · smoke (dev) | `t12` ×2, `t13` ×3, `t28` ×2 |
| R6 every wait ends; retry | implemented · tested locally | `store.test.ts` t14 ×3, t15, t17, t18, t27 ×2; `Ask.test.tsx` t18, t31; backend `t14` ×2, `t15` ×3 |
| R7 approved answers | implemented behind flag (off) · tested with fixtures | `t19` ×7, `t30`, `t16`; content approval **blocked** on the Sharia reviewer |
| R8 one card per reference | implemented · tested locally | backend `t20`; `Ask.test.tsx` t20 |

### T01–T32 (backend tests in `backend/tests/test_knw01_reliability.py` unless noted)

| ID | Status | Tests / note |
| --- | --- | --- |
| T01 | tested locally | `test_knw01_t01_suggestion_and_typed_reach_the_pipeline_identically`; `store.test.ts` "t01"; `Ask.test.tsx` "t01" |
| T02 | tested locally (fixtures); live content not run (live) | `test_knw01_t02_suggestions_send_their_text_and_language` ×6; `Ask.test.tsx` "t02" ×3 (ar/en/tl). Smoke (dev): «ما فضل الوضوء؟» and «كيف أعامل والديّ؟» answered |
| T03 | tested locally | `test_knw01_t03_what_next_is_the_learning_guide_by_click_or_typing` ×3; `Ask.test.tsx` "t03"; `store.test.ts` "t27: the learning guide gives up…" |
| T04 | tested locally · smoke (dev) | `test_knw01_t04_photo_forms_retrieve_the_same_evidence`; live reviewed form set not run (live) |
| T05 | tested locally | `test_knw01_t05_malik_negation_and_personal_details_are_kept`, `…_negated_question_gets_its_own_embedding`, `…_personal_question_never_matches_a_general_approved_answer` |
| T06 | tested locally with fixed fakes (20/20); live not run (live) | `test_knw01_t06_same_question_twenty_times_with_fixed_data` |
| T07 | tested locally | `test_knw01_t07_cache_key_is_exactly_the_embedded_text`, `test_knw01_t07_normalization_off_embeds_the_raw_text` |
| T08 | tested locally | `test_knw01_t08_healthy_empty_retrieval_is_no_source`; KNW-02 `s08` |
| T09 | tested locally | `test_knw01_t09_embeddings_down_text_channel_then_full_verification` |
| T10 | tested locally | `test_knw01_t10_threshold_checks_text_before_refusing_and_word_match_is_not_proof` |
| T11 | tested locally | `test_knw01_t11_verifier_down_is_unavailable`, `…_verifier_timeout_is_unavailable` |
| T12 | tested locally · smoke (dev) | `test_knw01_t12_wrong_language_is_repaired_once_then_fully_checked`, `…_marker_not_fixed_is_refused_safely` |
| T13 | tested locally | `test_knw01_t13_*` ×3, `test_knw01_unsupported_sentence_is_rejected`, `test_knw01_r1_unretrieved_reference_drops_answer` |
| T14 | tested locally | backend `t14` ×2; `store.test.ts` t14 ×3 (deadline, network, HTML 502) |
| T15 | tested locally | `test_knw01_t15_invalid_request_is_422_not_a_network_error` ×6, `…_rate_limit_is_429`, `…_unexpected_error_is_500_with_safe_code`; `store.test.ts` "t15" |
| T16 | tested locally | `test_knw01_t16_budget_exhausted_no_paid_call_and_not_retryable`, `…_budget_gone_serves_valid_approved_answer`, `test_knw01_budget_exceeded_gives_fixed_reply_without_paid_call` |
| T17 | tested locally | `store.test.ts` "t17" ×3; `Ask.test.tsx` "t17" |
| T18 | tested locally | `store.test.ts` "t18"; `Ask.test.tsx` "t18" |
| T19 | tested locally (fixtures) | `test_knw01_t19_invalid_approved_answer_is_never_served` ×6, `…_from_a_disabled_source_is_not_served` |
| T20 | tested locally | `test_knw01_t20_every_passage_of_one_reference_stays_for_verification`; `Ask.test.tsx` "t20" |
| T21 | tested locally | `test_knw01_t21_safety_routes_survive_normalization_and_repair` + existing R3–R6 tests in `test_knw01_ask.py` |
| T22 | tested locally | `test_knw01_t22_logs_link_stages_by_ask_id_without_text`, `test_knw01_answer_log_has_no_question_text` |
| T23 | tested locally | `test_knw01_t23_sql_error_is_a_failure_and_the_session_survives`, `…_answer_is_unavailable_while_clean_empty_is_no_source` |
| T24 | tested locally | `test_knw01_t24_*` ×2 |
| T25 | tested locally | `test_knw01_t25_tagging_failure_keeps_the_verified_answer` |
| T26 | tested locally | `test_knw01_t26_diagnostic_log_failure_still_returns_the_answer`, `…_required_effect_failure_is_503_without_partial_effects` |
| T27 | tested locally | `store.test.ts` "t27" ×2 |
| T28 | tested locally | `test_knw01_t28_*` ×2 |
| T29 | tested locally | `test_knw01_t29_source_removed_before_the_cards_is_not_answered` |
| T30 | tested locally (fixtures); live with real approved content not run (live, blocked on content) | `test_knw01_t30_faq_off_and_on_with_the_same_question` |
| T31 | tested locally | `store.test.ts` "t14/t31"; `Ask.test.tsx` "t31" ×2 |
| T32 | tested locally | `test_knw01_t32_migration_keeps_old_rows_and_the_previous_writer` (real Alembic upgrade on a scratch database with rows of the old schema, old-style inserts after upgrade), `test_knw01_t32_flags_off_service_keeps_working` |

Not run (live): §10.2 live repetition (30 covered + 10 negative questions, 20 repeats per suggestion, cold/warm cache), first-attempt rate, P95 latency, KNW-04 live run, the 5 % → 25 % → 100 % rollout (there is no staging; production is the only environment).

## 5. Files changed

Backend: `app/core/config.py`; `app/knowledge/ask.py`, `search.py`, `verify.py`, `embed.py`, `jobs.py`, `load.py`, `models.py`; new `app/knowledge/request_context.py`, `query_normalization.py`, `approved.py`, `source_policy.py`, `source_diagnostics.py`, `ai/errors.py`; `ai/client.py`, `ai/agents.py`, `ai/prompts/composer.md`; `eval/grade.py`, `eval/runner.py`; migration `alembic/versions/ef83fa7deee6_knw_01_ask_tracing.py`; tests `tests/knw_fakes.py`, `tests/test_knw01_ask.py` (expectations updated from `no_source` to `verification_failed` where the PRD changes them), `tests/test_knw02_search.py` (threshold test rewritten for R3), new `tests/test_knw01_reliability.py`, `tests/test_knw02_source_coverage.py`.
Frontend: `src/app/lib/api.ts`; `src/app/ask/store.ts`, `types.ts`, `parts.tsx`, `answer.ts`, new `suggestions.ts`; `src/app/pages/Ask.tsx`; `src/app/i18n/ar.ts`, `en.ts`, `tl.ts`; new tests `src/app/ask/store.test.ts`, `src/app/pages/Ask.test.tsx`.
Content: `content/knowledge/fixed-replies.json` (three replies reworded, `verification_failed` added; still draft), `content/knowledge/approved-answers.json` (`_about` only: `source_versions`, reviewer and date required; no answer added).
Docs: this report, `KNW-02-source-coverage-report.md`, `KNW-01.md`, `KNW-02-embeddings.md`, `docs/agents/sources.md` (islamqa row: answer-path status only), `docs/engineering/ai-agents.md` (retriever row), `docs/engineering/decisions-for-review.md`.

## 6. Commands and results (2026-10-06)

```text
# test database (own, development container)
docker exec rafeeq-dev-db psql -U rafeeq -d rafeeq -c "CREATE DATABASE rafeeq_test_rel"
docker exec rafeeq-dev-db psql -U rafeeq -d rafeeq_test_rel -c "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_trgm;"

cd backend
uv run alembic revision --autogenerate -m "knw_01 ask tracing"     # against the development DB only
uv run alembic upgrade head                                          # development DB only
uv run ruff check . && uv run ruff format --check .                  # All checks passed; 128 files already formatted
DATABASE_URL=postgresql+asyncpg://rafeeq:rafeeq_dev@127.0.0.1:5442/rafeeq_test_rel uv run pytest -q -p no:warnings
                                                                     # 333 passed (241 before + 92 new)

cd frontend
npx tsc -b                 # clean
npm run check:design       # 6/6 ✓
npx vitest run             # 124 passed (97 before + 27 new)
```

Baseline before the change: backend 240 passed at the start of the session (241 after a parallel commit added one); frontend 93 at the start (97 after parallel commits).

## 7. Measurements

| | Before (production, read-only, all recorded traffic) | After (smoke, dev database, 6 questions) |
| --- | --- | --- |
| Sourced attempts answered | 13 of 21 compositions (62 %); 8 shown as `no_source` | 5 of 6 answered; 2 of the 5 only after the repair; 1 English `no_source` (`insufficient_evidence`, see KNW-02 report §5) |
| Latency | answered avg 10.5 s (max 18.4 s); no_source avg 9.3 s | 4.1–18.7 s |
| External calls per question | — | 3–5 (cap 8) |
| Cost | — | $0.022 for the 6 questions |

Local AI spend of this session (development database, `knw_ai_calls`): **$0.0346** in total (1,000-passage islamqa embedding sample $0.0066; 6-question smoke $0.0222; with/without-islamqa comparison $0.0059; a few query embeddings). Production: no call made.

## 8. Effective production configuration before deploy (read-only)

- `KNW_ANSWER_SOURCES`, `KNW_*`, `AI_*`, `ASK_*`: **no override** in `/home/naser/.config/rafeeq/secrets.env` (only key names checked, never values), so the code defaults applied: answer sources `quranenc,hadeethenc,islamhouse_enc,binbaz`, `KNW_MIN_SIMILARITY` 0, `KNW_SEARCH_K` 8, `KNW_EMBED_JOB_LIMIT` 2000 every 15 min, daily ceiling $0.75 shared by answers and embeddings. A `printenv` of four of these names inside `rafeeq-backend-1` (read-only, no values exist) also returned nothing.
- Alembic revision `d1e2f3a4b5c6`. AI spend $0.1618 total, $0.1308 today (embedding $0.1321 total).
- Corpus counts: see KNW-02 report §2.

## 9. Production steps for the main session (in order)

1. Commit and deploy as usual (`infra/scripts/deploy.sh`). It runs `alembic upgrade head`, which applies `ef83fa7deee6`: nullable columns and two indexes on small tables (`knw_answer_log` 30 rows, `knw_ai_calls` 1,385 rows at the read); additive, the previous image still runs on it (T32).
2. No environment change is needed: the new defaults apply (`ASK_QUERY_NORMALIZATION_ENABLED` and `ASK_REPAIR_ENABLED` on, FAQ off, deadlines 45 s / 50 s, islamqa in the answer sources, embedding ceiling $1/day, job 4,000 passages every 10 min). Check the effective values (prints no secret):
   `docker exec rafeeq-backend-1 python -c "from app.core.config import get_settings as g; s=g(); print(s.knw_answer_sources, s.ai_embed_daily_budget_usd, s.knw_embed_job_limit, s.knw_embed_job_minutes, s.ask_query_normalization_enabled, s.ask_repair_enabled, s.ask_approved_faq_enabled, s.ask_deadline_seconds)"`
3. Embedding of islamqa and the source inventory: see the KNW-02 report §8 (no command to run; the scheduler does it; expected ≈ $0.63 and 4–8 h).
4. Watch outcomes with their reasons (read-only):
   `docker exec rafeeq-db-1 psql -U rafeeq -d rafeeq -tAc "SELECT outcome, reason_code, detail, count(*) FROM knw_answer_log WHERE ask_id IS NOT NULL GROUP BY 1,2,3 ORDER BY 4 DESC"`
5. When budget allows, run the KNW-04 live set (`python -m app.knowledge.eval run`) with FAQ off, after islamqa is embedded, and add the first-attempt / after-repair / unavailable split to this report.

## 10. Rollout and rollback

- Rollout: one step (owner: production is the only environment). Watch step 4; roll back on any unverified answer or invented reference shown (none possible by construction: every answer still passes the code checks and the support check).
- Rollback without deleting anything: set in `secrets.env` and recreate the backend (`docker compose -p rafeeq -f infra/compose.prod.yml up -d backend`, because `get_settings` is cached): `ASK_REPAIR_ENABLED=false`, `ASK_QUERY_NORMALIZATION_ENABLED=false`, `ASK_MAX_RETRIEVAL_ROUNDS=1`, `ASK_APPROVED_FAQ_ENABLED=false`. Error separation, deadlines and tracing have no flag and do not go back to misleading messages.
- Code rollback: `deploy.sh` keeps the `:previous` images; the migration is additive and never downgraded (its downgrade would drop diagnostic data).

## 11. Remaining limitations and blocked items

- **Blocked on people:** approved answers (R7) need texts written by the team and approved by the Sharia reviewer; fixed replies and phrase lists remain drafts; Tagalog strings need native review.
- **Not run (live):** every live measure in §4 and §7.
- Result de-duplication by `client_request_id` across workers (§6) is not built: the app never re-sends an attempt automatically and production runs one backend instance; the id is recorded for tracing.
- Relevance of full-text candidates is judged by the composer and verifier; a calibrated relevance gate waits for the full KNW-04 set (`KNW_MIN_SIMILARITY` stays 0).
- The host router in front of nginx (outside the repo) may have its own timeout; nginx `proxy_read_timeout` is 120 s, above both deadlines.
