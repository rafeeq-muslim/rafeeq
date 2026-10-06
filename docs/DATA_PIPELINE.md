# Rafeeq data pipeline

Everything Rafeeq fetches from other websites, everything it builds from that, and every job that runs on a schedule, with the exact commands to rebuild the whole dataset from nothing.

Written from the code (2026-10-06). Licences and terms for every source are in [`docs/agents/sources.md`](agents/sources.md); this page only points to them. Sizes and times are **measured** where the page says so, from the production host's own files. Anything else is marked *not measured*.

Conventions:
- `$DATA` = `RAFEEQ_DATA_DIR` (default `~/.local/share/rafeeq`). Raw downloads go to `$DATA/sources/<source_id>/`, normalized corpus files to `$DATA/corpus/<source_id>.jsonl` (`backend/app/knowledge/sources/_common.py`). Neither is in the repo: some sources' terms don't allow republishing the raw text.
- The backend reads the corpus from `CORPUS_DIR` (default `~/.local/share/rafeeq/corpus`; in production `/srv/corpus`, mounted read-only from the host, `infra/compose.prod.yml`).
- "From `backend/`" means `cd backend` with dependencies installed (`uv sync`). Commands that touch the database need `DATABASE_URL`.
- In production the backend runs in the `backend` service of `docker compose -p rafeeq -f infra/compose.prod.yml`. Database commands run inside it as:
  ```bash
  docker compose -p rafeeq -f infra/compose.prod.yml exec -T backend sh -c \
    'export DATABASE_URL=postgresql+asyncpg://rafeeq:${POSTGRES_PASSWORD}@db:5432/rafeeq && python -m <module> <args>'
  ```
  Fetch/normalize steps run on the host (they write to `$DATA`, which the container only reads).
- No step needs a key except embeddings and the assistant (`OPENROUTER_API_KEY`). Never put keys in commands you share; set them in `backend/.env`.

## 1. Overview

