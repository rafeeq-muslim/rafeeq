# Decisions for the product owner's review

Written by Claude during the overnight build (2026-10-05/06), at the product owner's request to decide as an expert product engineer and gather every decision here. Each line says what was decided, why, and what it would take to change it. Product rules in `docs/agents/rules.md` were never changed; where a PRD and a rule disagreed, the rule won (see `conflicts.md`).

## Postponed: needs you (5)

| # | What | Why it waits for you | Until then |
| --- | --- | --- | --- |
| 1 | **Email provider for two-step sign-in codes** (PLT-02 R6) | Needs an account with a mail service (e.g. Amazon SES, Postmark, or a Google Workspace SMTP relay) in the organisation's name; I must not create accounts | The feature is fully built and tested; the app says «إرسال الرموز بالبريد غير متاح الآن». Add `SMTP_HOST/PORT/USER/PASSWORD/FROM` to `~/.config/rafeeq/secrets.env` and redeploy |
| 2 | **Who watches urgent requests at night** (the verified helplines are done: research/08, see «CMP-01..06 rewrite» below) | Urgent requests reach every mentor's and team member's inbox at once, but nobody is on call yet | Danger cases show «تحدث مع إنسان الآن» (our team) and the official helplines for Saudi Arabia and the Philippines; other countries get "call your local emergency number" |
| 3 | **Permission letters**: islamqa.info (AI and app use of the offline archive), binbaz.org.sa (AI use), IslamHouse (own API key, self-hosting the Osoul videos and Al-Fatiha audio), dorar.net (stays link-only) | Sending email on your behalf needs your approval | islamqa is indexed on your explicit instruction and labelled "permission pending"; its files stay outside the public repo; dorar/islamenc/dawa.center are link-only |
| 4 | **Prayer reminder: show the prayer name by default?** The Sharia reviewer asks for «أظهر اسم الصلاة» on by default; rules.md §4 says notifications are neutral by default (learners who hide their Islam). Question addressed to ناصر بن عبدالعزيز in `docs/agents/decisions.md` | Product owner's call. Reviewer's proposed solution (decisions.md): no default; ask once when prayer reminders are first turned on, «هل تريد أن يظهر اسم الصلاة في التذكير؟ قد يراه من ينظر إلى شاشة جوالك.» It keeps rules.md §4. Ready to build as soon as you approve | Stays neutral (off) until decided |
| 5 | **Native Tagalog review** of exercises, objectives and UI strings | Needs a fluent speaker | Tagalog is live after approval but marked as needing review in `frontend/src/app/i18n/tl.ts` and `content/README.md` |

## Rule change applied (2026-10-06)

- **Merged content is shown to learners directly** (product owner; rules.md §1.4): the Sharia reviewer reviews before merge (logs in `content/units/*/review.md`, `content/lessons/REVIEW.md`). Implemented centrally in `backend/app/knowledge/review.py` `published()`: lessons, units, adhkar, daily cards, library, recitations and glossary serve the merged text; the desk can still confirm a version or return it with a reason, which withdraws that version in that language until corrected. Mentor-written challenge text is not merged content and still needs in-app approval.
- **Live now without a review log entry** (for مهند to check on the live site, as he decided for u2-l3…u6-l4 in `content/lessons/REVIEW.md`): lessons u2-l3 to u6-l4; the AUTHORED Tagalog in `content/tools/edits.py`; the English and Tagalog qibla and Ramadan lines in `content/practice/lines.json` (drafted by Claude). Sourced and unchanged: Hisn al-Muslim adhkar (Arabic, English), HadeethEnc daily cards, IslamHouse library and recitation entries. Returning any version in the desk withdraws it at once.

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
| Arabic wording replaces transliteration in English and Filipino, and a phrase's meaning stays, labelled «Meaning:» / «Kahulugan:» (reviewer decision 2026-10-06). Unit 1 by مهند; units 2–6 through recorded edits in `content/tools/edits.py`, applied after the build's coverage check and undone by the validator before its fidelity check. Two Tagalog phrasings were written by Claude and are marked AUTHORED for native and Sharia review | مهند's decision in PR #6 | Edit `content/tools/edits.py`, then `tools/build.py` and `tools/validate.py` |
| Wiping over socks: all languages say «what requires wudu or ghusl» (reviewer decision 2026-10-06: the printed Arabic edition is the reference) | Decided by مهند in PR #6 | `content/tools/edits.py` |
| **Approval stores a snapshot**: learners always get exactly the approved text; an edit waits for re-approval while the old approved text stays visible | KNW-05 R3 | — |
| Team accounts can preview lessons still in review (switch on the path) | The team must walk the product before approval without showing it to learners | — |
| Ordering and matching exercises use taps, not drag | Reliable with one thumb, screen readers and both directions | — |
| A returning wrong exercise starts fresh; no limit, no penalty; the feedback shows the card text | LRN-03 R3 | — |
| Path nodes gained a fourth state, **open** (unlocked by placement) | LRN-02 and LRN-05 together need it; showing a check mark would claim completion | — |
| Placement asks knowledge questions only, offers «لا أعرف», and never marks answers | LRN-05 R5 and rules.md (no "do you pray") | — |
| Lesson completion shows a **unit flower** gaining the earned petal; badges are celebrated first | One orchestrated moment of delight, from the brand's petal geometry | — |

