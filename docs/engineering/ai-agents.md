# AI agents

**Status:** built 2026-10-05 (overnight) by Claude. Owner to approve: مسلّم بن عبدالعزيز العمير (Knowledge & Ask).
**Order of authority:** `docs/agents/rules.md` → feature documents → `docs/domains/knowledge/implementation-plan.md` → `docs/engineering/plan.md` §7–8 → this file.
**Code:** `backend/app/knowledge/ai/` (client, prompts, agents, screens, text checks), `search.py`, `verify.py`, `ask.py`, `tasks.py`, `embed.py`, `eval/`.

Confidence marks: ✅ measured or verified on 2026-10-05 · 💬 team decision · ⚠️ estimate or proposal.

## 1. Common guards (every agent)

| Guard | Where | What it does |
| --- | --- | --- |
| One client | `ai/client.py` | OpenRouter (`/chat/completions`, `/embeddings`), JSON mode, temperature 0, `reasoning` off, providers that keep or train on prompts excluded (`provider.data_collection = "deny"`) |
| Model tiers | settings `AI_MODEL_MAIN`, `AI_MODEL_FAST`, `AI_MODEL_FALLBACK` | Each agent names a tier, never a model. A transport failure moves to the fallback model; an output that is not valid JSON or fails the agent's contract is retried once on the same model (plan 4.6 check 1) |
| Spend guard | `client.guard()` | Before every paid call: cumulative `knw_ai_calls.cost_usd` + $0.005 must be below `AI_BUDGET_USD` (10 by the product owner). Otherwise `BudgetExceeded` → the caller returns its fixed reply; no request is sent |
| Cost record | `knw_ai_calls` | One row per call: agent, model, tokens, the `usage.cost` OpenRouter returns, ok, latency. Never prompt text, never identity |
| Data only | prompts in `ai/prompts/*.md` | User text, passages and summaries are fenced (`<<< >>>`) and every prompt says they are data, not instructions (rules.md §2.5) |
| No identity | `agents.py` | Inputs are the question and passages, the card text, or the learning summary. No user id, name, IP or history is ever placed in a prompt (rules.md §2.6) |
| No scripture from models | composer, verifier, UI | Quran and hadith words are shown only from `knw_passages` by id (rules.md §1.3) |

## 2. The agents

Eleven parts, seven of them model calls. Costs are averages of real calls recorded in `knw_ai_calls` on 2026-10-05 ✅.

