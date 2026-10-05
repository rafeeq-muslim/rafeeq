# Decisions for the product owner's review

Written by Claude during the overnight build (2026-10-05/06), at the product owner's request to decide as an expert product engineer and gather every decision here. Each line says what was decided, why, and what it would take to change it. Product rules in `docs/agents/rules.md` were never changed; where a PRD and a rule disagreed, the rule won (see `conflicts.md`).

## Postponed: needs you (5)

| # | What | Why it waits for you | Until then |
| --- | --- | --- | --- |
| 1 | **Email provider for two-step sign-in codes** (PLT-02 R6) | Needs an account with a mail service (e.g. Amazon SES, Postmark, or a Google Workspace SMTP relay) in the organisation's name; I must not create accounts | The feature is fully built and tested; the app says «إرسال الرموز بالبريد غير متاح الآن». Add `SMTP_HOST/PORT/USER/PASSWORD/FROM` to `~/.config/rafeeq/secrets.env` and redeploy |
| 2 | **Verified helpline numbers per country** for the danger panel (rules.md §2), and **who watches urgent requests at night** | Numbers must be verified by a person; inventing them is forbidden. Urgent requests reach every mentor's and team member's inbox at once, but nobody is on call yet | Danger cases show «تحدث مع إنسان الآن» (our team) and a generic "call your local emergency number" |
| 3 | **Permission letters**: islamqa.info (AI and app use of the offline archive), binbaz.org.sa (AI use), IslamHouse (own API key, self-hosting the Osoul videos and Al-Fatiha audio), dorar.net (stays link-only) | Sending email on your behalf needs your approval | islamqa is indexed on your explicit instruction and labelled "permission pending"; its files stay outside the public repo; dorar/islamenc/dawa.center are link-only |
| 4 | **Sharia approval of the content** by مهند بن صالح الفوزان | Only he may approve (KNW-05 R5) | 25 lessons are ready and waiting in the review desk. Learners see an honest "being reviewed" message. Invite code for his account: `~/.config/rafeeq/invites.txt` (role `sharia_reviewer`) |
| 5 | **Native Tagalog review** of exercises, objectives and UI strings | Needs a fluent speaker | Tagalog is live after approval but marked as needing review in `frontend/src/app/i18n/tl.ts` and `content/README.md` |

## Platform and engineering