## Fixes from the reviewer's site test (issue #9, 2026-10-06)

| Decision | Why | To change |
| --- | --- | --- |
| An objective enters review only after its lesson is completed (seeing a card in an unfinished lesson does not count) | The reviewer saw «2 objectives to strengthen» before finishing any lesson; LRN-04 R1 counts «اطّلع», which LRN-10 defines as seeing the cards, so this narrows it to completed lessons | `completedObjectives` in `frontend/src/app/learning/reviewItems.ts` |
| An objective answered less than an hour ago waits before it returns in review; review prefers an exercise the learner has never answered | The reviewer met the question he had just answered twice; LRN-04 R2 asks for an exercise not answered last time | `REVIEW_PAUSE_MS` in `frontend/src/app/learning/review.ts` |
| The guide's fixed message names lessons («أشهد»), not objective texts, with Arabic punctuation in Arabic | Objective texts are written for the team in the third person («يعرف…») | `fixedMessage` in `frontend/src/app/ask/guide.ts` |

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

## Assistant reliability and sources (KNW-01 reliability, KNW-02 source coverage, 2026-10-06)

Reports: `implementation/KNW-01-chatbot-reliability-report.md`, `implementation/KNW-02-source-coverage-report.md`.

| Decision | Why | To change |
| --- | --- | --- |
| **Product owner's decision (2026-10-06): islamqa (الإسلام سؤال وجواب) is a main source of the assistant**, Arabic and English, in the default `KNW_ANSWER_SOURCES`; its whole set is embedded within the first day after deploy (embedding job: own ceiling `AI_EMBED_DAILY_BUDGET_USD` $1.00/day under the $10 total, 4,000 passages every 10 min; ≈ $0.63, ≈ 4–8 h); on a near tie with another source islamqa ranks first (`KNW_NEAR_TIE_EPSILON` 0.0006 on the fused score, plus a shared retrieval channel and close underlying scores); its cards read «الإسلام سؤال وجواب» / "IslamQA" and link to islamqa.info | Owner's instruction. Not a quota: no irrelevant islamqa passage is added or cited, a clearly better passage of another source is never dropped, every citation is still verified. The permission status in `docs/agents/sources.md` is unchanged (request still to send) | `KNW_ANSWER_SOURCES`, `KNW_NEAR_TIE_EPSILON=0` |
| Until islamqa has vectors it is searched by words only; one dev measurement showed its word matches pushing a useful HadeethEnc passage out of an English answer's context | Measured once; the PRD forbids changing ranking on one case. **Accepted by the product owner (2026-10-06)** for the few hours of embedding: S07 requires the text fallback, so no coverage gate | — |
| Failures are no longer shown as «لم أجد جوابًا موثّقًا»: `no_source` (healthy search, not enough evidence), `verification_failed` (a composed answer failed the checks), `unavailable` (outage, deadline, budget, degraded search) | All 8 production «no source» answers before the change were compositions rejected by the checks (none was an empty search or an outage) | No flag (PRD) |
| One bounded repair of a rejected composition, then every check again (`ASK_REPAIR_ENABLED` on) | Local smoke: 2 of 6 real questions were answered only thanks to it; ≈ $0.0013 and 5–9 s extra when used | `ASK_REPAIR_ENABLED=false` |
| Search-only normalization on (`ASK_QUERY_NORMALIZATION_ENABLED`): «مامعنى» → «ما معنى» at the first word only, never «مالك»; negation and personal details kept | Acceptance and safety tests pass (KNW-01 report §3) | `ASK_QUERY_NORMALIZATION_ENABLED=false` |
| Approved FAQ answers on by default (`ASK_APPROVED_FAQ_ENABLED=true`) | `content/knowledge/approved-answers.json` holds 9 answers to the three starter suggestions (ar, en, tl), each approved by the Sharia reviewer مهند بن صالح الفوزان on 2026-10-06 with the passage versions they cite; only `approved` entries with a reviewer and a date are served | `ASK_APPROVED_FAQ_ENABLED=false` |
| Budget reason `service_limit` (not retryable) added to the PRD's suggested public codes | The PRD says `retryable` must be false for budget or configuration failures, which "temporarily unavailable" would contradict | — |

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