| # | What | From (URL) | Command (from `backend/` unless noted) | Output | Size (measured) | Key | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Quran Arabic, translations (en, tl), Arabic tafsir | `https://quranenc.com/api/v1/…`, `https://quranenc.com/downloads/sqlite/{key}.sqlite` | `uv run python -m app.knowledge.sources.quranenc --fetch` | `$DATA/corpus/quranenc.jsonl` | raw 20 MB, corpus 26 MB, 37,416 passages | no | by hand |
| 2 | Hadith with grade and explanation (ar, en, tl) | `https://hadeethenc.com/api/v1/…` | `uv run python -m app.knowledge.sources.hadeethenc --fetch` | `$DATA/corpus/hadeethenc.jsonl` | raw 51 MB, corpus 36 MB, 7,851 passages | no | by hand |
| 3 | «المختصر المفيد للمسلم الجديد» (ar + en) | `https://cnt.islamhouse.com/api/v1/books/…` | `uv run python -m app.knowledge.sources.islamhouse_enc --fetch` | `$DATA/corpus/islamhouse_enc.jsonl` | raw 240 KB, corpus 120 KB, 43 passages | no | by hand |
| 4 | Ibn Baz fatwas (ar) | `git clone https://github.com/rn0x/binbaz_database.git` | `uv run python -m app.knowledge.sources.binbaz --fetch` | `$DATA/corpus/binbaz.jsonl` | raw 52 MB, corpus 48 MB, 19,229 passages | no | by hand |
| 5 | islamqa.info answers and articles (ar, en) | `https://files.zadapps.info/m.islamqa.info/dumps/manifest.json` + the listed `data.ndjson.gz` | `uv run python -m app.knowledge.sources.islamqa --fetch` | `$DATA/corpus/islamqa.jsonl` | raw 92 MB, corpus 358 MB, 96,511 passages | no | weekly (timer) |
| 6 | Load the corpus into `knw_passages` | `$DATA/corpus/*.jsonl` | `uv run python -m app.knowledge.load [source ...]` | Postgres `knw_passages`, `knw_sources` | — | no | every deploy if the files changed; after each refresh |
| 7 | Approved lesson cards into the index | the review desk + `content/` | part of #6, and at every app start | `knw_passages` (`rafeeq_cards`) | *not measured* | no | at start, on approval/return |
| 8 | Embeddings (bge-m3) | OpenRouter | `uv run python -m app.knowledge.embed` | `knw_passages.embedding` | — | `OPENROUTER_API_KEY` | every 10 min (job) |
| 9 | Library candidates (IslamHouse) | `https://api3.islamhouse.com/v3/<public key>/main/get-category-items/…` | `uv run python -m app.knowledge.library --fetch` | `content/discover/library.json` | 176 KB | public key in code | by hand |
| 10 | Library link check | each item's file URL (HEAD) | `uv run python -m app.knowledge.library --check-links` | `knw_library_items.status` | — | no | weekly (job) |
| 11 | Daily cards | `$DATA/corpus/hadeethenc.jsonl` | `uv run python -m app.knowledge.daily --build` | `content/discover/daily-cards.json` | 108 KB | no | by hand |
| 12 | Whole-surah recitation (al-Muaiqly) | `https://api3.islamhouse.com/v3/<public key>/quran/get-recitation/728787/ar/json` | `uv run python -m app.knowledge.recitation --fetch` then `python3 content/tools/recitation_sizes.py` (repo root) | `content/discover/recitations.json` | 20 KB (links only) | public key in code | by hand |
| 13 | Per-verse recitations (Quranpedia) | `https://files.quranpedia.net/recitations/{id}/{sura3}{aya3}.mp3` | none (hand-curated list) | `content/discover/verse_reciters.json`, `content/quran_recitation.json` | links only | no | — |
| 14 | Hisn al-Muslim adhkar | `https://www.hisnmuslim.com/api/…` | `python data/hisnmuslim/fetch.py [--audio]` (repo root) | `data/hisnmuslim/raw/` (in git) | 1.3 MB text; audio 185 MB, not in git | no | by hand |
| 15 | Day-one media (Al-Fatiha audio, support videos) | `https://api3.islamhouse.com/v3/<public key>/main/get-item/{id}/{lang}/json` | `python3 content/tools/fetch_media.py` (from `content/`) | `content/day-one-media.json` | 12 KB (links only) | public key in code | by hand |
| 16 | Learning path lessons | book spreadsheet + saved newmuslimguideline.com pages | `content/tools/sheet_snapshot.py`, `linearize.py`, `build.py`, `validate.py` | `content/units.json`, `content/lessons/*.json` | units 872 KB, lessons 504 KB | no | by hand |
| 17 | Umm al-Qura month table | the ICU `islamic-umalqura` calendar in Node | `node content/practice/build_umalqura.mjs` (repo root) | `backend/app/practice/umalqura.py` | 8 KB | no | by hand |
| 18 | Offline city list | GeoNames `cities15000.txt` + `alternatenames/<CC>.zip` | `python3 content/practice/build_cities.py <dir>` (repo root) | `frontend/src/app/practice/cities.json` | 148 KB | no | by hand |
| 19 | Live answer search | `https://islamqa.info/api/…`, `https://binbaz.org.sa/api/search` | none (per question, at runtime) | not stored | — | no | per question |
| 20 | Library live search | `https://islamhouse.com/search/search.php`, `https://islamenc.com/api/…` | none (per search, at runtime) | not stored | — | no | per search |

Sizes are from the production host's `$DATA` on 2026-10-06 (`du -sh`, `wc -l`); content files from the repo. Fetch durations are *not measured* except QuranEnc (about 90 seconds on a fresh clone, README). The whole corpus is 467 MB on disk and 161,050 passages before cards.

## 2. Rebuild everything from scratch

On a fresh machine with Postgres + pgvector running, `backend/.env` filled (`DATABASE_URL`, and `OPENROUTER_API_KEY` for step 7) and `uv sync` done in `backend/`:

```bash
# 0. Schema
cd backend
uv run alembic upgrade head

# 1. Fetch and normalize the approved corpus sources (network; writes $DATA)
uv run python -m app.knowledge.sources.quranenc --fetch
uv run python -m app.knowledge.sources.hadeethenc --fetch          # --langs ar,en,tl by default
uv run python -m app.knowledge.sources.islamhouse_enc --fetch
uv run python -m app.knowledge.sources.binbaz --fetch              # needs git
uv run python -m app.knowledge.sources.islamqa --fetch             # largest download

# 2. Load every corpus file into knw_passages (also refreshes the approved lesson cards)
uv run python -m app.knowledge.load

# 3. Embeddings: see the cost first, then run (or let the 10-minute job do it)
uv run python -m app.knowledge.embed --estimate
uv run python -m app.knowledge.embed

# 4. Library link health (hides dead items)
uv run python -m app.knowledge.library --check-links
```

