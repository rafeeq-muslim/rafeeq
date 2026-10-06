# رفيق | Rafeeq

**يرافق المسلم الجديد في سنته الأولى بلغته: يتعلّم أساسيات دينه في مسار ممتع، ويجد جوابًا موثّقًا لسؤاله، ويصل إلى إنسان حين يحتاج.**

رفيق تطبيق ويب يُثبَّت على الجوال (PWA)، بالعربية والإنجليزية والتاغالوغية. فيه دروس قصيرة من كتاب «المختصر المفيد للمسلم الجديد» يراجعها مراجع شرعي قبل نشرها، ومساعد بالذكاء الاصطناعي لا يجيب إلا من مصادر معتمدة ويذكر مصدر كل إجابة، وزر «أريد إنسانًا» يصل بفريق بشري، ومواقيت صلاة وقبلة تُحسب على الجهاز دون أن يغادره الموقع. لا إعلانات ولا متتبّعات، ولا نقاط ولا ترتيب على العبادة.

مشروع فريق رفيق في تحدي الذكاء الاصطناعي في خدمة المحتوى الإسلامي (مؤسسة باذل)، المسار الثالث: التجارب التفاعلية والرحلة المعرفية للتعريف بالإسلام وتعلمه.

*Rafeeq accompanies new Muslims through their first year, in their own language: a gamified learning path, answers from approved Islamic sources only, and a human when they need one.*

## Try it live

| | |
| --- | --- |
| Landing page | https://rafeeq.nan.sa |
| The app | https://rafeeq.nan.sa/app |
| Demo video (1:25) | https://youtube.com/shorts/NN3KVPgEf-4 |
| Presentation (problem, solution, how it works) | [PDF](docs/submission/rafeeq-deck.pdf) · [PPTX](docs/submission/rafeeq-deck.pptx) |
| Submission answers and criteria checklist | [submission-form.ar.md](docs/submission/submission-form.ar.md) · [criteria-checklist.ar.md](docs/submission/criteria-checklist.ar.md) |

No account is needed to start. On a phone, "Add to Home Screen" installs it as an app.

## ابدأ من هنا