Fixed (2026-10-05/06):
- #2 an ex-mentor kept access to a closed thread (`companion/inbox.py`).
- #3 push SSRF: only the browsers' push services are accepted, redirects never followed (`platform/push.py`).
- #4 production deploys only from `main` (`deploy.yml`).
- #5 AI budget drain: a daily ceiling (`AI_DAILY_BUDGET_USD`, default $0.75, resets 00:00 UTC) on top of the $10 total, and daily per-client limits on explain/guide.
- #6 urgent-request flooding: limits per address (memory only) and a global urgent cap.
- #7 username enumeration: the availability check is rate-limited; login misses cost the same as real checks.
- #8 a password or two-step change ends every other signed-in device; the current device gets a fresh session.
- #9 security headers on every response including the app shell: CSP (`script-src 'self'`, media only from the approved sources' hosts), `frame-ancestors 'none'`, nosniff, no-referrer, HSTS. Checked with zero CSP violations on the app and the landing page.
- #10 the scripture-copy check now runs for every language.
- Low: invite claimed atomically; login limit key normalised; only the Sharia reviewer approves challenge text; sign-out unlinks the account from push; opt-out and account deletion remove event history that links the device or the account.

Accepted by the product owner (2026-10-06), no action:
1. The host router keeps its standard access log (visitor IPs, 14 days). The app itself still stores no IP (rules.md §4 inside the app).
2. CI keeps running on the production host's runner. Accepted because the repo is private, only team members push or open PRs, deploys run only from `main`, and dependencies are locked; the residual risk is a malicious dependency or a stolen member token.

Still open (small, can be done without the server owner):
3. Mentor gender can be changed freely after sign-up; decide whether a gender change needs the team's confirmation.
4. The database container receives the whole secrets file; split a database-only env file.

## CMP-01..06 rewrite (PR #21, implemented 2026-10-06)