| # | Agent | Feature | Model | Input → output | Prompt | Guards | Cost / call | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Danger screen | KNW-01 R5 | none | question → danger yes/no | `content/knowledge/danger-phrases.json` (ar/en/tl, draft for review) | Runs first; a hit returns the fixed danger reply and `DangerDetected` (no text) with no network at all | $0 | `test_knw01_r5_*`, `test_knw01_every_danger_phrase_routes_to_human_without_network` |
| 2 | Rule-bypass and guide screen | KNW-01 R6, KNW-10 R3 | none | question → refuse / learning guide | `content/knowledge/screen-phrases.json` | Fixed polite refusal; "what should I learn now?" goes to agent 8, never to Sharia sources | $0 | `test_knw01_r6_*`, `test_knw10_r3_what_next_in_chat_asks_for_summary` |
| 3 | Router | KNW-01, rules §2.1 | fast | question + language → `{route, level}` (7 routes, A–D) | `router.md` | Contract check; `danger` from the router also routes to a human (plan 2.6: either detector wins) | $0.00003 · 1.3 s | `test_knw01_r5_router_danger_*`, `test_knw01_r6_router_manipulation_*` |
| 4 | Retriever | KNW-02 R4, plan 3.8 | `baai/bge-m3` embeddings | question → ≤ 8 passages in the asker's language | none | Language filter; answer sources only (islamqa excluded until the owner decides); cosine threshold `KNW_MIN_SIMILARITY` (0 until calibrated); full text alone if embedding fails | < $0.000001 · 1.1 s | `test_knw02_*` |
| 5 | Composer | KNW-01 R1, R3, R4 | main | question, route, level, passages → `{sufficient, answer with {{q:ID}}, sources}` | `composer.md` | Passages only; markers instead of scripture; Latin script for en/tl; no ruling on personal cases; no preference on disputed ones | $0.0012 · 6.8 s (median) | `test_knw01_r1_*`, `test_knw01_r3_*`, `test_knw01_r4_*` |
| 6 | Verifier | KNW-01 plan 4.6 | code + fast | composer output + retrieved passages → pass / reasons | `support_check.md` | Code checks 1–7 (ids retrieved, sufficient, no Arabic in en/tl, no long quote, language, no copied scripture, no malformed marker), then the model support check; fails closed | $0.00014 · 1.2 s | `test_knw01_r1_unretrieved_*`, `test_knw01_arabic_letters_*`, `test_knw01_long_quote_*`, `test_knw01_unsupported_*`, `test_knw01_malformed_marker_*` |
| 7 | Mistake explainer + checker | LRN-03 R6, KNW-10 R1–R2 | main + fast | approved card, exercise, answer, language → `{text}` or null | `explainer.md`, `support_check.md` | Approved snapshot only; reviewer block honoured; ≤ 60 words, no quotes, no attribution, no transliterated dhikr, no Arabic in en/tl; support check; null on any failure | $0.00007 + $0.00005 · 2–3 s | `test_knw10_r1_*`, `test_knw10_r2_*` |
| 8 | Learning guide + checker | LRN-07, KNW-10 R3–R4 | fast + fast | learning summary (ids resolved to approved names) → `{text}` or null | `guide.md`, `support_check.md` | ≤ 3 sentences; every «name» must be from the summary; no attribution, blame or Arabic in en/tl; support check; summary never stored | ≈ $0.00006 ⚠️ | `test_knw10_r3_*`, `test_knw10_r4_*` |
| 9 | Objective tagger | LRN-10 R5, KNW-10 R5 | fast | answered question + approved objectives → one id or null | `tagger.md` | Only with the learner's consent and only on `general`/`disputed`; id must be in the list; event `ObjectiveAsked` carries the id only | ≈ $0.0001 ⚠️ (≈1.5k tokens of objectives) | `test_knw10_r5_*` |
| 10 | Bare baseline | KNW-04 R2 | main | question → free text | `bare.md` | Test only, never shown to users | ≈ $0.0003 ⚠️ | `test_knw04_*` |
| 11 | Embedder (job + CLI) | KNW-02 §3.6 | `baai/bge-m3` | passage text (≤ 6,000 chars) → 1024-d vector | none | Resumable (NULL vectors only), spend-guarded per batch, back-off on 429, scheduler batch of 2,000 every 15 min in production | $0.00014 per batch of ~50 hadith | `test_knw02_embed_job_*` |

Per answered question: router + embedding + composer + verifier ≈ **$0.0015 and 9–15 s** ✅ (measured on the live corpus). Danger, refusal and guide requests cost nothing. At $10 the budget covers roughly 6,000 answered questions after the corpus is embedded.

Not built from plan §7: "content preparation" and "glossary suggester" (offline team tools; no feature document asks for them yet).

## 3. Models

### 3.1 Prices (OpenRouter, measured 2026-10-05 from `/api/v1/models`) ✅

| Model | In $/M | Out $/M | Context | JSON mode |
| --- | --- | --- | --- | --- |
| `google/gemma-4-31b-it` | 0.09 | 0.34 | 262k | yes |
| `google/gemma-4-26b-a4b-it` (MoE, 4B active) | 0.0765 | 0.255 | 262k | yes |
| `deepseek/deepseek-v4-pro` | 0.2088 | 0.4176 | 1M | yes |
| `qwen/qwen3.8-flash` | 0.15 | 0.47 | 1M | yes |
| `baai/bge-m3` (embeddings, 1024-d) | 0.01 | — | 8k | — |

### 3.2 Bake-off (run 2026-10-05, `python -m app.knowledge.eval.bakeoff`) ✅

Same prompts as production. Tasks: 9 router messages (3 per language, 6 routes), 3 composer questions (ar/en/tl, real retrieved passages), 3 mistake explanations (one card, three languages). "Checks" are the production code checks (plan 4.6 for the composer, KNW-10 R2 for the explainer).