Everything else the app needs is already in the repo (`content/`, `data/hisnmuslim/raw/`, `backend/app/practice/umalqura.py`, `frontend/src/app/practice/cities.json`). Rebuild those only when you want newer upstream data; the commands are in section 3. The content files are reviewed by the Sharia reviewer before they are merged (`docs/agents/rules.md` §1.4), so a rebuild of `content/` goes through a PR and review like any change.

Embedding time, derived from the measured rate in `core/config.py` (6.7 s per 64 islamqa passages): about 4.7 hours for 161,050 passages if run without a limit. The scheduled job does 4,000 passages per run (`KNW_EMBED_JOB_LIMIT`), every 10 minutes, under the daily ceiling `AI_EMBED_DAILY_BUDGET_USD` (default 1.00). The cost isn't given here: `--estimate` prints it from the current price.

## 3. Sources and builders

### 3.1 QuranEnc: Quran text, translations, tafsir

- **Module:** `backend/app/knowledge/sources/quranenc.py`.
- **Fetches:**
  - `GET https://quranenc.com/api/v1/translations/list` for versions;
  - `GET https://quranenc.com/downloads/sqlite/{key}.sqlite` for each key;
  - `GET https://quranenc.com/api/v1/translation/sura/{key}/{sura}` for the Arabic text.
- **Keys:**
  - `tagalog_rwwad` (tl);
  - `english_saheeh` and `english_rwwad` (en);
  - `arabic_moyassar` and `arabic_mokhtasar` (ar tafsir; not in the list endpoint, so they carry no version number).
- **Raw:** `$DATA/sources/quranenc/` (`translations_list.json`, `{key}.sqlite`, `arabic/{sura}.json`).
- **Terms:** no modification, cite QuranEnc.com, show the version, keep updated. Mode *Index* in [sources.md](agents/sources.md).

```bash
cd backend
uv run python -m app.knowledge.sources.quranenc --fetch   # omit --fetch to re-normalize the raw files only
uv run python -m app.knowledge.load quranenc
```

### 3.2 HadeethEnc: hadith with grade and explanation