| إن كنت | فاقرأ |
| --- | --- |
| محكّمًا أو زائرًا يريد تشغيله | [Run it locally](#run-it-locally) أدناه |
| عضوًا في الفريق | [ابدأ من هنا](docs/00-start-here.md)، ثم [المنتج في صفحة](docs/product.md) و[قائمة الميزات](docs/features.md) |
| وكيلًا برمجيًا (Claude Code وغيره) | [`AGENTS.md`](AGENTS.md) |
| تريد مثالًا لوثيقة ميزة | [الإجابة الموثّقة](docs/domains/knowledge/features/KNW-01-sourced-answer.md) · [سلسلة الأيام الرحيمة](docs/domains/motivation/features/MOT-02-forgiving-streak.md) · [الحساب الاختياري](docs/domains/platform/features/PLT-02-optional-account.md) |
| تبحث عن المصادر وتراخيصها | [`docs/agents/sources.md`](docs/agents/sources.md) |

## الفريق

- ناصر بن عبدالعزيز العويمر (قائد الفريق)
- ناصر بن خالد العويمر
- مهند بن صالح الفوزان
- مسلّم بن عبدالعزيز العمير

---

## Run it locally

There are two ways. **Option A needs only Docker** and works the same on Linux, macOS (Intel and Apple Silicon) and Windows. Option B runs each part by hand for development. Both were run end to end on a fresh clone.

### What you get without keys

| Works with no keys at all | Needs something extra |
| --- | --- |
| Landing page, language choice, every lesson and exercise, review, the path map, badges and streak, prayer times and qibla, Hijri calendar, adhkar, the library, accounts and roles, «أريد إنسانًا», the review desk | Quran verses inside lessons: the QuranEnc corpus (no key; option A loads it for you, option B step 5) · The AI assistant, «لماذا؟» explanations and embeddings: an [OpenRouter](https://openrouter.ai/keys) key · Push notifications: VAPID keys · Emailed sign-in codes: an SMTP server |

Without an OpenRouter key the assistant replies that it can't answer right now and offers a person. That is the intended safe failure, not a bug.

### Option A: one command with Docker (recommended)

You need [Git](https://git-scm.com/downloads) and Docker ([Docker Desktop](https://www.docker.com/products/docker-desktop/) on macOS and Windows, or Docker Engine with the Compose plugin v2.24+ on Linux). No Python, uv or Node on your machine.

macOS, Linux, or Windows in WSL2 / Git Bash:

```bash
git clone https://github.com/rafeeq-muslim/rafeeq.git
cd rafeeq
cp .env.example .env        # optional: every value has a default; change the passwords
docker compose -f docker-compose.local.yml up --build
```

Windows PowerShell:

```powershell
git clone https://github.com/rafeeq-muslim/rafeeq.git
cd rafeeq
Copy-Item .env.example .env
docker compose -f docker-compose.local.yml up --build
```

Then open:

| Page | URL |
| --- | --- |
| Landing page | http://localhost:8380/ |
| The app | http://localhost:8380/app/ |
| API docs | http://localhost:8390/api/docs |

Sign in from the welcome screen («لي حساب، سجّل دخولي») with `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` from `.env` (defaults: `admin` / `change-me-local-admin`).

What the command does ([`docker-compose.local.yml`](docker-compose.local.yml)):

| Service | What it does |
| --- | --- |
| `db` | PostgreSQL 16 with pgvector, data in a named volume |
| `backend` | builds the production API image, runs the migrations (safe to repeat), creates the first admin if none exists, serves the API |
| `loader` | one-shot: fetches the QuranEnc text on the first run only (~27 MB, about 2 minutes, no key) and loads it so lessons show verses. Re-runs only re-load. `LOAD_QURANENC=0` skips it |
| `web` | builds the production web image: nginx serves the landing page at `/`, the app at `/app/`, and proxies `/api` |

The first `up --build` takes a few minutes, mostly image downloads and the frontend build. On our test machine the stack was healthy in 1.5 minutes with warm caches, and the QuranEnc load finished about 2 minutes later. Every image is multi-arch (amd64 and arm64).

Useful commands:

```bash
docker compose -f docker-compose.local.yml up -d --build      # in the background
docker compose -f docker-compose.local.yml logs -f backend     # follow the API log
docker compose -f docker-compose.local.yml down                # stop (data kept)
docker compose -f docker-compose.local.yml down -v             # stop and delete the data
```

Settings: ports (`WEB_PORT`, `API_PORT`, `DB_PORT`), passwords and optional keys go in the root `.env` ([`.env.example`](.env.example)). Any backend setting from the table below can be added there too, e.g. `OPENROUTER_API_KEY` for the assistant; restart with `up -d` after changing it. This is a local development setup: production uses `infra/compose.prod.yml`.

### Option B: run each part by hand

This path suits development (hot reload). It takes about 10 minutes, most of it downloads.

#### Prerequisites (option B)

| Tool | Version | Why |
| --- | --- | --- |
| Git | any recent | clone the repo |
| Docker | any recent | PostgreSQL 16 with pgvector |
| Python | 3.12 (`backend/pyproject.toml`) | backend |
| [uv](https://docs.astral.sh/uv/) | recent (tested with 0.11) | Python packages and running the backend |
| Node.js | 24 (`frontend/Dockerfile`), with npm 11 | frontend |

#### Steps (option B)

**1. Clone**

```bash
git clone https://github.com/rafeeq-muslim/rafeeq.git
cd rafeeq
```

**2. Start PostgreSQL with pgvector**

```bash
docker run -d --name rafeeq-dev-db -e POSTGRES_USER=rafeeq -e POSTGRES_PASSWORD=rafeeq_dev -e POSTGRES_DB=rafeeq -p 127.0.0.1:5442:5432 pgvector/pgvector:pg16
```

(One line, so it pastes into bash, zsh and PowerShell alike.)

This is the same image production uses. The migrations create the `vector` extension themselves.

**3. Configure and start the backend**

```bash
cd backend
cp .env.example .env          # PowerShell: Copy-Item .env.example .env ; then edit JWT_SECRET and the admin password
uv sync                       # installs Python 3.12 and the packages if needed
uv run alembic upgrade head   # creates every table
uv run uvicorn app.main:app --port 8000 --reload
```

Run backend commands from `backend/`: the settings are read from `backend/.env` in the current directory. Check it: `curl http://127.0.0.1:8000/api/health` returns `{"ok":true}`. The API docs are at http://127.0.0.1:8000/api/docs.

**4. The first admin account**

There is no separate command. At startup, if no admin exists yet, the backend creates one from `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` in `backend/.env`, with the roles `admin` and `team`. The log says `bootstrap admin created`. Sign in with it from the welcome screen («لي حساب، سجّل دخولي») or later under «حسابي». From the admin screen you can then create invite codes for mentors and Sharia reviewers. The team role is granted only in the database (MOT-08).

**5. Load the Quran text (recommended, no key needed)**

Lessons show Quran verses only from the database, never from generated text. Fetch and load QuranEnc (about 90 seconds and 27 MB; Arabic text, English and Tagalog translations, Arabic tafsir):

```bash
# still in backend/
uv run python -m app.knowledge.sources.quranenc --fetch   # downloads to ~/.local/share/rafeeq/
uv run python -m app.knowledge.load quranenc              # 37,416 passages into the database
```

Lesson content, the library catalogue, the adhkar text and the approved FAQ answers are already in the repo (`content/`, `data/hisnmuslim/`), so they need no loading.

**6. Start the frontend**

```bash
cd ../frontend
npm ci
npm run dev
```

Open:

| Page | Local URL |
| --- | --- |
| The app | http://localhost:5173/app/ |
| Landing page | http://localhost:5173/landing/index.html |

In production nginx serves the landing page at `/` and the app at `/app/` (`infra/web.nginx.conf`). The Vite dev server has no such split, so in development `/` shows an empty app shell; use the URLs above. Vite forwards `/api` to `http://127.0.0.1:8000`, so keep the backend on port 8000.

### Optional: the AI assistant and the full corpus

These steps are written for option B (run from `backend/`). With option A, put the key in the root `.env` and run `docker compose -f docker-compose.local.yml up -d`; run any command below inside the stack by replacing `uv run` with `docker compose -f docker-compose.local.yml run --rm loader`, for example `docker compose -f docker-compose.local.yml run --rm loader python -m app.knowledge.sources.hadeethenc --fetch`.

1. Put an OpenRouter key in `backend/.env` as `OPENROUTER_API_KEY`, then restart the backend. Spending is capped by `AI_BUDGET_USD` (total) and the daily ceilings below.
2. Fetch and load the other approved sources. Each takes a few minutes and needs network; each source's terms are in `docs/agents/sources.md`:

   ```bash
   uv run python -m app.knowledge.sources.hadeethenc --fetch
   uv run python -m app.knowledge.sources.islamhouse_enc --fetch
   uv run python -m app.knowledge.sources.binbaz --fetch
   uv run python -m app.knowledge.sources.islamqa --fetch
   uv run python -m app.knowledge.load        # loads every file in the corpus folder, plus the approved lesson cards
   ```

3. Embeddings: the backend embeds new passages by itself every 10 minutes (`KNW_EMBED_JOB_LIMIT` passages per run). To do it now: `uv run python -m app.knowledge.embed --estimate` shows the cost, then run it without `--estimate`.

### Optional: push notifications

Generate a VAPID key pair (pywebpush is already installed) and put both values in `backend/.env`:

```bash
uv run python -c "
import base64
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization as s
k = ec.generate_private_key(ec.SECP256R1())
b = lambda x: base64.urlsafe_b64encode(x).rstrip(b'=').decode()
print('VAPID_PRIVATE_KEY=' + b(k.private_numbers().private_value.to_bytes(32, 'big')))
print('VAPID_PUBLIC_KEY=' + b(k.public_key().public_bytes(s.Encoding.X962, s.PublicFormat.UncompressedPoint)))
"
```

The service worker only runs in a production build (`npm run build`), not in `npm run dev`, so test push on a built app. iPhone needs the app added to the Home Screen first.

### Environment variables

All backend settings live in `backend/app/core/config.py`. Each field is read from an environment variable of the same name in upper case, or from `backend/.env`. [`backend/.env.example`](backend/.env.example) lists them with placeholder values only. Nothing is strictly required for a local run; the "Production" column says what must be set on a public server.

**Core**

| Variable | Production | Default | What it is / how to get it |
| --- | --- | --- | --- |
| `ENV` | yes: `production` | `development` | `production` makes the sign-in cookie `Secure` |
| `PUBLIC_URL` | yes | `http://localhost:5173` | Where the app is opened from; sent as `HTTP-Referer` on AI calls |
| `DATABASE_URL` | yes | `postgresql+asyncpg://rafeeq:rafeeq_dev@127.0.0.1:5442/rafeeq` | Async SQLAlchemy URL to PostgreSQL 16 with pgvector |
| `JWT_SECRET` | yes | `dev-only-change-me` | Signs sign-in tokens. Generate: `python3 -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `ACCESS_TOKEN_MINUTES` | no | `30` | Access token lifetime |
| `REFRESH_TOKEN_DAYS` | no | `60` | Refresh cookie lifetime |
| `BOOTSTRAP_ADMIN_USERNAME` | first start | empty | First admin, created at startup only if no admin exists |
| `BOOTSTRAP_ADMIN_PASSWORD` | first start | empty | Its password; choose a long one |

**Content and corpus paths**

| Variable | Production | Default | What it is |
| --- | --- | --- | --- |
| `CONTENT_DIR` | no | `<repo>/content` | Lessons, cards, fixed replies shipped with the repo |
| `HISNMUSLIM_DIR` | no | `<repo>/data/hisnmuslim` | Hisn al-Muslim adhkar text shipped with the repo |
| `CORPUS_DIR` | if loading sources | `~/.local/share/rafeeq/corpus` | Normalized source files that `app.knowledge.load` reads |
| `RAFEEQ_DATA_DIR` | no | `~/.local/share/rafeeq` | Where the source fetchers write `sources/` and `corpus/`. Read from the shell environment only, not from `.env`: `export RAFEEQ_DATA_DIR=…` |

**AI (OpenRouter)**

| Variable | Production | Default | What it is / how to get it |
| --- | --- | --- | --- |
| `OPENROUTER_API_KEY` | for the assistant | empty | Create one at https://openrouter.ai/keys. Empty = assistant, explanations and embeddings are off; everything else works |
| `OPENROUTER_BASE_URL` | no | `https://openrouter.ai/api/v1` | |
| `AI_BUDGET_USD` | no | `10.0` | Hard total cap on paid calls |
| `AI_DAILY_BUDGET_USD` | no | `0.75` | Daily cap for answers and other calls (resets 00:00 UTC) |
| `AI_EMBED_DAILY_BUDGET_USD` | no | `1.00` | Separate daily cap for the embedding job |
| `AI_MODEL_MAIN` | no | `google/gemma-4-31b-it` | Answer composer |
| `AI_MODEL_FAST` | no | `google/gemma-4-26b-a4b-it` | Router, checks, small tasks |
| `AI_MODEL_FALLBACK` | no | `deepseek/deepseek-v4-pro` | Backup model |
| `AI_EMBEDDING_MODEL` | no | `baai/bge-m3` | Changing it needs a re-embed (`app.knowledge.embed --reembed`) |

**Answer retrieval and reliability (KNW-01, KNW-02)**

| Variable | Default | What it is |
| --- | --- | --- |
| `KNW_ANSWER_SOURCES` | `quranenc,hadeethenc,islamhouse_enc,binbaz,islamqa,rafeeq_cards` | Sources the assistant may answer from |
| `KNW_SEARCH_K` | `8` | Passages retrieved per search |
| `KNW_MIN_SIMILARITY` | `0.0` | Similarity floor |
| `KNW_QUOTE_MAX_WORDS` | `6` | Longest quote of a source in an answer |
| `KNW_SCRIPTURE_OVERLAP_WORDS` | `6` | Words of Quran/hadith overlap that trigger the scripture check |
| `KNW_PREFERRED_SOURCE` | empty | Near-tie preference for one source; empty = none |
| `KNW_NEAR_TIE_EPSILON` | `0.0006` | Width of that near tie |
| `KNW_EMBED_JOB_LIMIT` | `4000` | Passages embedded per scheduled run; `0` turns the job off |
| `KNW_EMBED_JOB_MINUTES` | `10` | Embedding job interval |
| `ASK_DEADLINE_SECONDS` | `45.0` | Whole answer pipeline deadline |
| `ASK_MAX_EXTERNAL_CALLS` | `8` | Model and embedding calls per question |
| `ASK_MAX_RETRIEVAL_ROUNDS` | `2` | |
| `ASK_MAX_COMPOSE_ROUNDS` | `2` | |
| `ASK_QUERY_NORMALIZATION_ENABLED` | `true` | Search-only query rewrite |
| `ASK_REPAIR_ENABLED` | `true` | One bounded repair of a failed draft |
| `ASK_APPROVED_FAQ_ENABLED` | `true` | Serve Sharia-reviewer-approved FAQ answers |

**Live sources (on by default since the go-live approval; they need an OpenRouter key like any answer)**

| Variable | Default | What it is |
| --- | --- | --- |
| `ASK_SOURCE_POLICY` | `live-enabled-sources-any-sufficient-v3` | Also searches the sites in `ASK_LIVE_SOURCES` live at question time. `local-index-v2` answers from the local index only |
| `ASK_LIVE_SOURCES` | `islamqa,binbaz` | Live connectors; empty or a shorter list switches them off |
| `ASK_LIVE_ISLAMIC_CONTENT_SEARCH_PERMITTED` | `false` | Keep `false` until the encyclopedia grants access in writing |
| `ASK_LIVE_DEADLINE_SECONDS` | `60.0` | |
| `ASK_LIVE_WINDOW_SECONDS` | `20.0` | |
| `ASK_LIVE_MAX_CALLS_PER_SOURCE` | `4` | |
| `ASK_LIVE_MAX_CALLS` | `16` | |
| `ASK_LIVE_MAX_AI_CALLS` | `6` | |
| `ASK_LIVE_RECORDS_PER_SOURCE` | `2` | |
| `ASK_LIVE_CHUNKS_PER_RECORD` | `2` | |
| `ASK_LIVE_REQUEST_TIMEOUT_SECONDS` | `8.0` | |
| `ASK_LIVE_USER_AGENT` | `RafeeqBot/1.0 (+https://rafeeq.nan.sa)` | |

**Library search and home (feature flags)**

| Variable | Default | What it is |
| --- | --- | --- |
| `LIBRARY_SEARCH_ENABLED` | `true` | `false` hides the library search |
| `LIBRARY_SEARCH_SOURCES` | `islamic_content,islamhouse` | May only switch a source off |
| `LIBRARY_SEARCH_WINDOW_SECONDS` | `12.0` | |
| `LIBRARY_SEARCH_REQUEST_TIMEOUT_SECONDS` | `8.0` | |
| `LIBRARY_SEARCH_MAX_CALLS_PER_SOURCE` | `4` | |
| `LIBRARY_SEARCH_MAX_CALLS` | `8` | |
| `LIBRARY_SEARCH_SESSION_SECONDS` | `300` | |
| `LIBRARY_SEARCH_MAX_SESSIONS` | `2000` | |
| `PLT09_ORGANIZED_HOME` | `true` | `false` restores the previous home screen |

**Push and email**

| Variable | Production | Default | What it is / how to get it |
| --- | --- | --- | --- |
| `VAPID_PUBLIC_KEY` | for push | empty | See [push notifications](#optional-push-notifications) |
| `VAPID_PRIVATE_KEY` | for push | empty | Same command; keep it secret |
| `VAPID_SUBJECT` | for push | `mailto:team@rafeeq.nan.sa` | A `mailto:` or `https:` contact for push services |
| `SMTP_HOST` | for 2FA email | empty | Empty = emailed sign-in codes are off |
| `SMTP_PORT` | | `587` | |
| `SMTP_USER` | | empty | |
| `SMTP_PASSWORD` | | empty | |
| `SMTP_FROM` | | `Rafeeq <no-reply@rafeeq.nan.sa>` | |

The frontend has no environment variables. Production (`infra/compose.prod.yml`) also uses `POSTGRES_PASSWORD` for the database container; the backend itself doesn't read it.

### Running the tests

Each feature example is an automated test. Use a separate test database:

```bash
docker exec rafeeq-dev-db createdb -U rafeeq rafeeq_test

cd backend
uv run ruff check . && uv run ruff format --check .
DATABASE_URL=postgresql+asyncpg://rafeeq:rafeeq_dev@127.0.0.1:5442/rafeeq_test uv run pytest -q
# or one feature: ... uv run pytest -q tests/test_knw06_library.py

cd ../frontend
npx tsc -b
npx vitest run                 # or one file: npx vitest run src/app/plt10.app-path.rules.test.tsx
npm run check:design           # design-system rules (tokens, RTL, no tracking on Arabic)
python3 ../content/check_content.py   # content rules (approved ids, glossary)
```

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| `docker run` fails: port 5442 is in use | Map another port (`-p 127.0.0.1:5443:5432`) and change `DATABASE_URL` to match |
| Port 8000 is taken | The dev proxy expects the API on 8000 (`frontend/vite.config.ts`, `server.proxy`). Free the port, or change that one line locally |
| Migrations fail on the `vector` extension or type | The database isn't the pgvector image. Use `pgvector/pgvector:pg16` |
| Settings seem ignored | Run backend commands from `backend/`; `.env` is read from the current directory |
| Lessons show no Quran verse (API says `not_loaded`) | Load QuranEnc (step 5) |
| The assistant always says it can't answer | No `OPENROUTER_API_KEY`, or the daily AI budget is used up (it resets at 00:00 UTC) |
| `http://localhost:5173/` is blank | Expected in dev; open `/app/` or `/landing/index.html` |
| The display font looks different from the live site | The Thmanyah font files can't be redistributed, so they aren't in the repo. The app falls back to IBM Plex Sans Arabic for text and Noto Naskh Arabic for headings. To match production, download them from font.thmanyah.com into `frontend/public/fonts/thmanyah/` (git-ignored) |
| No service worker or offline mode in dev | The worker is registered only in production builds: `npm run build && npm run preview` |
| A recitation or video doesn't play locally | Media come from IslamHouse and Quranpedia; check your network |
| Python warns about the locale | Harmless; `export LC_ALL=C.UTF-8` silences it |

#### By operating system

**Windows**
- Use [Docker Desktop](https://www.docker.com/products/docker-desktop/) with the WSL2 backend (the default). Option A works from PowerShell or from a WSL2 shell. For option B, we recommend running everything inside WSL2 (Ubuntu) and cloning into the WSL file system (`~/rafeeq`, not `/mnt/c/...`), which is much faster.
- Line endings: the repo's `.gitattributes` checks text files out with LF, so scripts and config work in the Linux containers even with `core.autocrlf=true`. If you see `/bin/sh^M` or `bad interpreter`, the files were checked out with CRLF by an older clone: clone again.
- `docker compose` is slow or runs out of memory: give WSL more memory in `%UserProfile%\.wslconfig` (`[wsl2]` then `memory=6GB`), then `wsl --shutdown`.
- Secrets without bash: `docker run --rm python:3.12-slim python -c "import secrets;print(secrets.token_urlsafe(48))"` works in PowerShell too.
- A port is in use: `netstat -ano | findstr :8380` shows who holds it; change `WEB_PORT` in `.env`.

**macOS (Intel and Apple Silicon)**
- Docker Desktop, OrbStack or Colima all work. Every image has an arm64 build, so nothing runs under emulation on Apple Silicon.
- The first build is slower on Docker Desktop's default file sharing; option A doesn't mount source folders, so this only affects option B. Give Docker at least 4 GB of memory (Settings → Resources).
- A port is in use: `lsof -i :8380`. Change the ports in `.env`.
- Option B: install Python with `uv` (it fetches 3.12 itself) and Node 24 with `brew install node@24` or `nvm`.

**Linux**
- Docker Engine with the Compose plugin v2.24 or newer (`docker compose version`); the old `docker-compose` v1 won't read this file.
- If `docker` needs `sudo`, either use it or add yourself to the `docker` group (`sudo usermod -aG docker $USER`, then log in again).
- A port is in use: `ss -ltnp | grep 8380`; change the ports in `.env`.

**Any OS**
- `extension "vector" is not available`: the database isn't the pgvector image; option A always uses `pgvector/pgvector:pg16`.
- The app shows an old version after an update: it's an installable PWA with a service worker. Reload once more, or clear the site data in the browser's developer tools (Application → Storage).
- Lessons show no Quran verse: the loader hasn't finished, or it had no network. `docker compose -f docker-compose.local.yml logs loader`, then `docker compose -f docker-compose.local.yml up loader` to retry.
- The fonts differ from the live site: the Thmanyah fonts can't be redistributed, so a local run uses the fallback Arabic fonts. That's expected.

## Data

Data pipeline: see [docs/DATA_PIPELINE.md](docs/DATA_PIPELINE.md): every source Rafeeq fetches, the exact commands, where the output goes, and every scheduled job.

## Licences and sources

**Rafeeq is not open for public use.** The code and the app are published for the hackathon's organisers and judges to evaluate, under the evaluation-only licence in [`LICENSE`](LICENSE). Nobody else may use, copy, modify, host or redistribute it without written permission from the Rafeeq team.

Every external source, dataset, model, font and library is logged with its licence in [`docs/agents/sources.md`](docs/agents/sources.md). Quran and hadith text is shown from the stored source records, never generated by AI.
