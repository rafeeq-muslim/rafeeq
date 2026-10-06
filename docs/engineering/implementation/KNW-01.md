# KNW-01 sourced answer: implementation

**Feature:** `docs/domains/knowledge/features/KNW-01-sourced-answer.md` · **Plan:** `docs/domains/knowledge/implementation-plan.md` §1, §2.5–2.7, §4, §12 · **Agents:** `docs/engineering/ai-agents.md`
**Written:** 2026-10-05 by Claude (overnight build). **Updated 2026-10-06** for the reliability PRD (`docs/domains/knowledge/features/KNW-01-chatbot-reliability-prd.md`; report `KNW-01-chatbot-reliability-report.md`) and KNW-02 source coverage (`KNW-02-source-coverage-report.md`). Order of authority: `rules.md` → feature → plan → this file.

## 1. Rules → modules

| Rule / plan step | Module | What it does |
| --- | --- | --- |
| rules §2.8, R5, plan 4.2 (danger, no model) | `app/knowledge/ai/screen.py` | Normalised phrase match (ar/en/tl) from `content/knowledge/danger-phrases.json`. A hit returns `danger` before any model or network call |
| R6 (manipulation) | `app/knowledge/ai/screen.py` + router | Phrase screen for "ignore your instructions" patterns; the router can also say `manipulation`. Either one → polite fixed refusal |
| rules §2.1, plan 4.3 | `app/knowledge/ai/agents.py::route_question` | Fast model, temperature 0, JSON `{route, level}`. If the router says `danger`, it is danger (plan 2.6: either detector wins) |
| KNW-02 R4, plan 3.8, 4.4 | `app/knowledge/search.py::retrieve` | Hybrid retrieval in the asker's language only: pgvector cosine (bge-m3) + Postgres full-text (`tsv` generated column), fused by reciprocal rank, ties broken by id; the owner's near-tie preference for islamqa exists but is off by default (`KNW_PREFERRED_SOURCE` empty since live source access v3: no site preferred by its name). Sources from `app/knowledge/source_policy.py` (configured ∩ present ∩ `index` mode). Returns a `RetrievalResult` (status complete/degraded/unavailable, counts, per-source counters) |
| Reliability R2 | `app/knowledge/query_normalization.py` | Search-only canonical form (version `qn1`): NFKC, no diacritics/tatweel/punctuation, glued openers («مامعنى») split at the first word only; nothing dropped. Screens run on it too; router and composer get the question as asked |
| Reliability §14.2 | `app/knowledge/request_context.py` | One budget per question: ≤ 8 external calls (retries and fallback included), ≤ 2 retrieval rounds, ≤ 2 compose rounds, 45 s monotonic deadline passed to every call; `ask_id` on every cost row |
| R1, rules §2.2, plan 4.5 | `agents.py::compose_answer` | Main model writes JSON `{answer, sources, sufficient}` from the passages only; scripture only as `{{q:ID}}` markers |
| R1 (error example), rules §2.3, plan 4.6 | `app/knowledge/verify.py` | Code checks 1–7, then a fast-model support check. Returns `passed`, `rejected` (codes) or `unavailable` (checker could not run); nothing is shown unless `passed` |
| Reliability R5 | `ask.py` + `agents.py::repair_answer` | A content rejection gets one bounded repair from the same passages (flag `ASK_REPAIR_ENABLED`), then every check again; an unchanged repair is refused without re-checking; `insufficient` alone gets the one expansion round instead |
| rules §1.3, plan 2.5 | `app/knowledge/ask.py::_source_card` | Quran/hadith text in the response comes from `knw_passages` by id (plus the Arabic ayah / Arabic hadith of the same record), never from the model |
| R2 | `ask.py` | Healthy search with no or insufficient evidence → `no_source`; a rejected composition → `verification_failed`; an outage, deadline, budget or degraded search without evidence → `unavailable`. Each: fixed reply + «أريد إنسانًا» + `EscalationRequested` (reason = the outcome) |
| R2 (outage example), plan 4.8 | `ask.py`, `approved.py` | Main → fallback model → (flag `ASK_APPROVED_FAQ_ENABLED`, on) a valid approved answer, exact match only while the router is down → `unavailable` |
| R3 (personal) | `ask.py` | Code (not the model) appends the fixed referral sentence and sets `should_escalate = true` |
| R4 (disputed) | `ask.py` | Code appends the fixed «للعلماء في المسألة أقوال» sentence |
| R5 (danger) + permission example | `ask.py` | Fixed reply, `should_escalate = true`, `handoff.kind = "urgent"`, event `DangerDetected` **without question text or identity** |
| rules §2.6, plan 4.9 | `ask.py` | Provider receives only question + passages. `knw_answer_log` stores lang, route, level, outcome, latency, and (reliability §7) `ask_id`, reason code, internal detail code, entry point, suggestion id, client request id and a trace of stage names, durations, counts and codes; never question, answer or passage text |
| rules §2.7 | `app/knowledge/ai/client.py` | Fallback model; spend guard (`AI_BUDGET_USD`, cumulative over `knw_ai_calls.cost_usd`) → fixed replies, no paid call |