- **Module:** `backend/app/knowledge/sources/hadeethenc.py`.
- **Fetches:** `https://hadeethenc.com/api/v1/` categories, `hadeeths/list`, `hadeeths/one`, at 4 requests/s (the site's ceiling is 5).
- **Raw:** `$DATA/sources/hadeethenc/<lang>/<id>.json`, one API response per hadith.
- **Terms:** same as QuranEnc; mode *Index*.

```bash
cd backend
uv run python -m app.knowledge.sources.hadeethenc --fetch --langs ar,en,tl
uv run python -m app.knowledge.load hadeethenc
```

### 3.3 IslamHouse encyclopedia: the learning path's book

- **Module:** `backend/app/knowledge/sources/islamhouse_enc.py`.
- **Book:** enc book 160, «المختصر المفيد للمسلم الجديد», Arabic + English.
- **Fetches:** `GET https://cnt.islamhouse.com/api/v1/books/book-info/160?locale=ar` and `books/page-data/160?page_number=N&transes=en`.
- **Raw:** `$DATA/sources/islamhouse_enc/book_160/`.
- **Terms:** IslamHouse policy (apps, offline, AI allowed; text unchanged; cite). See sources.md for the inference note and the author's permission.

```bash
cd backend
uv run python -m app.knowledge.sources.islamhouse_enc --fetch
uv run python -m app.knowledge.load islamhouse_enc
```

### 3.4 binbaz.org.sa: fatwas of Sheikh Ibn Baz

- **Module:** `backend/app/knowledge/sources/binbaz.py`.
- **Fetches:** `git clone --depth 1 https://github.com/rn0x/binbaz_database.git` into `$DATA/sources/binbaz/repo/`, a third-party dump whose last commit was 2024-09-21.
- **Collections used:** `nur_ealaa_aldarb.json`, `fatawaa_aljamie_alkabir.json`, `fatawaa_aldurus.json`.
- **Origin URLs:** every passage keeps its canonical `https://binbaz.org.sa/fatwas/{n}/…` URL.
- **Terms:** the site's footer allows copying with the source named (sources.md).

```bash
cd backend
uv run python -m app.knowledge.sources.binbaz --fetch      # needs git on PATH
uv run python -m app.knowledge.load binbaz
```

### 3.5 islamqa.info: answers and articles from the site's offline dump

- **Module:** `backend/app/knowledge/sources/islamqa.py`.
- **Fetches:**
  - the manifest `https://files.zadapps.info/m.islamqa.info/dumps/manifest.json`;
  - for ar and en, `https://files.zadapps.info/m.islamqa.info/<folder>/data.ndjson.gz`.
- **Types kept:** answer (fatwa), article, research.
- **Raw:** `$DATA/sources/islamqa/manifest.json`, `$DATA/sources/islamqa/<lang>/data.ndjson.gz`.
- **Terms:** personal use and non-commercial. Index mode is an owner decision (2026-10-05) with a permission request still to send (sources.md). Raw dump and JSONL stay outside the public repo.
- **Weekly refresh:** `infra/scripts/refresh-islamqa.sh` (section 5) compares the manifest with the held one, and fetches, normalizes and loads only when a newer dump exists.

```bash
cd backend
uv run python -m app.knowledge.sources.islamqa --fetch
uv run python -m app.knowledge.load islamqa
```

### 3.6 Load (`app.knowledge.load`)

- **What it does:** loads `$CORPUS_DIR/*.jsonl` into `knw_passages`, one source per transaction. Unchanged text keeps its vector; changed text loses it, so the embedder redoes it.
- **Refused (the source is left as it was):**
  - a missing or empty file;
  - a line that isn't JSON, or a row missing a field;
  - a row of another source, or a repeated id;
  - a manifest mismatch;
  - a file more than 10% smaller than what the DB holds (pass `--allow-shrink` for an intended removal).
- **Lesson cards:** a full load (no source names) also refreshes the approved lesson cards (`rafeeq_cards`, section 3.7).

```bash
cd backend
uv run python -m app.knowledge.load                  # every file in CORPUS_DIR, plus the cards
uv run python -m app.knowledge.load islamqa binbaz   # just these
uv run python -m app.knowledge.load islamqa --allow-shrink
```

In production, `deploy.sh` runs a full load inside the container after a healthy deploy, but only when the corpus files' listing hash changed (stamp `~/.config/rafeeq/corpus.sha`).

### 3.7 Approved lesson cards (`app.knowledge.cards`)

- **What it indexes:** the learning path's cards go into `knw_passages` (source `rafeeq_cards`, kind `approved_card`) in a language only while learners can see them there (merged, and not returned by the reviewer).
- **When it runs:** there is no command of its own. It refreshes:
  - at every app start (one-shot job);
  - on approval or return in the review desk;
  - on a full load.

### 3.8 Embeddings (`app.knowledge.embed`)

- **What it does:** embeds passages whose `embedding` is NULL with `AI_EMBEDDING_MODEL` (default `baai/bge-m3`) via OpenRouter.
- **Batches:** 64 per request, rotating over (source, language), each batch behind the spend guard (`AI_EMBED_DAILY_BUDGET_USD`).
- **Coverage:** recorded in `knw_sources.versions["embedding"]`.
- **Model safety:** vectors of different models are never mixed. After a model change, use `--reembed`.
- **Key:** `OPENROUTER_API_KEY`.

```bash
cd backend
uv run python -m app.knowledge.embed --estimate                      # cost and count, no calls
uv run python -m app.knowledge.embed                                  # everything pending
uv run python -m app.knowledge.embed --source islamqa --lang en --limit 5000 --batch 64
uv run python -m app.knowledge.embed --source quranenc --reembed      # model change only
uv run python -m app.knowledge.source_diagnostics inventory           # per source/lang: passages, vectors, coverage
```

### 3.9 Library (`app.knowledge.library`, KNW-06)

- **Fetch:**
  - **Source:** IslamHouse API v3, `https://api3.islamhouse.com/v3/<public key>/main/get-category-items/{cat}/showall/{lang}/{lang}/{page}/50/json`. The key is IslamHouse's documented public key, already in `library.py`, `recitation.py` and `fetch_media.py`.
  - **What it stores:** metadata and file links only (no files), in `content/discover/library.json`.
  - **Review:** nothing reaches learners before review.
  - **Unit placement:** item-to-unit placement is in `content/discover/library-units.json`; unplayable items are listed in `library-unplayable.json` (both hand-kept).
- **Link check:** HEAD (or a 1-byte GET) on every item's files, recorded in `knw_library_items.status` (`hidden` when dead, shown again when back).
- **Terms:** IslamHouse policy (sources.md).

```bash
cd backend
uv run python -m app.knowledge.library --fetch         # rewrites content/discover/library.json (then review + PR)
uv run python -m app.knowledge.library --check-links   # needs DATABASE_URL
```

### 3.10 Daily cards (`app.knowledge.daily`, KNW-07)

- **What it builds:** `content/discover/daily-cards.json` from the normalized HadeethEnc corpus (`$CORPUS_DIR/hadeethenc.jsonl`).
- **Text:** hadith text, title, grade and benefits are copied unchanged, with id and version.
- **Order:** the order is part of the reviewed content.
- **Needs:** step 3.2 done first.

```bash
cd backend
uv run python -m app.knowledge.daily --build
```

### 3.11 Recitations (KNW-08, LRN-01 R4)

- **Whole surahs (al-Muaiqly, IslamHouse 728787):**
  - Fetch: `https://api3.islamhouse.com/v3/<public key>/quran/get-recitation/728787/ar/json` writes the MP3 links on `d1.islamhouse.com` to `content/discover/recitations.json`.
  - Sizes: then `content/tools/recitation_sizes.py` adds each file's size from HEAD requests (nothing downloaded), so the app can show the size first (PLT-11 R5, PLT-12).
- **Per verse (Quranpedia):**
  - URL pattern: `https://files.quranpedia.net/recitations/{id}/{sura:03d}{aya:03d}.mp3`.
  - Files: the reciters offered are hand-curated in `content/discover/verse_reciters.json` (six Hafs reciters, approved 2026-10-06) and `content/quran_recitation.json` (recitation 255 under lesson verse cards).
  - The browser streams them; nothing is fetched by a script.
- **Tagalog meaning audio:** QuranEnc `https://d.quranenc.com/data/audio/tagalog_rwwad/{sura3}{aya3}.mp3` is streamed by the browser.
- **Terms:** sources.md rows for IslamHouse, Quranpedia and QuranEnc audio. No music or effects (rules.md §1.4).

```bash
cd backend && uv run python -m app.knowledge.recitation --fetch
cd .. && python3 content/tools/recitation_sizes.py
```

### 3.12 Hisn al-Muslim adhkar (PRC-07)

- **Fetch:** `data/hisnmuslim/fetch.py` downloads `https://www.hisnmuslim.com/api/…` (index, 132 chapters per language, ar and en) byte-for-byte into `data/hisnmuslim/raw/`, which is in git (1.3 MB).
- **Audio:** `--audio` adds the 397 MP3 files (185 MB) under `data/hisnmuslim/audio/`, which is git-ignored.
- **How the app uses it:** `backend/app/practice/adhkar.py` reads the raw files as served. `content/practice/adhkar.json` (hand-kept) lists the chosen chapters and maps every Quran span to stored QuranEnc references.
- **Known defects:** listed in the folder's README.
- **Terms:** permission from hisnmuslim.com, 2026-10-05 (README, sources.md).
- **Needs:** curl on PATH.

```bash
python data/hisnmuslim/fetch.py            # text only
python data/hisnmuslim/fetch.py --audio    # also the MP3s (185 MB)
```

### 3.13 Day-one media (LRN-01 R4/R5)

`content/tools/fetch_media.py` writes `content/day-one-media.json` from IslamHouse API v3 `main/get-item/{id}/{lang}/json`:
- the Al-Fatiha audio, item ids 2831350, 2839573 and 2839167;
- the wudu and prayer videos, 2834583, 2834586, 2832089 and 2838921.

It stores links only. The English prayer video stays hidden because its only file is HEVC (`content/units/unit-01/unit.json`, `content/discover/library-unplayable.json`).

```bash
cd content && python3 tools/fetch_media.py
```

### 3.14 Learning path content (LRN-01, LRN-09)

Card text is cut, never typed, from snapshots of the book.

1. `content/tools/sheet_snapshot.py <book.xlsx>` writes `tools/source/ar_sheet.txt`, `en_sheet.txt` and `sheet_pages.json` from the aligned spreadsheet. The xlsx isn't in the repo.
2. `content/tools/linearize.py <page.html> <out.txt>` turns a saved `newmuslimguideline.com` language page into `tools/source/{ar,en,tl}.txt`.
3. `content/tools/build.py` builds `content/units.json` and `content/lessons/*.json` from `spec_u*.py`, then applies `edits.py`. Each edit is tied to a Sharia reviewer decision.
4. `content/tools/validate.py` checks schema, ids, coverage, safety and fidelity (exit 0 = pass).
5. `content/check_content.py` checks the team units (`content/units/*/unit.json`) and, with `--learner-content`, the citations in lessons, excerpts, recitation and daily cards.

One-off helpers, not part of a rebuild:
- `compare_sheet_site.py` writes `tools/sheet_vs_site.txt`;
- `restyle_exercises.py` and `restyle_patches.py`.

```bash
cd content
python3 tools/build.py
python3 tools/validate.py
cd ..
for f in content/units/*/unit.json; do python3 content/check_content.py "$f"; done
python3 content/check_content.py --learner-content
```

### 3.15 Umm al-Qura table and cities (PRC-01, PRC-04)

- **`content/practice/build_umalqura.mjs`** writes `backend/app/practice/umalqura.py`, the month table for 1440–1600 AH the server checks sightings against. It uses the same ICU `islamic-umalqura` calendar the app uses on the device. Needs Node; no network. Unicode License v3 (sources.md, Tools).
- **`content/practice/build_cities.py <dir>`** writes `frontend/src/app/practice/cities.json` from GeoNames `cities15000.txt` and `alternatenames/<CC>.zip`, which you download first from `https://download.geonames.org/export/dump/`. CC BY 4.0. The app never calls GeoNames.

```bash
node content/practice/build_umalqura.mjs
python3 content/practice/build_cities.py /path/to/geonames
```

### 3.16 Live searches at runtime (nothing stored in bulk)

- **Answers** (`app.knowledge.live_sources`, policy `ASK_SOURCE_POLICY`, sources `ASK_LIVE_SOURCES=islamqa,binbaz` by default):
  - islamqa: `GET https://islamqa.info/api/search?…` and `GET https://islamqa.info/api/posts/answer/{ref}…`;
  - binbaz: `GET https://binbaz.org.sa/api/search?q=…&type=fatwa` and the fatwa page;
  - `islamic_content` (islamenc.com) stays off: `ASK_LIVE_ISLAMIC_CONTENT_SEARCH_PERMITTED=false`, because its robots.txt disallows search.
- **Library search** (`app.knowledge.library_search`, `LIBRARY_SEARCH_SOURCES=islamic_content,islamhouse`):
  - `POST https://islamhouse.com/search/search.php`;
  - `GET https://islamenc.com/api/search/suggestions…`.
- **What is sent:** only the search words, with no identity (the privacy policy, PLT-05 R1).

## 4. Scheduled jobs (inside the backend)

APScheduler in one backend instance (`backend/app/jobs.py`), registered from each domain's `jobs.py`:

| Job id | What | When | Code |
| --- | --- | --- | --- |
| `mot-05-reminders` | Send due learning reminders (web push) | every 5 min | `app/platform/push_jobs.py` → `push.run_reminders` |
| `mot-daily` | Refresh engagement statuses and freeze the day's snapshot (MOT-07/08) | 00:00 Asia/Riyadh | `app/motivation/jobs.py` |
| `org-daily` | Freeze each active organisation's figures (ORG-03) | 00:10 Asia/Riyadh | `app/organizations/jobs.py` |
| `cmp-applications-purge` | Delete mentor applications past retention (90 days) | 00:20 Asia/Riyadh | `app/companion/jobs.py` |
| `knw_embed_batch` | Embed up to `KNW_EMBED_JOB_LIMIT` (4000) pending passages of the answer sources; record coverage. Skipped without `OPENROUTER_API_KEY` | every `KNW_EMBED_JOB_MINUTES` (10) | `app/knowledge/jobs.py` |
| `knw_library_links` | Library link check (section 3.9) | weekly | `app/knowledge/jobs.py` → `library.scheduled_check` |
| `knw_cards_refresh` | Approved lesson cards into the index | once at start | `app/knowledge/jobs.py` |
| `knw_owner_approvals` | Record the owner's approvals in `content/approvals/` | once at start | `app/knowledge/jobs.py` |

Pause embeddings with `KNW_EMBED_JOB_LIMIT=0`.

## 5. Ops scripts, host timers and CI

Host timers are systemd **user** units on the production host. They are not in the repo; their definitions are copied here:

| Unit | Schedule | Runs |
| --- | --- | --- |
| `rafeeq-backup.timer` | `OnCalendar=*-*-* 03:30:00`, `Persistent=true` (nightly, server time) | `infra/scripts/backup.sh` |
| `rafeeq-islamqa.timer` | `OnCalendar=Fri *-*-* 02:30:00`, `Persistent=true` (weekly, Fridays) | `infra/scripts/refresh-islamqa.sh` |

To set them up on another host, create `~/.config/systemd/user/<name>.service` with `ExecStart=<repo>/infra/scripts/<script>` and a matching `.timer` as above. Then run `systemctl --user enable --now <name>.timer`, plus `loginctl enable-linger $USER` so they run without a login.

- **`infra/scripts/backup.sh`:**
  - runs `pg_dump --format=custom` from the `db` container into `/home/naser/backups/rafeeq/rafeeq-<UTC stamp>.dump` (mode 600);
  - keeps the newest 7.
  - Backups contain user data and never leave the server.
  - Restore with `pg_restore -d rafeeq --no-owner <file>` inside the db container.
- **`infra/scripts/refresh-islamqa.sh`:**
  - compares the islamqa manifest's ar and en folders with `$DATA/sources/islamqa/manifest.json`;
  - when newer, runs section 3.5's fetch on the host and `python -m app.knowledge.load islamqa` in the container, then updates the corpus stamp so the next deploy doesn't reload;
  - new passages are embedded by `knw_embed_batch`.
- **`infra/scripts/deploy.sh`:**
  - copies the Thmanyah fonts from `~/.config/rafeeq/fonts/thmanyah` (never committed);
  - exports `VITE_VAPID_PUBLIC_KEY` from `~/.config/rafeeq/secrets.env` and `VITE_BUILD_ID`;
  - tags the current images `previous` and builds;
  - starts `db` and runs `alembic upgrade head` in a one-off backend container;
  - starts everything and health-checks `http://127.0.0.1:5380/api/health` (60 × 3 s);
  - on success, prunes images and runs a full corpus load if the corpus changed;
  - on failure, rolls back to the `previous` images.
- **`.github/workflows/`** (all on the self-hosted runners):
  - `ci.yml`, on push to main and PRs:
    - backend: `uv sync --frozen`, ruff check and format, pytest against a pgvector service;
    - frontend: `npm ci`, `tsc -b`, design check, vitest, `build:app`, `check:size`;
    - content: `check_content.py` on every unit, `--learner-content`, `tools/validate.py`.
  - `deploy.yml`, on push to main and on demand: `infra/scripts/deploy.sh`, then `frontend/scripts/check-live-cache.mjs` against the live site.
  - `notify.yml`, on pushes and PRs: posts an event for the build session; it touches no data.

## 6. What is not in this pipeline

- **Hand-kept, reviewed content files** (edited by PR and reviewed, not generated):
  - `content/knowledge/*`: approved answers, danger and screen phrases, fixed replies;
  - `content/glossary/terms.json`, `content/practice/lines.json`;
  - `content/approvals/`, `content/units/*/unit.json`.
- **`$DATA/sources/osoul-wajeez/`** holds a reference PDF (Osoul «الوجيز») downloaded for research (`docs/domains/knowledge/research/sources-2026-10-05.md`). No code reads it.
- **`$DATA/sources/islamhouse/`** exists on the production host (1.9 MB). No current module writes to it (the library and recitation fetches write to `content/`); treat it as a leftover research download.
