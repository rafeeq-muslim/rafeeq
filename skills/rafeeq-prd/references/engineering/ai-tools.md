# AI tool layer (proposed)

**Status:** proposal, 2026-10-05. Written by Claude at the product owner's request. Not built yet. Owner to approve: مسلّم بن عبدالعزيز العمير (Knowledge & Ask).
**Applies to:** the Ask assistant (KNW-01), the assistant's learning tasks (KNW-10), the reliability test (KNW-04), content authoring and review (KNW-05/07), and development agents (Claude Code and similar).
**Order of authority:** `docs/agents/rules.md` → feature documents → `docs/domains/knowledge/implementation-plan.md` → this file.

Confidence marks: ✅ verified at the source on 2026-10-05 · 💬 team decision · ⚠️ proposal or unverified.

## 1. Principles

1. **One set of functions, two transports.** Each tool is one Python function in `backend/app/knowledge/tools/` (proposed). It is exposed to the model as an OpenRouter/OpenAI-style function definition, and the same functions can be mounted as a local MCP server (stdio) for development agents. The schemas below are the contract for both.
2. **At runtime, the answer path reads only our own database.** `search_passages`, `get_ayah`, `get_hadith` and `get_passage` read `knw_passages`, which is filled by the normalizers in `backend/app/knowledge/sources/` (KNW-02). A user's question is **never** sent to a third-party site (HadeethEnc search, Dorar, IslamHouse search). This follows `rules.md` §2.6 (send the model provider only the question and passages) and §4 (no third-party calls that reveal usage). It also gives the model text that matches our stored record exactly (`rules.md` §1.3).
3. **Live third-party APIs are used only server-side, without user text, and cached.** IslamHouse metadata for the library is curated by the team, not searched with user questions. Live calls happen in ingestion jobs or in team-only tools.
4. **Tools return source text unchanged and a source card.** Every result carries `id`, `source_id`, `version`, `origin_url`, and the licence mode. The composer may quote only by `{{q:ID}}` (plan §12.2), and the verifier checks each ID against what the tools returned in this turn (`rules.md` §2.3).
5. **Only `index`-mode sources are searchable.** The `knw_sources.mode` column gates every tool. Sources in `link` mode can appear only as links (KNW-02 R1). Sources whose index mode is an owner decision with permission pending (islamqa, see `docs/agents/sources.md`) carry `licence_status: "pending_permission"` in results. The product owner decides whether they show in production answers.

## 2. Tools

Common types:

```jsonc
// Passage (what every read/search tool returns)
{
  "id": "hadeethenc:tl:2962",          // knw_passages.id
  "source_id": "hadeethenc",
  "kind": "hadith",                    // quran_arabic | quran_translation | quran_tafsir | hadith | fatwa | article | book_section | story | benefit | glossary
  "lang": "tl",
  "ref": {"hadith_id": 2962},
  "quote_text": "…",                   // exactly as stored
  "context_text": "…",                 // source's own explanation/question/title
  "meta": {"grade": "Tumpak", "attribution": "…"},
  "version": "api-v1@2026-10-05",
  "origin_url": "https://hadeethenc.com/tl/browse/hadith/2962",
  "licence_status": "ok" | "pending_permission",
  "score": 0.71                        // search only
}
```

### 2.1 `search_passages` (runtime, KNW-01/10)

| | |
| --- | --- |
| Input | `{"query": string (3–500 chars), "lang": "ar"\|"en"\|"tl", "kinds": [kind] (optional), "sources": [source_id] (optional), "k": int 1–12 (default `KNW_SEARCH_K`=8)}` |
| Output | `{"passages": [Passage], "below_threshold": bool}`; empty list when nothing passes `KNW_MIN_SIMILARITY` (KNW-02 R4) |
| Backed by | `knw_passages` + pgvector (bge-m3 1024-d), filtered by `lang` and `mode='index'` |
| Rate/cost | One embedding call per query (OpenRouter, counts against the AI budget); DB query local |
| Caching | Query-embedding LRU in memory (by normalized query hash; no identity) |

Language rule: same language only (plan §3.8). `kinds` lets the classifier steer, for example `["hadith","quran_translation"]` for level A and `["fatwa","article"]` for level B.

### 2.2 `get_ayah` (runtime)

| | |
| --- | --- |
| Input | `{"surah": 1–114, "ayah": int, "lang": "ar"\|"en"\|"tl", "translation_key": string (optional; default per lang: tl→`tagalog_rwwad`, en→`english_saheeh` ⚠️ pending مهند's choice, ar→Arabic text)}`, `"with_tafsir": bool` (ar only: `arabic_moyassar`, `arabic_mokhtasar`) |
| Output | `{"arabic": Passage, "translation": Passage\|null, "tafsir": [Passage]}` or `{"error": "not_found"}` (KNW-02 R3: never a substitute) |
| Backed by | QuranEnc data in `knw_passages` (ids `quranenc:ar:{s}:{a}`, `quranenc:{key}:{s}:{a}`) ✅ |
| Rate/cost | Local; no model call |
| Caching | Immutable per version; HTTP `Cache-Control: max-age=86400` for the app |

