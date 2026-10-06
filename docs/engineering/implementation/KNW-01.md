# KNW-01 sourced answer: implementation

**Feature:** `docs/domains/knowledge/features/KNW-01-sourced-answer.md` · **Plan:** `docs/domains/knowledge/implementation-plan.md` §1, §2.5–2.7, §4, §12 · **Agents:** `docs/engineering/ai-agents.md`
**Written:** 2026-10-05 by Claude (overnight build). Order of authority: `rules.md` → feature → plan → this file.

## 1. Rules → modules

| Rule / plan step | Module | What it does |
| --- | --- | --- |
| rules §2.8, R5, plan 4.2 (danger, no model) | `app/knowledge/ai/screen.py` | Normalised phrase match (ar/en/tl) from `content/knowledge/danger-phrases.json`. A hit returns `danger` before any model or network call |
| R6 (manipulation) | `app/knowledge/ai/screen.py` + router | Phrase screen for "ignore your instructions" patterns; the router can also say `manipulation`. Either one → polite fixed refusal |
| rules §2.1, plan 4.3 | `app/knowledge/ai/agents.py::route_question` | Fast model, temperature 0, JSON `{route, level}`. If the router says `danger`, it is danger (plan 2.6: either detector wins) |
| KNW-02 R4, plan 3.8, 4.4 | `app/knowledge/search.py::search` | Hybrid retrieval in the asker's language only: pgvector cosine (bge-m3) + Postgres full-text (`tsv` generated column), fused by reciprocal rank. Only sources in `KNW_ANSWER_SOURCES` |
| R1, rules §2.2, plan 4.5 | `agents.py::compose_answer` | Main model writes JSON `{answer, sources, sufficient}` from the passages only; scripture only as `{{q:ID}}` markers |
| R1 (error example), rules §2.3, plan 4.6 | `app/knowledge/verify.py` | Code checks 1–7, then a fast-model support check. Any failure → treated as no source |
| rules §1.3, plan 2.5 | `app/knowledge/ask.py::_source_card` | Quran/hadith text in the response comes from `knw_passages` by id (plus the Arabic ayah / Arabic hadith of the same record), never from the model |
| R2 | `ask.py` | Empty retrieval, `sufficient:false` or a failed check → fixed apology + «أريد إنسانًا» + `EscalationRequested` |
| R2 (outage example), plan 4.8 | `ask.py::_unavailable` | Main → fallback model → approved cached answer (`content/knowledge/approved-answers.json`, matched without a model) → fixed apology |
| R3 (personal) | `ask.py` | Code (not the model) appends the fixed referral sentence and sets `should_escalate = true` |
| R4 (disputed) | `ask.py` | Code appends the fixed «للعلماء في المسألة أقوال» sentence |
| R5 (danger) + permission example | `ask.py` | Fixed reply, `should_escalate = true`, `handoff.kind = "urgent"`, event `DangerDetected` **without question text or identity** |
| rules §2.6, plan 4.9 | `ask.py` | Provider receives only question + passages. `knw_answer_log` stores lang, route, level, outcome, latency, nothing else |
| rules §2.7 | `app/knowledge/ai/client.py` | Fallback model; spend guard (`AI_BUDGET_USD`, cumulative over `knw_ai_calls.cost_usd`) → fixed replies, no paid call |

## 2. Endpoint

`POST /api/ask` (guest allowed; bearer token optional). **Not streaming.** Reason: rules §2.3 and plan 4.6 require the whole answer to pass the verifier *before* anything is shown, so tokens cannot be streamed to the user. The UI shows a staged "searching the sources…" state instead; a typical answer is 3 model calls.

Request: `{"question": str 2..600, "lang": "ar"|"en"|"tl", "consent_objectives": bool = false}`
Rate limits: 8 per minute and 120 per day per client (user id, else IP) → `429 rate_limited`.

Response (plan §12.2 plus what the UI needs):

```jsonc
{
  "ask_id": "uuid4 (random, links the events; not stored with text)",
  "outcome": "answered|no_source|danger|refused|out_of_scope|unavailable|cached|learning_guide",
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
| `EscalationRequested` | `{"ask_id", "lang", "route", "reason": "no_source|personal|sensitive|unavailable"}` |
| `ObjectiveAsked` | `{"objective_id"}` (KNW-10 R5, consent only) |

## 3. Data

- `knw_passages.tsv`: new generated `tsvector` (english config for `en`, simple elsewhere; Arabic diacritics and tatweel removed, alef/ya/ta-marbuta folded) with a GIN index. Alembic `b3c1d2e4f5a6_knw_01_passage_fulltext`.
- `knw_ai_calls`: one row per model/embedding call (agent, model, tokens, `usage.cost`, ok, latency). Never prompt text.
- `knw_answer_log`: lang, route, level, outcome, latency.
- `content/knowledge/danger-phrases.json`, `fixed-replies.json`, `approved-answers.json`: status `draft` until مهند (and the CMP owner for danger phrases) approve them.

## 4. Settings (env)

`OPENROUTER_API_KEY`, `AI_MODEL_MAIN`, `AI_MODEL_FAST`, `AI_MODEL_FALLBACK`, `AI_EMBEDDING_MODEL`, `AI_BUDGET_USD` (10), `KNW_SEARCH_K` (8), `KNW_MIN_SIMILARITY` (0 until KNW-04 calibration), `KNW_QUOTE_MAX_WORDS` (6), `KNW_SCRIPTURE_OVERLAP_WORDS` (5), `KNW_ANSWER_SOURCES` (`quranenc,hadeethenc,islamhouse_enc,binbaz`; islamqa excluded until the owner decides on its pending permission).

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

## 6. Open decisions (recorded, not blocking)

- Danger phrase list and the five fixed replies are drafts written by Claude; مهند and the CMP owner must approve them (plan 4.2, 4.7).
- `KNW_MIN_SIMILARITY` stays 0. First calibration (plan 5.5, `python -m app.knowledge.eval calibrate`, 2026-10-05, 31-question starter set): answerable questions scored 0.51–0.76, the two "no source" questions 0.57 and 0.63, so the groups overlap and a threshold of 0.63 would drop half the answerable questions. Until the full 80-question set separates them, the gates are the composer's `sufficient` and the verifier (plan 4.4).
- Helpline numbers per country: none shown (feature open question; `DangerHelpPanel` never invents numbers).
- `sensitive` route: answered from sources like `general`, with `should_escalate = true` so the human button is offered (the feature has no example; plan §4.3 only says it continues to retrieval).