## 2. Endpoint

`POST /api/ask` (guest allowed; bearer token optional). **Not streaming.** Reason: rules §2.3 and plan 4.6 require the whole answer to pass the verifier *before* anything is shown, so tokens cannot be streamed to the user. The UI shows a staged "searching the sources…" state instead; a typical answer is 3 model calls.

Request: `{"question": str 2..600 after trim, "lang": "ar"|"en"|"tl", "consent_objectives": bool = false, "client_request_id"?: [A-Za-z0-9_-]{8,64}, "entrypoint"?: "typed"|"suggestion", "suggestion_id"?: [a-z0-9_]{1,40}}`. The last three are for tracing only and never change the answer; a suggestion sends its shown text (ids `learning_next`, `shahada_meaning`, `wudu_virtue`, `parents_treatment`).
HTTP: `422` invalid body; `429 rate_limited` (8 per minute and 120 per day per client: user id, else IP); `500 internal_error` (unexpected, logged with a safe code); `503 effects_failed` (a required event could not be saved; nothing half-saved). Knowledge results are always `200` with the contract below.
The app waits at most 50 s per attempt (`ASK_CLIENT_DEADLINE_MS`, refresh included); the server stops at `ASK_DEADLINE_SECONDS` (45 s).

Response (plan §12.2 plus what the UI needs):

```jsonc
{
  "ask_id": "uuid4 (random, links the events; not stored with text)",
  "outcome": "answered|cached|no_source|verification_failed|unavailable|danger|refused|out_of_scope|learning_guide",
  "reason_code": "retrieval_empty|insufficient_evidence|verification_rejected|temporarily_unavailable|deadline_exceeded|service_limit" | null,
  "retryable": bool,  // false for service_limit (budget, missing key) and every non-failure
  "route": "general|disputed|personal|sensitive|danger|manipulation|out_of_scope",
  "level": "A|B|C|D|null",
  "answer": "text with {{q:<passage id>}} markers, or the fixed reply",
  "sources": [{"id","source_id","source_name","kind","lang","ref","ref_label","quote_text","arabic_text","translation","grade","attribution","origin_url","version"}],
  "notes": ["fixed sentences added by code (personal referral / disputed)"],
  "should_escalate": bool,
  "handoff": {"kind": "urgent|escalation", "lang": "..."} | null,
  "objective_id": "u1-l3-o2" | null
}
```

**CMP hand-off contract** (Companion builds the human side): on `danger`, the UI shows `DangerHelpPanel` only and links «أريد إنسانًا» to `/mentor/help?kind=urgent&from=ask&ask=<ask_id>` (Companion opens the urgent request on arrival). On `no_source`, `unavailable`, personal and sensitive answers it links to `/mentor/help?kind=escalation&from=ask&ask=<ask_id>`; the always-visible top-bar button links to `/mentor/help?from=ask`. `ask_id` is random and links the request to the `DangerDetected`/`EscalationRequested` event only. The question text is never in the URL, the event or the request; the user retypes or pastes it if they choose (rules §2.9). Events published by KNW (outbox, `source="KNW"`):

| Event | Payload |
| --- | --- |
| `DangerDetected` | `{"ask_id", "lang", "detector": "phrase|router"}` |
| `EscalationRequested` | `{"ask_id", "lang", "route", "reason": "no_source|verification_failed|unavailable|personal|sensitive"}` |
| `ObjectiveAsked` | `{"objective_id"}` (KNW-10 R5, consent only) |

## 3. Data

- `knw_passages.tsv`: new generated `tsvector` (english config for `en`, simple elsewhere; Arabic diacritics and tatweel removed, alef/ya/ta-marbuta folded) with a GIN index. Alembic `b3c1d2e4f5a6_knw_01_passage_fulltext`.
- `knw_ai_calls`: one row per model/embedding call (agent, model, tokens, `usage.cost`, ok, latency). Never prompt text.
- `knw_answer_log`: lang, route, level, outcome, latency; since Alembic `ef83fa7deee6` (nullable, additive): `ask_id` (indexed), `reason_code`, `detail`, `entrypoint`, `suggestion_id`, `client_request_id`, `trace` (JSONB, no text). `knw_ai_calls.ask_id` links model calls to the request.
- `content/knowledge/danger-phrases.json`, `fixed-replies.json`, `approved-answers.json`: status `draft` until مهند (and the CMP owner for danger phrases) approve them.