### 2.3 `get_hadith` (runtime)

| | |
| --- | --- |
| Input | `{"id": int, "lang": "ar"\|"en"\|"tl"}` |
| Output | `{"hadith": Passage, "arabic": Passage\|null}`; `meta` holds `grade`, `attribution`, `reference`, `hints` (benefits), `words_meanings`; or `{"error":"not_found"}` |
| Backed by | HadeethEnc in `knw_passages` (`hadeethenc:{lang}:{id}`) ✅ |
| Live fallback | None at runtime. In ingestion only: `GET /api/v1/hadeeths/one/` or `/hadeeths/multiple/`, or the official **HadeethEnc MCP server** `POST https://hadeethenc.com/mcp/` (tools `get_supported_languages`, `search_hadeeths`, `get_hadeeth_by_id`, `get_hadeeths_by_ids`) ✅ |

### 2.4 `get_passage` (runtime)

`{"id": string}` → `Passage` or `not_found`. Used by the renderer to replace `{{q:ID}}`, by the verifier, and by KNW-05 review screens.

### 2.5 `islamhouse_items` (team/ingestion and library refresh; not in the answer path)

| | |
| --- | --- |
| Input | `{"lang": "ar"\|"en"\|"tl", "type": "book"\|"article"\|"video"\|"audio"\|"showall", "category_id": int (optional), "page": int, "limit": 1–50}` |
| Output | `{"items": [{"id", "title", "type", "source_language", "authors": [..], "url", "attachments": [{"url","size","extension"}]}], "page", "has_next"}` |
| Backed by | IslamHouse API v3 ✅: `GET https://api3.islamhouse.com/v3/{key}/main/{type}/{flang}/{slang}/{page}/{limit}/json`, `…/main/get-category-items/{cat}/{type}/{flang}/{slang}/{page}/{limit}/json`, `…/main/get-item/{id}/{flang}/json`. The docs give a public key, `paV29H2gm56kvLPy` ("It's free to use"). We still request our own key (`sources.md`) |
| Rate | No published limit ⚠️; we keep it ≤2 req/s and run it only from a job |
| Caching | Results written to `knw_library_items` as **candidates**; nothing reaches a user until the Sharia reviewer approves the item (KNW-06 R1). Weekly link check (plan §8.3) |

### 2.6 `glossary_lookup` (runtime, KNW-03)

`{"term": string, "lang": ...}` → approved term, alternatives and definition, with source passage IDs. Backed by `knw_glossary` (approved rows only). The glossary can later be seeded from `islamenc.com` or `terminologyenc.com` once their terms allow; see `docs/domains/knowledge/research/sources-2026-10-05.md`.

### 2.7 `daily_card` (runtime, KNW-07)

`{"date": "YYYY-MM-DD" (device date), "lang": ...}` → the approved card for that day (plan §8.4: day number mod card count). It needs no user data. Cards of type `benefit` point to a `hadeethenc:*` passage, whose `meta.hints` are the source's own benefits, shown unmodified.

### 2.8 `hadith_grade_lookup` (team-only; Dorar)

**Not built now. Terms do not allow it** ✅.