| Decision | Why | To change |
| --- | --- | --- |
| React 19 + Vite + TypeScript + Tailwind v4 + shadcn (the existing design system), React Router, TanStack Query, Zustand | Builds on the design system already approved (PR #1); smallest set that covers offline-first state and server cache | — |
| FastAPI + async SQLAlchemy 2 + Alembic + PostgreSQL 16 with pgvector; uv; ruff; pytest against a real Postgres | One database for app data and vectors; typed, testable, fast to build | — |
| **Guest first, device is the source of truth** for progress; an account keeps a merged copy (union of lessons, latest answer per objective, larger set of learning days) | PLT-02 R1 and rules.md §4 (minimum data); works offline | — |
| Access token in memory, refresh token in an httpOnly cookie scoped to `/api/auth`; Argon2id passwords; rate limits on login and codes | Standard, avoids tokens in localStorage | — |
| Mentors, reviewer and team join with **invite codes** created in Admin | ORG domain is postponed; codes stand in for organisation approval | Replace with ORG approval later |
| **No staging**: every push to `main` deploys to `https://rafeeq.nan.sa` via the self-hosted runner, with health check and automatic rollback to the previous images | Your instruction | — |
| CI also runs on the self-hosted runner | GitHub-hosted runners never started for this private organisation (jobs stayed queued) | Enable Actions minutes for the org, then switch `runs-on` back |
| Source corpus (QuranEnc, HadeethEnc, islamqa, binbaz, IslamHouse book) lives in `~/.local/share/rafeeq/corpus`, mounted read-only into the backend and reloaded on deploy only when it changed | The repo is public; several licences forbid redistribution | — |
| **No IP addresses in logs** (nginx log format without the address; uvicorn access log off) | MOT-07 R4 and rules.md §4 | The host router (outside the app) still logs addresses; ask the server owner to drop them for `rafeeq.nan.sa` |
| Web push with our own VAPID keys (no third-party push service) for MOT-05 reminders and replies | rules.md §4: no third parties | — |
| Reminders are checked every 5 minutes in the learner's own time zone | Web push cannot schedule on the device; 5 minutes late is gentle enough | — |

## Learning and content

| Decision | Why | To change |
| --- | --- | --- |
| Arabic and English card text from the **spreadsheet you supplied**; Filipino from the book's official site | You asked to use the spreadsheet; it matches the printed book where the site is wrong (e.g. the Zabur and Dawud) | Point `SOURCE_FILES` in `content/tools/build.py` back at the site |
| **Unit 1 is مهند's draft** (`content/units/unit-01/unit.json`, 7 lessons, 21 step photos); team units load through `backend/app/learning/team_units.py` and replace any pipeline unit of the same order. Step photos are served only through `/api/content/media/unit-NN/images/*` | Teammates' content wins; the unit files themselves are never exposed | Remove the folder to fall back to the pipeline's unit 1 |
| Lessons cite Quran verses **by reference only**; the words come from the stored QuranEnc record (Arabic + Saheeh International for English, Rowwad for Tagalog) | rules.md §1.3 | Translation keys in `backend/app/knowledge/scripture.py` |
| English and Filipino prayer steps no longer contain transliterated adhkar or their translations | Avoids learners reciting a translation in prayer; Arabic keeps every dhikr | Restore from each lesson's `dropped` list |
| The wiping-over-socks invalidator follows each language's source (Arabic: what requires wudu or ghusl; English/Filipino: ghusl only); no exercise asks about it | A fiqh difference between editions; the reviewer decides | Flagged for مهند in `content/README.md` |
| **Approval stores a snapshot**: learners always get exactly the approved text; an edit waits for re-approval while the old approved text stays visible | KNW-05 R3 | — |
| Team accounts can preview lessons still in review (switch on the path) | The team must walk the product before approval without showing it to learners | — |
| Ordering and matching exercises use taps, not drag | Reliable with one thumb, screen readers and both directions | — |
| A returning wrong exercise starts fresh; no limit, no penalty; the feedback shows the card text | LRN-03 R3 | — |
| Path nodes gained a fourth state, **open** (unlocked by placement) | LRN-02 and LRN-05 together need it; showing a check mark would claim completion | — |
| Placement asks knowledge questions only, offers «لا أعرف», and never marks answers | LRN-05 R5 and rules.md (no "do you pray") | — |
| Lesson completion shows a **unit flower** gaining the earned petal; badges are celebrated first | One orchestrated moment of delight, from the brand's petal geometry | — |

## Motivation and indicators

| Decision | Why |
| --- | --- |
| Engagement status computed on the server from anonymous events, refreshed on each interaction and daily at 00:00 Riyadh, when the snapshot is taken | MOT-07 R3, MOT-08 R2 |
| An account with several devices counts once in snapshots (the most recently used device's status) | Avoid double counting after sign-in |
| Indicators hide any number based on fewer than 10 people | MOT-08 R6, MOT-09 R6 |
| The mentor-contact comparison (MOT-08 R6) waits for Companion's contact events | Shown as "not enough data" until then |
| Reminder text: «لحظة لك / لديك درس قصير جاهز متى شئت» (and en/tl equivalents) | No app name, no religious word, no streak (MOT-05 R3) |

## AI

See `ai-agents.md` (written with the AI build): agents, models, measured prices, bake-off, budget guard at $10 cumulative.

## Daily Practice (PRC-01, 02, 04, 05, 07)

| Decision | Why | To change |
| --- | --- | --- |
| PRC-02 (habits) and PRC-07 (adhkar) drafted as feature documents «مسودة من Claude للمراجعة» before building | Owner's process: no feature without a document; both had none | Edit the drafts; the code follows their rules and open questions |
| Prayer-time rounding: compute unrounded, then Fajr ⌈t⌉+1, Sunrise ⌊t⌋, Dhuhr ⌈t⌉, Asr ⌈t⌉+1, Maghrib ⌈t⌉, Isha ⌈t⌉ | PRC-01 R3: never before the official time, sunrise never after. Checked on 40 official Umm al-Qura days in 5 cities: Dhuhr/Maghrib/Isha exact, Fajr/Asr 0–2 min later; Riyadh 5 Oct 2026 exact | `AFTER_CEIL` in `frontend/src/app/practice/times.ts` |
| Suhoor end = unrounded Fajr rounded **down**; Fajr prayer rounded **up** | Caution runs in opposite directions for fasting and prayer; on 8 Feb 2027 the screen shows suhoor ends 5:12 and Fajr 5:14 (official 5:12). ⚠️ Mohannad to confirm this 2-minute gap is acceptable and not an «imsak» | `fastingTimes` in `times.ts` |
| Kuwait, Qatar, UAE use `adhan`'s Kuwait/Qatar/Dubai methods; every other non-Saudi country uses MWL | research/05 §4 proposal; not yet verified against those timetables ⚠️ | `methodFor` |
| City list: GeoNames, 1,201 cities (≥100k in persona countries, ≥500k elsewhere, capitals), none above 48°; suggestion = device time zone, capital first | PRC-01 R2 example (Riyadh first though Jeddah is larger); 48° owner decision; small enough to ship offline (147 KB, lazy) | `content/practice/build_cities.py` |
| Optional geolocation only picks the nearest listed city, then is discarded | Location never leaves the device (rules §4) | — |
| Prayer reminders on the web are in-app toasts while Rafeeq is open, silent, with an explicit note | Web cannot schedule offline notifications without a server holding the user's schedule (would break PRC-05 R6); no Rafeeq tone yet and adhan waits for permission | Native app wires `upcomingReminders()` to local notifications |
| Sighting announcements: table `prc_sightings`, ±1-day rule, team-only POST as interim; the SPA reader is not built | No stable machine-readable source yet (PRC-04 open question). The POST carries the expected date because the server has no Umm al-Qura library (no new dependency added) | Build the reader; add a Hijri library to compute `expected` server-side |
| Adhkar: one review item per dhikr per language (`dhikr`, 60 items); chapters in v1: 27, 25, 28, 1, 10, 11, 13, 14, 8, 9, 69, 70; dhikr 110 excluded | PRC-07 R1 (hide unapproved dhikr individually); 110 names whole surahs rather than quoting a verse | `content/practice/adhkar.json` |
| Verses inside adhkar replaced by QuranEnc references; English Hisn text hidden where it is itself a Quran translation; a lone full stop left after a verse span is dropped | rules §1.3 (Quran only from the stored record) | `verses` map in `adhkar.json` |
| **No tap counter** for adhkar although the build brief asked for one | `features.md` PRC-07 row, research/07 and `data/hisnmuslim/README.md` all say «no counter, no tracking» (Ibn Uthaymeen, IslamQA 109125). The repeat count is shown as text | Product owner + Sharia reviewer decision, then a rule change |
| Adhkar audio served only from Rafeeq (`/api/practice/adhkar/audio/<id>.mp3`, files in git-ignored `data/hisnmuslim/audio/`); no file → no button | No third-party request reveals what the learner listens to | Copy the 397 MP3s to the server |
| Tagalog adhkar: Arabic + audio, no meaning | Source has ar/en only; no machine translation | A licensed Tagalog Hisn al-Muslim |
| Short Sharia lines (qibla reassurance, «follow your country's announcement») go through the review desk as `practice_line`; en/tl drafted by Claude | rules §1.4; nothing shown before approval per language | `content/practice/lines.json` |
| Custom habits default to worship (private, no count); worship habits keep only today's mark, no history | Safest reading of rules §3; Ibn Uthaymeen's view on tracking tables is an open question for Mohannad | `habits.ts` |
| No `HabitKept` event is sent | Nothing in Motivation consumes it and it would move habit data off the device | When MOT adds a consumer |

## Security review (2026-10-05, read-only pass) — status

Fixed: #2 ex-mentor kept access to a closed thread (`companion/inbox.py`), #4 deploys only from `main` (`deploy.yml`).

Open, in priority order (details in the review notes; next session fixes these first):
1. **Host router logs visitors' real IPs** (`~/claude-works/nginx-app-router/generated/rafeeq.conf`, combined format, 14 days). Needs the router's access-log option for this app set to off, and purging `rafeeq.access.log*`. Outside the repo.
2. Push endpoint SSRF: allow only known push-service hosts; no redirects.
3. CI runs on the production host for any branch/PR: give CI a separate unprivileged runner.
4. Guests can drain the AI budget (explain/guide): daily per-key and global caps, cache explanations.
5. Forged guest tokens can flood urgent requests: HMAC-signed tokens, global urgent cap.
6. Username enumeration (`/username-available` unthrottled, login timing): rate-limit, dummy hash on misses.
7. Password change keeps other sessions: revoke refresh sessions on password/2FA change.
8. Security headers missing on the app shell (add_header in locations), no CSP/frame-ancestors, add `no-referrer` meta.
9. Verifier copy check for scripture only in Arabic (`knowledge/verify.py`): run for all languages.
10. Low: invite reuse race, login-limit key strip, mentor gender change, outbox rows linking install and account, admin approving challenge text, small-cohort suppression, push stays linked after sign-out, db container gets all secrets.