## 4. Settings (env)

`OPENROUTER_API_KEY`, `AI_MODEL_MAIN`, `AI_MODEL_FAST`, `AI_MODEL_FALLBACK`, `AI_EMBEDDING_MODEL`, `AI_BUDGET_USD` (10, everything), `AI_DAILY_BUDGET_USD` (0.75, answers and other calls), `AI_EMBED_DAILY_BUDGET_USD` (1.00, the embedding job), `KNW_SEARCH_K` (8), `KNW_MIN_SIMILARITY` (0 until KNW-04 calibration; drops weak vector hits only), `KNW_QUOTE_MAX_WORDS` (6), `KNW_SCRIPTURE_OVERLAP_WORDS` (6), `KNW_ANSWER_SOURCES` (`quranenc,hadeethenc,islamhouse_enc,binbaz,islamqa`; islamqa is a main source by the owner's decision of 2026-10-06), `KNW_PREFERRED_SOURCE` (default empty = no preference; `islamqa` restores the 2026-10-06 near-tie decision) and `KNW_NEAR_TIE_EPSILON` (0.0006; 0 = off), `KNW_EMBED_JOB_LIMIT` (4000) and `KNW_EMBED_JOB_MINUTES` (10).

Reliability (PRD §14.5): `ASK_DEADLINE_SECONDS` (45), `ASK_MAX_EXTERNAL_CALLS` (8), `ASK_MAX_RETRIEVAL_ROUNDS` (2), `ASK_MAX_COMPOSE_ROUNDS` (2), `ASK_QUERY_NORMALIZATION_ENABLED` (true), `ASK_REPAIR_ENABLED` (true), `ASK_APPROVED_FAQ_ENABLED` (true: serves only reviewer-approved entries). Error separation, deadlines and tracing have no flag.

## 5. Tests (`backend/tests/test_knw01_ask.py`; model calls answered by recorded fixtures through `respx`, no network)

| Feature example | Test |
| --- | --- |
| R1 ex1 answer in English with source card | `test_knw01_r1_answers_from_retrieved_passages_with_source_card` |
| R1 ex2 ayah text from the database | `test_knw01_r1_quran_text_comes_from_database_not_model` |
| R1 ex3 unretrieved reference drops the answer | `test_knw01_r1_unretrieved_reference_drops_answer` |
| R2 ex1 no source → apology + human | `test_knw01_r2_no_source_apologizes_and_offers_human` |
| R2 ex2 model outage → apology / cached approved answer | `test_knw01_r2_outage_gives_apology_not_error`, `test_knw01_r2_outage_serves_cached_approved_answer` |
| R3 personal → texts + referral | `test_knw01_r3_personal_case_refers_without_ruling` |
| R4 disputed → views, no preference | `test_knw01_r4_disputed_adds_views_differ_note` |
| R5 ex1 danger → no content, human, event | `test_knw01_r5_danger_phrase_routes_to_human_without_model` |
| R5 ex2 urgent request without text | `test_knw01_r5_danger_event_carries_no_question_text` |
| R6 manipulation refused | `test_knw01_r6_manipulation_is_refused_politely` |

Plus plan 4.12: every phrase in the danger file returns `danger` with network blocked; Arabic letters in an English answer are rejected; budget exceeded → fixed reply and no HTTP call; `knw_answer_log` holds no question text.

Reliability PRD T01–T32: `backend/tests/test_knw01_reliability.py`, `frontend/src/app/ask/store.test.ts`, `frontend/src/app/pages/Ask.test.tsx` (table in `KNW-01-chatbot-reliability-report.md` §4). Content violations that the tests above used to expect as `no_source` now expect `verification_failed`.

## 6. Open decisions (recorded, not blocking)

- Danger phrase list and the five fixed replies are drafts written by Claude; مهند and the CMP owner must approve them (plan 4.2, 4.7).
- `content/knowledge/approved-answers.json` holds 9 answers (the three starter suggestions in ar, en, tl), all approved by the Sharia reviewer مهند بن صالح الفوزان on 2026-10-06, each with `source_versions`. They are served by default (`ASK_APPROVED_FAQ_ENABLED` true; false turns it off); a draft or returned entry, or one without a reviewer and a date, is never served.
- `KNW_MIN_SIMILARITY` stays 0. First calibration (plan 5.5, `python -m app.knowledge.eval calibrate`, 2026-10-05, 31-question starter set): answerable questions scored 0.51–0.76, the two "no source" questions 0.57 and 0.63, so the groups overlap and a threshold of 0.63 would drop half the answerable questions. Until the full 80-question set separates them, the gates are the composer's `sufficient` and the verifier (plan 4.4).
- Helpline numbers per country: the danger panel in Ask shows the verified helplines bundled in the app (`frontend/src/app/companion/helplineNumbers.ts`, Saudi Arabia and the Philippines, verified 2026-10-06); no unverified number is listed.
- `sensitive` route: answered from sources like `general`, with `should_escalate = true` so the human button is offered (the feature has no example; plan §4.3 only says it continues to retrieval).

## 7. The conversation on the device (R7)

Why: the product owner reported that chat messages disappear for no reason (2026-10-06). The thread lived in page memory only (`ask/store.ts`), so every reload emptied it, and `lib/pwa.ts` reloads the page by itself when a new version takes over (every deploy), except inside a lesson, review or placement.

| Rule / example | Where | How |
| --- | --- | --- |
| R7 reload keeps the thread and the draft | `frontend/src/app/ask/session.ts`, `ask/store.ts` | The store starts from `loadSession()` and writes `rafeeq.ask.thread` / `rafeeq.ask.draft` to **sessionStorage** (this tab only) when turns or draft change. Stored as `{v, at, data}`; `ASK_SESSION_VERSION` = 1 with a `migrate` step for later formats; an unknown or broken copy opens an empty chat. Never localStorage, never the server |
| R7 an answer cut by a reload | `session.ts::restore` | A stored `pending` turn (or a `learning_guide` reply whose text was not written yet) comes back as an error turn with its snapshot, so «أعد المحاولة» re-sends the same question into the same message |
| R7 update does not reload under a conversation | `lib/pwa.ts::holdUpdateWhile`, `updateMustWait`; `store.ts::conversationHoldsUpdate` | The automatic reload waits (update bar shown) on `/ask` with turns or a draft, anywhere while an answer is on its way, and anywhere while a conversation exists that is not kept on the device (quick exit / discreet mode). `pwa.ts` does not import the Ask store; the store registers its reason |
| R7 quick exit / discreet mode: nothing written | `session.ts::keepsOnDevice` | No write while `quickExit` or `discreet` is on; turning either on removes the copy at once (subscription to the device store), turning it off writes it again |
| R7 what clears it | `lib/privacy.ts` | `exitNow` removes the copy (Back after a quick exit reloads the app); `wipeDevice` and `signOutAndErase` already clear sessionStorage |
| R7 one visit, one day | `session.ts` | sessionStorage ends with the tab; a copy idle for `ASK_SESSION_IDLE_MS` (24 h) is dropped on load (a browser restoring old tabs). When storage is full the page keeps everything and the copy keeps the latest messages |

Not changed: the request still carries one question and no history; `deviceData()` (R6 export) reads localStorage only, so the session copy is not in the export.

Follow-up (2026-10-06, branch `knw-01-r7-ask-update-wording`). The lead approved the defaults as built, under the product owner's blanket approval (feature doc open questions 1–3): the conversation lives for the visit and 24 h idle; no write while quick exit or discreet mode is on (either); not in the data export.

| Follow-up | Where | How |
| --- | --- | --- |
| The update bar under a conversation no longer says «تقدّمك في الدرس محفوظ» | `AppLayout.tsx::UpdateBar` (now exported), `app.updateWaiting` (ar/en/tl) | The bar reads `app.updateReady` only when `inLearningFlow(path)` (lesson, review, placement); everywhere else it reads `app.updateWaiting` «نسخة جديدة من رفيق. حدّث حين تنتهي.». "Everywhere else" is the Ask holds above and also the offline wait of PLT-15 R6 on any other screen, which showed the lesson wording too |
| The policy mentions the conversation | `pages/Privacy.tsx`, `policy.device.ask`, `policy.revisedAsk` | One sentence under «ما نحفظه على جهازك وحده» and its own dated line; see `PLT-05.md` §2.3 |

English and Tagalog strings written by Claude from the Arabic.

Tests: `frontend/src/app/ask/updateBar.rules.test.tsx` (bar text on Ask vs lesson, review and placement, in ar/en/tl), `platform.rules.test.tsx` (`plt05_r1_policy_says_where_the_ask_conversation_stays_…`, `plt05_r1_the_device_section_shows_the_ask_sentence_…`), `frontend/src/app/ask/session.rules.test.ts` (reload, cut answer, retry, privacy modes, quick exit, erase, sign-out, idle day, format version, full storage, update wait), `frontend/src/app/pages/Ask.kept.rules.test.tsx` (navigation, lesson help, notebook hand-off, language, theme, discreet switch, sign-in, retry, offline/online).