- API: `GET https://dorar.net/dorar_api.json?skey=<text>` (optional `&callback=` for JSONP). It returns `{"ahadith":{"result":"<HTML>"}}` with up to 15 results. Each result is a `div.hadith` followed by labelled fields: الراوي, المحدث, المصدر, الصفحة أو الرقم, خلاصة حكم المحدث. There are no IDs and no paging. Cloudflare returns 403 to non-browser user agents.
- The API page grants only this: «هي خدمة توفر لأصحاب المواقع والمنتديات عرض نتائج البحث في الموسوعة الحديثية في مواقعهم باستخدام تقنية json» (https://dorar.net/article/389). The site FAQ (https://dorar.net/feedback) says: «الموسوعات حالياً غير قابلة للتنزيل وإنما هي للبحث والتصفح من خلال الموقع فقط، ولا يسمح بنسخها واستخدامها سواء على جهاز خاص أو أقراص».
- Sending a user's text to Dorar would also break principle 2.
- **If written permission arrives** (request already listed in `sources.md`): a team-only tool for the content author and the Sharia reviewer:
  - Input: `{"text": string 3–200 chars}`.
  - Output: `{"results": [{"text","narrator","muhaddith","source","page_or_no","grade"}], "more_url"}`, parsed from the HTML and never stored.
  - Pacing: ≤1 req/s; cache 24 h by text hash.
- Until then, the grade shown to users comes only from HadeethEnc's `grade` field.

## 3. Agents and the tools they get

| Agent | Tools | Notes |
| --- | --- | --- |
| Ask composer (KNW-01) | `search_passages`, `get_ayah`, `get_hadith`, `glossary_lookup` | At most 3 tool rounds per question; the classifier runs before any tool (`rules.md` §2.1). Danger route → no tools at all |
| Verifier (KNW-01 §4.6) | `get_passage` | Checks every cited ID was returned in this turn |
| Learning tasks (KNW-10) | `get_passage`, `glossary_lookup` | Inputs are the lesson's own approved sources; no open search |
| Reliability test (KNW-04) | same as composer | Run against a frozen corpus version |
| Content authoring (team, KNW-05/07) | all of the above + `islamhouse_items`, `hadith_grade_lookup` | Drafts only; the Sharia reviewer approves |
| Development agents (Claude Code) | all, through the local MCP server | Read-only; corpus from `~/.local/share/rafeeq/corpus` |

## 4. The ICSA MCP server

`islamic-content-mcp-server` (npm). ICSA's developer docs call it the official server: «خادم islamic-content-mcp-server الرسمي» (https://dev.islamiccontent.org/docs) ✅. It is published under a personal npm account (`2yousefreda`). Latest version 1.1.11, 2026-09-20 ✅.

- **Licence is inconsistent** ⚠️: the README says ISC; the repo LICENSE (github.com/2yousefreda/islamic-content-mcp) is MIT, "Copyright (c) 2024 The Association for Multi-lingual Islamic Content"; `package.json` has no licence field.
- **Tool names differ** between the README and ICSA's docs:
  - README: `quran_services`, `islamhouse_quran`, `hadeethenc_services`, `islamhouse_library`, `bayan_al_islam`, `risalat_al_haramain`, `al_montaka`.
  - ICSA docs: `quranenc_translation_list`, `hadeethenc_hadiths_list`, `islamhouse_list_items`, `bayan_name_search`, `risala_get_contents`.
- HadeethEnc also runs its own official MCP endpoint: `POST https://hadeethenc.com/mcp/`, Streamable HTTP, protocol `2025-06-18`. Its tools are `get_supported_languages`, `search_hadeeths`, `get_hadeeth_by_id` and `get_hadeeths_by_ids`. `tools/list` was tested ✅.

**Decision (proposed): development and ingestion only, never in the production answer path.** The reasons:

1. **Privacy.** A live MCP call with a user's question sends that question to a third party (principle 2, `rules.md` §2.6).
2. **Text integrity.** The verifier must check citations against our stored, versioned records. Live results can change between retrieval and display.
3. **Supply chain.** The server is an npm package from a personal account with an unclear licence. Running it inside production would add an unpinned dependency to the answer path.

Use it from Claude Code (pinned version, e.g. `npx -y islamic-content-mcp-server@1.1.11`) to explore sources, check IDs and draft library candidates. Rafeeq's own tools (§2) are the production surface. Record it in `sources.md` (already listed under Tools) once the licence is confirmed.

## 5. Budget and limits

- Every runtime tool except `search_passages` is free: local DB only. `search_passages` costs one embedding call.
- ⚠️ Embedding the whole corpus is a one-off cost against the $10 AI budget. The corpus normalized on 2026-10-05 has 37,416 QuranEnc passages, 7,851 HadeethEnc, 19,229 binbaz, 96,511 islamqa and 43 from the IslamHouse encyclopedia (161,050 in all). The islamqa JSONL alone is 358 MB. Check bge-m3's price on OpenRouter before embedding everything. If needed, start with QuranEnc and HadeethEnc (plan §3 scope) and add islamqa after the first retrieval measurement (KNW-04).
- Third-party pacing: HadeethEnc ≤4 req/s (we batch 50 ids per `multiple` call), QuranEnc downloads once per version, IslamHouse ≤2 req/s, Dorar ≤1 req/s if ever used.

## 6. What the main session must add

- Setting `corpus_dir` (default `~/.local/share/rafeeq/corpus`, env `RAFEEQ_DATA_DIR` already read by the normalizers). The loader reads `<corpus_dir>/<source_id>.jsonl`.
- A `licence_status` column or derived field on `knw_sources` (`ok` / `pending_permission`), so tools can label or exclude islamqa.
- Rows in `knw_sources` for `quranenc`, `hadeethenc`, `islamqa`, `binbaz` and `islamhouse_enc`, plus `islamhouse` for the library.
- Extend the comment on `Passage.kind` in `backend/app/knowledge/models.py` to list the new kinds (`fatwa`, `article`, `book_section`, `story`, `benefit`, `glossary`). The column is `String(24)`, so no migration is needed.
