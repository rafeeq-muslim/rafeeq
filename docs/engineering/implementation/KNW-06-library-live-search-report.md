# KNW-06 — Library live search: implementation report

| Item | Value |
| --- | --- |
| Governing spec | `docs/domains/knowledge/features/PRD-LIBRARY-LIVE-SEARCH.md` (PR #39) and its handoff |
| Branch | `knw-06-library-live-search-build` (based on `main` b89b760 + `knw-live-source-access-build` 8b09984) |
| Date | 2026-10-06 |
| Status | **Partly integrated.** IslamHouse is searched live from the backend ✅. The Islamic Content Encyclopedia is wired through the shared connector but **not connected**: its search is blocked until written access is granted (§2.2). The feature does **not** claim both sources. |
| Migration | none |

## 1. What was there before (PRD §9 step 1)

- `GET /api/discover/library?lang=` (`backend/app/knowledge/discover.py`): the reviewed catalogue of one language by topic. Items come from `content/discover/library.json` (IslamHouse API v3 candidates). An item the Sharia reviewer returns is withdrawn, and dead links (daily check, `knw_library_items.status = hidden`) are skipped. `Cache-Control: public, max-age=300`. **Unchanged** by this work (B01, B19 tests).
- `frontend/src/app/discover/Library.tsx`: topics → items → item page with the source card. Saving goes through KNW-09 (`SaveToggle`), on the device or on the account when signed in. Opening an item is **not** recorded anywhere. That is what the new privacy line says (§5).

## 2. Connectors: what was verified, and how

Every check was made from this backend (Python/httpx, `RafeeqBot/1.0` User-Agent), not from an assistant tool.

### 2.1 IslamHouse (`islamhouse`): connected ✅ live

| Question | Finding |
| --- | --- |
| Does API v3 search? | **No.** The Postman collection 7929737/TzkyMfPc (fetched 2026-10-06) lists categories, items, item, authors, languages, Quran, and no search operation. The ICSA `islamic-content-sdk` 1.0.7 and `islamic-content-mcp-server` 1.1.11 (`islamhouse_library` actions) have no IslamHouse search either. |
| What does islamhouse.com use? | Its search page (`/{lang}/search/?query=` → 302 → `/search/private.html#/…`, script `/search/js/app.76db3176.js`) posts JSON to **`POST https://islamhouse.com/search/search.php`**. |
| Request | `{"browse_mode": false, "term", "langs": [lang], "types": [type or "-1"], "page", "flang"}` |
| Response | `200 {numFound, from, to, page, showMore, f_langs, f_types, items: [{id, lang, type, title (HTML link with <mark>), nabza (HTML snippet)}]}`, 20 per page. No results: `404` with an HTML message. |
| Languages | ar, en, tl checked (e.g. «الوضوء» ar 69 hits; "wudu" en books 2; "pagdarasal" tl 24). |
| Pages | `page` + `showMore`; page 4 of «الوضوء» returned items 61–69 and `showMore: false`. |
| Types | `books, articles, audios, videos, fatwa, poster, khotab` (labelled); `category, apps, favorites, source, author` are skipped (not a material to open). |
| Original link | `https://islamhouse.com/{id}` → 301 → `https://islamhouse.com/{lang}/{type}/{id}`; we build the final form from validated ids. |
| robots.txt | `User-Agent: * Allow: /` |
| Licence | IslamHouse policy (apps allowed, cite, no change; `docs/agents/sources.md`). The search endpoint is **undocumented** ⚠️: ask for written confirmation in the same email as the API key. |

### 2.2 Islamic Content Encyclopedia (`islamic_content`): wired, not connected ⚠️

- Reused **as is** from the live-source agent (`backend/app/knowledge/live_sources/islamic_content.py`, commit 8b09984). It identifies the encyclopedia as **islamenc.com** («موسوعة المحتوى الإسلامي»). It is not `islamhouse_enc` (enc.islamhouse.com) and not the ICSA MCP server.
- Its search endpoint (`GET https://islamenc.com/api/search/suggestions`) is **disallowed by robots.txt** (`/*/search`) and the site says only «جميع الحقوق محفوظة». The adapter is blocked until `ASK_LIVE_ISLAMIC_CONTENT_SEARCH_PERMITTED=true`. The library obeys the same flag, because the block is about the site, not the feature.
- While it is blocked, `GET /api/discover/library/search/sources` reports it `available: false`. The screen says «البحث في موسوعة المحتوى الإسلامي لم يُربط بعد», the intro names IslamHouse only, "All" searches what can be searched, and the adapter is never called. If a client asks for it by name, it is reported `not_connected` (503 when it is the only source asked). It is never replaced by another site.
- The response shape is the one the live agent read from the site's script; it was **not called** from here. It has one suggestion list (no pages); a card is typed `qa` and linked to `https://islamenc.com/{lang}/enc/{enc}/card/{id}`.

### 2.3 Not used

The chat connectors `islamqa` and `binbaz` are never reachable from the library: the request model accepts only `islamic_content` and `islamhouse` (B21). `islamhouse_enc` is not used.

## 3. What was built

### Backend

| File | Change |
| --- | --- |
| `backend/app/knowledge/live_sources/islamhouse.py` | **New.** IslamHouse site-search adapter: SSRF-safe POST reusing `live_sources.http` (allowed host `islamhouse.com` only, public addresses only, shared budget, 3 MB cap, one transient retry, redirects never followed). It parses to the shared `types.Candidate`, strips HTML (text only), keeps 280-character snippets, drops other-language items and non-materials, and builds links from ids. Library-only: **not** in `registry.CONNECTORS`. |
| `backend/app/knowledge/library_search.py` | **New.** Library allowlist `("islamic_content", "islamhouse")`. Parallel search inside one window (12 s), cancellation, per-source status, reciprocal-rank fusion with a hash tie-break (no site preference), dedupe by record id and normalised link, links accepted only on the source's own hosts. In-memory session (5 min, at most 2000) with an opaque cursor bound to query/lang/sources/type; replaying a cursor returns the same page; at most 10 result pages and 15 site pages per search, and up to 2 site pages per request when one page is mostly non-materials. Logs: source, status, ms, items, calls only. Raises the `httpx`/`httpcore` loggers to WARNING (§6). |
| `backend/app/knowledge/discover.py` | Additive block at the end: `GET /api/discover/library/search/sources`, `POST /api/discover/library/search` (contract below). `GET /api/discover/library` is unchanged. |
| `backend/app/core/config.py` | Additive block `library_search_*`. |
| `backend/tests/test_knw06_library_search.py` | **New.** 31 tests, B01–B22, mocked sites (respx) in the recorded shapes. |
| `backend/tests/live_smoke/test_knw06_library_search_smoke.py` | **New.** Opt-in bounded live check (`RAFEEQ_LIVE_SMOKE=1`); skipped in CI. |

Contract (PRD §6), `POST /api/discover/library/search`, `Cache-Control: no-store` on every answer, errors included:

```json
{"query": "2..200 chars", "lang": "ar|en|tl", "sources": ["islamic_content", "islamhouse"], "type": "book|article|audio|video|fatwa|poster|khutbah|qa", "page_size": 12, "cursor": null}
```

- `sources` omitted = every library source that can be searched now; `[]` → 422; any other id → 422; extra fields → 422.
- 200: `{search_id, status: success|partial, items: [{id, source_id, source_name, title, snippet, type, lang, url, retrieved_at}], source_status: [{source_id, status}], next_cursor}`. Source statuses: `ok, no_results, timeout, unavailable, not_connected, unsupported_language, unsupported_type`.
- 503 `{code: sources_unavailable, source_status}` when every searched source failed; 410 `search_expired`; 422 `cursor_mismatch` / invalid input; 429 `rate_limited` (20/min, 400/day per address and, when signed in, also per account; IPv6 per /64; in memory). Security audit 2026-10-07 A-L5: all clients together start at most `LIBRARY_SEARCH_DAILY_CAP` (3000) outbound searches per UTC day, then 503 `sources_unavailable` until midnight; 404 `library_search_off`.

### Frontend

| File | Change |
| --- | --- |
| `frontend/src/app/discover/LibrarySearch.tsx` | **New.** Field (label, placeholder, search button, clear button, Esc clears), intro line naming only the searchable sources, the note «يُرسل نص البحث إلى المصادر لجلب النتائج», "not connected yet" line, filters (source when ≥ 2 sources, type when the sources label types), result rows (source name, type badge, plain-text title and snippet with `dir="auto"` and `lang`, «فتح في المصدر» with `target=_blank rel="noopener noreferrer" referrerPolicy="no-referrer"`), «نتائج مباشرة من المصادر، لم يراجعها فريق رفيق.», count «النتائج المعروضة: n», load more, every §8 state, one polite `aria-live` region. |
| `frontend/src/app/discover/libraryLiveSearch.ts` | **New.** Request hook: explicit send only, POST + `cache: no-store`, request ids (a late reply is dropped), AbortController on a new search / clear / cancel / 15 s, offline check, link check (https on the source's own host). The words live in React state only. |
| `frontend/src/app/discover/Library.tsx` | `LibraryList` wraps its catalogue in `<LibrarySearch>`; nothing else changed. |
| `queries.ts`, `types.ts` | `useLibrarySearchSources`; search types. |
| `i18n/{ar,en,tl}.ts` | Additive block `discover.lib.search.*`; value of `discover.lib.private` corrected (§5). |
| `frontend/src/app/discover/libraryLiveSearch.test.tsx` | **New.** 21 tests. |

Docs: `docs/agents/sources.md` (IslamHouse row: the site search endpoint), `docs/engineering/decisions-for-review.md` (section «KNW-06 library live search»), this report, `docs/engineering/implementation/img/knw-06-library-search/*.png`.

## 4. Acceptance B01–B22

Backend tests: `backend/tests/test_knw06_library_search.py` (`test_knw06_search_bNN_*`). App tests: `frontend/src/app/discover/libraryLiveSearch.test.tsx` (`knw06_search_bNN_*`). All pass.

| ID | Result | Evidence |
| --- | --- | --- |
| B01 | ✅ | Catalogue identical before/after a search, still `public, max-age=300` (backend); field + catalogue shown together (app); screenshot 01 |
| B02 | ✅ | No request while typing; an IME Enter is prevented; Enter/button sends exactly one POST with `{query, lang, page_size}`; length messages, nothing sent (app) |
| B03 | ✅ | "All" calls both connectors from the backend when both are connected (mocked: encyclopedia permitted in the test); live: IslamHouse only (§2.2) |
| B04 | ✅ | `sources:["islamhouse"]` with zero results never calls the encyclopedia |
| B05 | ✅ | Results from one site = `success` |
| B06 | ✅ | Encyclopedia 500 → IslamHouse items + `partial` (backend); warning names the failed source (app) |
| B07 | ✅ | Empty `success` vs 503 `sources_unavailable`; zero results with one source down = `partial` + «لم تظهر نتائج من المصادر المتاحة، وتعذّر البحث في بعضها» (both sides) |
| B08 | ✅ | «العودة إلى المكتبة» / clear / Esc → the catalogue again, field emptied and focused (app); Playwright Esc run in §7 |
| B09 | ✅ | Two concurrent requests with the same cursor → the same page, no duplicates (backend); an older reply after a newer search is ignored and the older request aborted; load more appends without repeats (app) |
| B10 | ✅ | 45 + 3 mocked items over 4 result pages: 48 once each, each site page asked once, the page-less encyclopedia asked once; a source that ends stops while the other continues; a page of non-materials reads the next site page (bounded) |
| B11 | ✅ | Unknown or expired cursor → 410 `search_expired`; a cursor reused with another query/source/type/lang → 422 `cursor_mismatch`; the app shows «انتهت جلسة البحث، أعد البحث» |
| B12 | ✅ | `<img onerror>`, `<script>` and «Ignore previous instructions» come out as text; bad ids/types dropped; links built from ids on the source host only; DNS to 10.0.0.5 → never called; the app opens only https links on the source's own host |
| B13 | ✅ | Other-language items dropped; unknown kinds get no badge; `type=book` never asks the encyclopedia (`unsupported_type`) and `qa` never asks IslamHouse |
| B14 | ✅ | caplog: query never logged; the source receives the words only (no cookie/authorization); `GET` with the words → 405; no-store; nothing in localStorage/URL/events (app). Live run: the uvicorn log of the real searches contains no search words (§6) |
| B15 | ✅ | Items carry exactly `id, source_id, source_name, title, snippet, type, lang, url, retrieved_at`, no "reviewed" field; the app shows the source name, type, snippet, the link, and «لم يراجعها فريق رفيق» |
| B16 | ✅ | `role="search"` form, `<label for>`, `aria-describedby`, one `aria-live` region; Playwright: Tab reaches the field in 2 presses, Enter searches, focus ring visible on «فتح في المصدر», no horizontal overflow at 390 px (ar, RTL) and 360 px (tl, LTR) (§7) |
| B17 | ✅ | 422 inputs (short, long, bad lang/type/page_size, extra field, nothing left after normalising); 429; a hanging source cancelled inside a 1 s window → `timeout` + other results; switched off → 404 and the catalogue stays; app: 503/429/410 messages, 15 s client timeout, offline note with the catalogue kept, cancel |
| B18 | ✅ | Encyclopedia not permitted → `available:false`, never called, `not_connected` when asked by name, 503 when it is the only source |
| B19 | ✅ | A withdrawn item and a dead-link item stay out of `GET /api/discover/library` even when the same records are found by search |
| B20 | ✅ | With the chat set to `islamqa,binbaz`, the library searches only its own sources; `registry.CONNECTORS` has no `islamhouse`; chat settings unchanged |
| B21 | ✅ | `islamqa`, `binbaz`, `islamhouse_enc`, `[]`, wrong case → 422; `LIBRARY_SEARCH_SOURCES` cannot widen the allowlist |
| B22 | ✅ | The same IslamHouse item on two site pages is shown once; an encyclopedia record pointing at an IslamHouse link is never shown under the encyclopedia's name; source filters keep identity; IslamHouse working does not mark the encyclopedia connected |

## 5. Privacy (PRD §4)

- POST only; `no-store` on every answer; no search or open history is stored; the search session (words in their search form, the ids already shown) lives in this process's memory for at most 5 minutes and holds no identity.
- Sent to IslamHouse: the search form of the words (NFKC, diacritics and punctuation removed, links/e-mails/long digit runs removed, at most 12 words) and the language. No identity, no cookies kept (one client per request), User-Agent `RafeeqBot/1.0`.
- nginx logs `$uri` only (no query string, no body); uvicorn runs with `--no-access-log` in production.
- Screen text: «لا نحفظ في رفيق سجلًّا لما تفتحه أو تبحث عنه.» (was «لا نسجّل ما تفتحه، ولا يراه أحد غيرك», which an external search cannot keep) and «يُرسل نص البحث إلى المصادر لجلب النتائج». Nothing promises that external sites cannot see the search or the visit. Links carry `noreferrer` and `referrerPolicy="no-referrer"`.
- Analytics: the app's only event channel (`sendEvent`, MOT-07) is not called by the search; there is no third-party analytics.

## 6. Finding outside this feature: request URLs in the backend log

`httpx` logs every request line at INFO (`HTTP Request: GET https://…?q=<words>`), and `main.py` configures INFO. The encyclopedia's search, and the chat's live islamqa/binbaz searches (knw-live-source-access-build), are GET requests with the words in the query string, so the words would reach the backend log. `library_search.py` raises the `httpx` and `httpcore` loggers to WARNING (it is imported by the app through `discover.py`). The live-source agent was told through the coordinator.

## 7. Commands, results, latency, UI evidence

```text
backend$ uv run ruff check . && uv run ruff format --check .                 → clean
backend$ DATABASE_URL=…/rafeeq_test_libsearch uv run pytest -q tests/test_knw06_library_search.py   → 31 passed
backend$ DATABASE_URL=…/rafeeq_test_libsearch uv run pytest -q             → 678 passed, 11 skipped (live smoke tests, opt-in)
backend$ RAFEEQ_LIVE_SMOKE=1 uv run pytest -q -s tests/live_smoke/test_knw06_library_search_smoke.py → 1 passed (live)
frontend$ npx tsc -b && npm run check:design && npx vitest run            → 0 errors; 6/6 design checks; 51 files, 471 tests passed
```

**Live search from the backend (2026-10-06, IslamHouse only, page size 12):**

| Language | Words | Page 1 | Page 2 | Duplicates |
| --- | --- | --- | --- | --- |
| ar | فضل الوضوء | 12 items, 3.0 s | 12 items, 2.5 s | 0 |
| ar | الصلاة | 7 items*, 3.1 s | 12 items, 3.1 s | 0 |
| en | wudu | 5 items, 2.6 s | none | 0 |
| en | new muslim | 12 items, 2.4 s | 12 items, 3.0 s | 0 |
| tl | pagdarasal | 12 items, 3.2 s | 12 items, 3.4 s | 0 |

\* before the "second site page when the first is mostly non-materials" rule; now 12.

Later runs through the app (Playwright → backend → IslamHouse): one IslamHouse call took 0.8–1.6 s (two site pages: 1.4–4.3 s); the whole user wait was 1.6–4.9 s. Highest seen: 4.9 s, under the PRD's 8 s P95 target. That is a small sample, not a measured P95.

**Screenshots** (Playwright, headless Chromium, 390×844 @2x, real backend and live IslamHouse; `docs/engineering/implementation/img/knw-06-library-search/`):

- `01-ar-before-search.png`: catalogue and search field, RTL, «لم يُربط بعد» for the encyclopedia.
- `04-ar-results.png`: results (type badge, snippet, «فتح في المصدر», type filter, count, not-reviewed note).
- `05-ar-link-focus.png`: keyboard focus ring on the first «فتح في المصدر» (accessible name «فتح «…» في إسلام هاوس (يفتح موقعًا خارجيًّا)»).
- `08-ar-no-results.png`: honest empty state.
- `09-tl-results-360.png`: Tagalog, LTR, 360 px, no horizontal overflow.
- `10-ar-offline.png`: offline note; the catalogue stays.

Keyboard check (scripted): Tab ×2 reaches the field, typing + Enter searches, Shift+Tab/Tab land on the result link, Esc clears and returns to the catalogue with an empty field. Measured horizontal overflow: 0 px in every shot.

## 8. Remaining dependencies (need a human)

1. **Encyclopedia access:** written permission from islamenc.com (robots.txt disallows its search; «جميع الحقوق محفوظة»). Then set `ASK_LIVE_ISLAMIC_CONTENT_SEARCH_PERMITTED=true` and run the live smoke test with `sources=["islamic_content"]`. The owner should also confirm that «موسوعة المحتوى الإسلامي» means islamenc.com.
2. **IslamHouse:** written confirmation that the live use of `islamhouse.com/search/search.php` is fine (undocumented endpoint), in the same email as our own API key.
3. **Tagalog review** of `discover.lib.search.*` and the changed `discover.lib.private` (en/tl too).
4. Gradual launch per the PRD: watch `rafeeq.library_search` log lines (status, ms) for a week.

## 9. Rollback

- Off: `LIBRARY_SEARCH_ENABLED=false`. `POST` returns 404, `sources` returns `enabled:false`, and the app shows the library exactly as before (no field). Nothing to migrate; no table was added; the catalogue, reviews and saved items are untouched.
- One source off: remove it from `LIBRARY_SEARCH_SOURCES` (e.g. `islamic_content` only, or empty).
- Code: revert the branch's commit; `discover.py`, `config.py` and i18n changes are additive blocks.