| Model | Valid JSON | Router correct | Composer passed checks | Explainer passed checks | Cost (15 calls) | Median / max latency |
| --- | --- | --- | --- | --- | --- | --- |
| gemma-4-31b-it | 15/15 | 9/9 | 2/3 | 3/3 | $0.0027 | 1.8 s / 18.9 s |
| gemma-4-26b-a4b-it | 15/15 | 9/9 | 2/3 | 3/3 | $0.0018 | 1.1 s / 3.9 s |
| deepseek-v4-pro | 15/15 | 9/9 | 1/3 (English: "insufficient") | 3/3 | $0.0107 | 1.6 s / 7.8 s |
| qwen3.8-flash | 15/15 | 9/9 | 1/3 (English: "insufficient") | 3/3 | $0.0036 | 1.6 s / 3.4 s |

Round 2, composer only, 9 questions (3 per language), after tightening the composer prompt against retelling hadith wording:

| Model | Passed checks | Cost | Median / max latency |
| --- | --- | --- | --- |
| gemma-4-31b-it | 7/9 | $0.0103 | 6.6 s / 14.1 s |
| gemma-4-26b-a4b-it | 6/9 (one English "insufficient", and in round 1 it put the shahada in quotation marks) | $0.0040 | 3.6 s / 9.9 s |

What failed: every Arabic failure was plan 4.6 check 7 (a run of words copied from a retrieved hadith). Measured overlaps were 4, 5, 5 and 12 words; the 12-word one was a real copy of hadith wording. Decisions from this:
- **`KNW_SCRIPTURE_OVERLAP_WORDS` 5 → 6** (still blocks the 12-word copy; 5 rejected sentences such as «صلاة الجماعة أفضل من صلاة»). The Sharia reviewer reads every Arabic answer in KNW-04 (plan §9), which is the safety net this check cannot be.
- **Common formulae** (shahada, basmala, salawat, taraddi) are left out of the overlap check: saying them is not quoting a passage.
- Total spend of both rounds: $0.03.

### 3.3 Choice

| Tier | Model | Why |
| --- | --- | --- |
| main (composer, explainer, bare baseline) | `google/gemma-4-31b-it` | Best pass rate on the composer, answered English where two others said "insufficient", good Tagalog; 2.5× the cost of the 26B but still ≈ $0.001 per answer |
| fast (router, verifier, checkers, guide, tagger) | `google/gemma-4-26b-a4b-it` | Same router accuracy (9/9) and explainer checks at the lowest cost and latency; these tasks are short classification or checking |
| fallback | `deepseek/deepseek-v4-pro` | A different model family, so an outage or regression of one vendor does not take both down; 9/9 on the router. It costs 4× more per call (it bills more tokens than it shows), acceptable because it runs only when the main model fails. `qwen/qwen3.8-flash` is the cheaper alternative if the fallback is used often |
| embeddings | `baai/bge-m3` | Plan 2.3; verified on OpenRouter at $0.01/M with 1024-d output, so no schema change |

Latency is the weak point: a sourced answer takes 9–15 s, mostly the composer. The UI shows staged progress ("reading", "searching the sources", "checking the answer"). Streaming is not possible because the verifier must pass the whole answer first (rules §2.3).

## 4. Spend so far (2026-10-05)

Recorded at 2026-10-06 00:40 UTC: development database 0.3896 USD over 1480 calls (bake-off, reliability runs, embeddings of the sample); production 0.0401 USD over 278 calls. The live figure is `select sum(cost_usd) from knw_ai_calls` or the `total AI spend` line printed by the CLIs.

## 5. How each agent is tested

- Unit and behaviour tests (`backend/tests/test_knw01_ask.py`, `test_knw10_tasks.py`, `test_knw02_search.py`, `test_knw04_eval.py`): OpenRouter is replaced by recorded response envelopes (`tests/fixtures/openrouter/`) with scripted contents, through `respx`, which refuses any other network call. Passage texts are dummies (plan rule 6).
- Real-model behaviour: the KNW-04 reliability run (`python -m app.knowledge.eval run`), report in the database and at `GET /api/knowledge/eval/latest` (team).
- Model choice: the bake-off above, re-runnable with `python -m app.knowledge.eval.bakeoff`.