Branch `cmp-01-06-companion-rules`. Plans in `implementation/CMP-01.md` … `CMP-06.md` («Rewrite (PR #21)» sections). Migration `a6b7c8d9e0f1` (additive only, so the previous image still runs).

| Decision | Why | To change |
| --- | --- | --- |
| **Requester's gender** is stored on each help request (the existing `prefer_gender` column, now meaning the requester's own gender). An account uses its own gender; a guest answers «أخ أم أخت؟» once, the device keeps the answer (`rafeeq.companion` storage) and a later request from the same guest token reuses it. An account without a gender is asked the same way, and the answer is **not** written to the account | CMP-01 R3; rules.md §4 and conflicts #14 (gender only for matching, never at sign-up) | `help.py::_requester_gender` |
| Account requests made before the rule took the account's gender in the migration; requests whose gender is unknown (guests before the rule) stay visible to any responder in their language | They cannot be routed otherwise; they disappear as they close | Close them by hand if the team prefers |
| **Who answers same-gender requests:** mentors and **team members who have a gender**, in their languages. Team members without a gender see urgent requests only | CMP-01 R3 ex1 «المرشدات وأخوات الفريق» | `inbox.py::visible_clause` |
| «Available» for CMP-01 R3 ex3 = a mentor of that gender and language who has not paused, or a team member of that gender and language. The requester sees «ستردّ عليك أخت/سيرد عليك أخ حين يتاح» while nobody is available; the request is never shown to the other gender | CMP-01 R3 ex3 and its «حتى يُحسم» (sisters' requests stay with sisters) | `common.py::same_gender_available` |
| **Pause** (CMP-02 R4) also stops new requests from the pool, not only new mentees. Current mentees, threads already claimed and **all urgent requests** still reach the mentor | «يوقف الاستقبال» read as receiving anything new; urgent stays because danger goes to a human at once (rules.md §2.8) | `inbox.py` (`paused`) |
| **Scholar referral** (CMP-02 R5, open question default «المراجع الشرعي»): the mentor refers one learner message; the reviewer (`sharia_reviewer` role, screen `/referrals`) sees **only that question and its language**, answers once, and the answer appears in the same conversation signed «أهل العلم», never by name. The learner sees «أُحيل سؤالك إلى أهل العلم، وسيجيبونك هنا». Neutral pushes both ways | Minimum data (rules.md §4); no fatwa by mentors (rules.md §1.1 D) | `referrals.py` |
| The danger exception to same-gender (README; research/08 §2) is implemented as before: urgent requests reach everyone and the first available person answers | README fixed rule | ⚠️ for the Sharia reviewer to confirm (research/08 marks it so) |
| **Report reason «خطر على أحد»** (`danger`): priority `danger`, first in the team queue, a neutral push to the team at once. It hides the message for the reporter only (it is not one of the three dangerous reasons that hide for everyone). Dangerous reasons (marriage, money, recruitment) now also alert the team at once | CMP-04 R2, R3 and its open-question default | `safety.py` |
| **25 group members per mentor** counted as the sum of his groups' caps (so raising a cap is refused like creating a group, CMP-05 R1 ex3); a new endpoint lets the mentor change a cap (2–15, not below current members) | The example blocks raising a cap even with no new member | `groups.py::_check_member_limit` |
| **Helplines** bundled in `frontend/src/app/companion/helplineNumbers.ts` exactly as in research/08 (SA 911, 999, 997, 998, 1919, 937; PH 911, 1553), shown at once in the assistant's danger panel and in every urgent conversation, one tap to call. The country is guessed **on the device** from its time zone (Asia/Riyadh, Asia/Manila) and can be switched; other countries get «اتصل برقم الطوارئ في بلدك» and no number. The old «أرقام الطوارئ في بلدي» button was removed (the numbers are already on screen). Arabic labels translated from research/08's English | README fixed rule; rules.md §2.8; location never leaves the device | Re-verify every six months (sources.md) |
| **Attaching the assistant question** (CMP-01 R1 ex2): a checkbox, off by default, shown only when the question is still in this visit's memory; when ticked, the question is placed in the person's own first message under «سؤالي للمساعد:». The server never looks it up | rules.md §2.9 and CMP-01 R1 | `HelpScreen.tsx` |
| «زائرة 4821» is shown to a sister for a guest's request (CMP-02 R6 ex1); urgent requests keep «زائر» (gender unknown) | Same-gender routing means the responder's gender is the requester's | `InboxThread.tsx::requesterName` |
| **Private notebook** (CMP-06): browser storage only (`rafeeq.notebook`), no API, no event, no count sent (the success metric «number of questions sent» is not collected yet, to keep data minimal). A question sent to the mentor becomes an ordinary message in the mentor thread; to the assistant, it is handed to the Ask screen through the route state (never the URL) and asked as an ordinary typed question. Sent questions stay in the notebook marked as sent; offline, nothing is sent and the question stays marked «لم يُرسل بعد». Questions are capped at 600 characters (the assistant's limit). A test fails if any file other than the notebook screen reads it | CMP-06 R1–R5; rules.md §1.2, §4 | `notebook.ts`, `Notebook.tsx` |
| Tagalog strings for all of the above were written by Claude | No fluent reviewer available | Postponed item 5 |

**Conflicts with `rules.md` (rules kept):**
- None blocking. One tension written down: a **sister's question referred to the Sharia reviewer** (a man) is answered by him in her conversation. It is one answer to a question, signed «أهل العلم», with no reply thread to him, which keeps the README rule (no private man–woman chat) as far as the current team allows. ⚠️ For مهند and the product owner: name a female scholar for sisters' referrals if needed.
- rules.md §4 «Mentors see only what the user allows»: the referral shows the reviewer one message the learner wrote to a human, without any identity. The feature document asks for no consent step; if the product owner wants one, add «أتسمح بإرسال سؤالك إلى أهل العلم؟» before the referral.

**Feature documents:** not edited (no factual mismatch found). `agents/sources.md` (helpline row: where the numbers are now used) and `design-system.md` (DangerHelpPanel props) were updated.

## PLT-01..07 (PR #25, implemented 2026-10-06)

Branch `plt-01-07-platform-rules`. Notes in `implementation/PLT-01.md`, `PLT-02.md`, `PLT-03.md`, `PLT-05.md`, `PLT-06.md`, `PLT-07.md`. Migration `b7c8d9e0f1a2` (additive only).

| Decision | Why | To change |
| --- | --- | --- |
| **Privacy policy** at `/privacy`, outside the first-run guard, in ar/en/tl; linked from the language screen, «حسابي», account creation (above the fields) and «أريد إنسانًا» (above the message box). Text = research/09 §7 **corrected to match the code** (eight corrections listed in `implementation/PLT-05.md` §2, e.g. the interface language is always stored, the host router keeps IPs for 14 days, push subscriptions keep a random device number) | PLT-05 R1, PDPL art. 12; «fix the text, not the facts» | Product owner approves the text (PLT-05 open question); English and Tagalog written by Claude |
| **Data copy** = one JSON file: the device's `rafeeq.*` data (guest help token masked) + `GET /api/me/export` for an account. Each domain exports its own data (`*/export.py`); Platform joins them. Nothing about another person (a mentor's **display name is left out** too, replies show «mentor»/«scholar»; blocks show dates only; groups led show no members or join codes) and no secret (no hash, session, code, push endpoint/keys, invite or join code). 10 exports per hour | PLT-05 R6 «لا شيء فيه عن غيرها», PDPL art. 4; domain boundaries | `backend/app/*/export.py` |
| **Erase this device** also deletes a guest's conversations with a person and its blocks on the server (`DELETE /api/help/guest`) and the push subscription; reports it filed stay for the team without the device token. Anonymous events keep their random install id, which no device holds any more (sending `opt_out` would count as an opt-out in MOT-08) | PLT-05 R4 and the open-question default «تبقى حتى يحذف حسابه أو يمسح بيانات جهازه» only holds if erasing really deletes them | `help.py::erase_guest` |
| **Account deletion** now also deletes the person's own **group messages** (Companion handles `AccountDeleted`); a mentor's replies stay in the learners' own conversations without a name; reports stay without the reporter | PLT-05 R5 ex1 «لا يبقى لها اسم في المجموعة», and the messages are her data; the learner's conversation is the learner's | `companion/events.py::on_account_deleted` |
| **Quick exit**: Shift pressed three times within 5 seconds with no other key between, only while quick exit is on; the page is covered at once, then BBC Weather replaces it. The setting says history may keep Rafeeq and how to remove it | GOV.UK «Exit this page» (research/09 [G1]) | `lib/privacy.ts` |
| **Replies switch** (`replies_enabled`, off for new devices). Existing subscriptions are set **on** by the migration, because they were receiving replies after the person turned notifications on; nobody silently loses a reply. The same switch carries **mentors' and the team's** new-message, urgent and report alerts (they are «replies and messages from a person» for that device) | PLT-06 R1/R2; keeping danger alerts reaching people already relying on them | ⚠️ For the product owner: a separate staff switch («رسائل العمل») if mentors find the label unclear |
| With both push types off the subscription is deleted on the server and in the browser; turning one on again re-subscribes without a new prompt | Minimum data (rules.md §4) | `push.ts::dropIfUnused` |
| Permission is requested only from a switch the person taps and only while the browser has not answered; once refused, Rafeeq never asks again and explains how to allow it. iPhone/iPad outside the Home Screen (user agent + display mode) get the «add to Home Screen» note and disabled switches | PLT-06 R1, R4, R5; WebKit [W1] | `push.ts::pushState` |
| The **prayer reminder** switch in «حسابي» turns PRC-05's on-device reminder on/off; prayers and timing stay on `/practice/reminders`. It needs no permission (in-app while Rafeeq is open) | PLT-06 R2 and its open-question default | Native app: local notifications |
| **Rafeeq tone** is inert: `APPROVED_TONE = null`, no audio committed; the switch appears only once a tone is approved; it would play only for in-app prayer reminders while the page is visible | PLT-07 R1 and its default «بلا صوت»; no file approved by مهند exists | Add the file + approval in `lib/tone.ts` and `sources.md` |
| **Discreet mode** changes the page title and the in-app prayer reminder; server pushes are always neutral. ⚠️ Chrome on Android shows the site address (`rafeeq.nan.sa`) under every web notification; a page cannot hide it | PLT-05 R3, PLT-06 R6 | Product owner: a neutral domain for the app if this matters for hidden converts |
| **First screen**: the device language carries «مقترحة» in its own script; `/welcome?lang=xx` starts at the introduction in that language and the query is dropped; a deeper first-run link passes only `lang`; the landing page passes the language only when the visitor chose one there. A never-started browser at the bare address `/` still sees the public landing page (its button opens the language screen); erasing the device goes straight to the language screen | PLT-01 R1, R2, R6 | `AppLayout.tsx` (landing redirect) |
| **PLT-02 R3 bug fixed**: the credentials screen after sign-up was replaced by the account settings at once (the person never saw the generated password). The no-recovery warning now also shows **before** creating (R4) | PLT-02 R3, R4 | `Account.tsx` |
| **Missing Tagalog** UI text falls back to English, then Arabic, never the key or a blank. Approved content picked with `pick()` is unchanged (no other language's text shown in its place) | PLT-03 R6; approval is per language | `i18n/index.ts::translate` |
| PLT-03 R5 is met by the KNW-03 service (tested with «Tawhid»), but `content/glossary/terms.json` is still empty and lessons do not substitute terms yet | KNW-03 open question (the reviewer picks the first terms) | مهند picks the terms |

**Conflicts with `rules.md` (rules kept):**
- rules.md §3 «at most one notification per day, back off when ignored» vs PLT-06 R2 «prayer reminder up to five a day, never backs off». Kept as decided for PRC-05 on 2026-10-05: §3 governs motivation (learning) notifications; the prayer reminder is a tool the person configures and stays on the device. The learning reminder keeps §3.
- None other. Quick exit navigates to a third-party page (BBC Weather) but loads nothing from it into Rafeeq, so rules.md §4 «no third-party fonts/CDNs at runtime» is kept.

**Pending a human:** the policy text (product owner, and a legal read against PDPL), the data controller's name and contact for the policy (PLT-05 open question), the tone (design: ناصر بن خالد; approval: مهند), native Tagalog review of the new strings, the first glossary terms, and the notification domain question above.

**Feature documents:** not edited (no factual mismatch with the code). research/09 §7 was left as the proposal; the corrected wording lives in the app and `implementation/PLT-05.md`.

## CMP audit gaps (cmp-audit-gaps)

Branch `cmp-audit-gaps`. Notes in `implementation/CMP-01.md` and `CMP-04.md` («Audit gaps» sections) and the new `implementation/danger-handling.md`. No migration.

| Decision | Why | To change |
| --- | --- | --- |
| «أريد إنسانًا» on lesson and review headers is an icon (44px, label for screen readers) below 380px instead of being hidden | CMP-01 R1: visible on every lesson and review screen; safety | `HumanHelpButton compact` |
| The contact filter also refuses handles next to a network name («snap: …», «سناب …», «@name») and **any** URL or bare domain, including Islamic sites. A handle without «:» must look like one (digit, «_», «.» or «@»), so «a telegram group» passes; a 7-digit number passes alone (often an amount) but not with a separator («555-1234») | CMP-01 R5 «روابط تواصل خارج رفيق»; the audit asked for general URLs. Quran references and dates must never be refused | `companion/text.py`. If mentors need to share links to sources, allow a list of approved domains there |
| The sister/brother-per-language reminder is a card on the team screen (counts only, no names): per language × gender, how many can answer and how many take requests now (a paused mentor does not count); also how many responders have no gender (they see urgent requests only) | CMP-01 open question default «يُذكَّر الفريق بحاجته إلى مرشدة بكل لغة» | `coverage.py`, `ResponderCoverage.tsx`. A push to the team when a slot empties was not built |
| A responder (mentor or team member who can open the request) can report the learner's message with the same reasons; marriage, money and recruitment hide it from everyone but its author until the team reviews it (the learner sees it marked «أُخفيت للمراجعة»); other reasons hide it for the reporter only | CMP-04 R1 «ومن يرد على الطلب», R2, R5 | `safety.py::report` |
| A mentor's or team member's **gender is locked once set**; only an admin changes it (Admin screen → user → gender). Mentors and team members without a gender set it once in «حسابي» → account settings. Learners can still change theirs in the choose-mentor form | Security: gender decides which same-gender requests a responder sees | `platform/auth.py::set_own_gender`. Admin-only today; let the team change it too if the product owner prefers |
| Danger handling has no feature document since PR #21; a factual note (`implementation/danger-handling.md`) lists where it lives and its tests. No feature document was written | Asked by the audit; feature documents need an owner | ⚠️ **Decision needed: who owns danger handling** (domain owner and a feature document) |

**Not built, need a decision:**
- **Referral consent step** (CMP-02 R5): ask «أتسمح بإرسال سؤالك إلى أهل العلم؟» before a mentor refers a learner's question? (see «CMP-01..06 rewrite» above).
- **A female scholar for sisters' referrals** (same section).
- **Request retention** (CMP-01 open question «هل يُحذف الطلب بعد مدة؟»; product owner). Until then requests stay until the account is deleted or the device is erased.
- **Who watches urgent requests at night** (postponed item 2), and the copy «سيتواصل معك أحد فريقنا بلغتك» in the danger panel while nobody is on call.
- **Group message notifications** (CMP-05 open question; product owner): until then no push for group messages.
- **An encrypted copy of the notebook in the account** (CMP-06 open question «حفظ الدفتر مشفّرًا في الحساب»; product owner): until then the notebook stays on the device only.

## PLT-09 organized home (plt-09-organized-home-build)

Branch `plt-09-organized-home-build`. Details in `implementation/PLT-09.md`. No migration. **Built behind `PLT09_ORGANIZED_HOME` (off by default)**: until the product owner and the PLT owner approve PLT-09 (its open question 1), Home, «كل ما في رفيق», Discover and «حسابي» are unchanged. To try it: `PLT09_ORGANIZED_HOME=true` on the API (everyone), or the team switch «الرئيسية المرتّبة (معاينة)» in «حسابي» (one team device).

| Decision | Why | To change |
| --- | --- | --- |
| One next-step card = the short review when it is due, else the next lesson | R1 «أو للمراجعة القصيرة حين تستحق، لا بطاقتان» | `NextStep` in `home/OrganizedHome.tsx` |
| On the first opening of the day (online) the main components wait up to 4 s for the model's order behind a skeleton; offline the fixed order shows at once | R5: positions must not move once shown; R4 ex3: offline without waiting | `ORDER_TIMEOUT_MS` in `home/useOrganized.ts` |
| «من المكتبة» picks the first approved item of the basics topic | Library items have no unit tags («يناسب وحدته») | `libraryPick` in `home/useOrganized.ts` |
| «اختر قارئك»: "opened listening" = a surah was played on this device; only when two or more approved reciters exist | R3; KNW-08 R4 reciters are gated by the reviewer and the picker shows from two | `eligible()` in `home/layout.ts` |
| Time-of-day bucket from the clock hour (04–06 fajr … 21–04 night), never from prayer times | R4: the location never reaches the model | `timeBucket()` |
| The model is the guide's (fast tier) with its own prompt `home_order.md`; same budget and spend guard | Open question 2's proposal; until decided the fixed order stays the fallback | `agents.order_home` |
| An optional component that stops being eligible leaves an empty slot for the rest of the day; a hidden one is replaced in its slot | R5 «يُحذف في مكانه دون أن يتحرك ما سواه»; R6 «يأخذ مكانه الاختياري التالي» | `daySlots()` |

**Pending a human:** approval of PLT-09 itself (open question 1), the ranking model (open question 2). MOT's pending badges / in-app reminder are mounted on the current Home only; add them to `OrganizedHome` when PLT-09 is approved.
