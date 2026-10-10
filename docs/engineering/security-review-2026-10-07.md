# Security and data-safety review, 2026-10-07

Asked for by the product owner once the repository became public: assume attackers read the code. Focus: denial of service and injection, then data safety. Three read-only audits ran on `main` (A: denial of service and limits; B: injection and access control; C: data safety and what the public repo reveals). Nothing was tested against production or third-party sites; timings were measured locally.

Each finding names its fix (pull request) or the accepted risk. Status is as of 2026-10-07. The two findings whose fix is not complete are listed in one neutral line each; their detail is kept with the team, outside the public repository.

## Summary

| | High | Medium | Low |
| --- | --- | --- | --- |
| A. Denial of service | 5 | 7 | 6 |
| B. Injection and access control | 1 | 6 | 14 |
| C. Data safety, public repo | 2 | 5 | 15 |

No SQL injection, cross-site scripting, server-side request forgery, path traversal, open redirect or mass assignment was found. The content security policy is sound, and a client cannot spoof its address to dodge a limit.

## High

| # | Finding | Fix |
| --- | --- | --- |
| A-H1 | **One guest message could freeze the whole API.** The contact filter (`companion/text.py`) backtracked exponentially on a spelled-out address followed by double-spaced «dot label» groups: 94 characters took 7.5 s, 102 over 20 s, on the event loop of the only worker. Reachable without an account through «أريد إنسانًا» | **Fixed, #107 (hotfix, live).** Linear patterns, whitespace collapsed first, bounded repeats, a 2000-character cap inside the filter; worst adversarial input ≈ 3 ms. Second layer, #118: the check runs in a worker thread with a time limit |
| A-H2 | **Rate-limiter memory could be exhausted without an account.** Keys were never deleted and could be as large as the 2 MB body (the sign-in username had no length limit) | **Fixed, #110 (live).** Hashed fixed-length keys, emptied keys removed, a sweep, a 50,000-key cap; bounded sign-in fields; per-address limit on `/login/2fa` |
| A-H3 | **One client could switch the assistant off for everyone.** AI limits were per account *or* per address, so free sign-ups and IPv6 addresses multiplied them: enough to burn the $0.75 daily ceiling, and over about two weeks the $10 total | **Fixed, #113 (live).** Limits count against the address (IPv6 by /64) *and* the account; a global cap of 120 AI requests a minute that degrades to the fixed replies; explain and guide cost at most 4 paid calls, home order 2. **Owner decision 2026-10-10 (plt-admin-limits): the global cap is removed** (other people's questions must never be refused, degraded or queued; OpenRouter serves concurrent users); the per-address/per-account limits, the per-client concurrency and the daily and total budget ceilings remain, and are now editable by the admin («الحدود»). |
| A-H4 | **The urgent (danger) channel could be flooded or blocked**: alerts and pushes to every responder were not bounded per sender, and a shared ceiling could turn a real request away | **Fixed, #118 and #114 (live).** An urgent request is never refused for volume; the push to everyone is limited instead (once per request, then at intervals while nobody holds it, with an overall ceiling, after which the team is told). Danger alerts from the assistant are limited per asker and per address. An answered urgent thread belongs to its holder and the team |
| A-H5 | **Anonymous usage events could grow without bound**, and clean-up queries scanned a growing table | **Fixed, #116 (live).** Events counted per device and per address in small batches; indexes on the outbox payload keys; nightly retention (90 days; the newest account status is always kept) |
| B-H1 | **A vetted mentor could end up with a different gender than staff approved**: approval kept the account's current gender, a learner could change theirs before approval, and an invite let the registrant choose. That would put a man in the sisters' pool, suggestions and groups | **Fixed, #114 and #117 (live).** Approval uses the application's gender (409 on a mismatch); invites carry a gender that sign-up enforces, and a mentor invite without one is refused at sign-up. Production had no applications and no mentors when found: nothing to repair |
| C-H1 | **The runners on the production server could be reached from pull requests.** A pull request runs its own copy of the workflow, so no condition in the file protects a self-hosted runner; the approval setting was the only control. | **Repo side fixed, #105 and #112 (live).** CI runs on GitHub-hosted runners with pinned actions; deploy requires `main`, the team repository and the protected `production` environment; outside contributors cannot open pull requests. |
| C-H2 | **A failed deploy printed backend log lines into the now-public Actions log**; database errors there could include bound parameters (search words, emails, contacts, hashes) | **Fixed, #112 and #110 (live).** The log goes to a 600-mode file on the server; `hide_parameters=True`. The two earlier failed runs were read: nothing sensitive in them |

## Medium

| # | Finding | Fix |
| --- | --- | --- |
| A-M1 | Database connections held across slow model and network calls (pool of 20): about 20 slow requests starved everyone | Fixed, #113: the connection is released before every model call, live-source read, library search and push; `pool_timeout` 5 s; at most 12 AI requests at once, 3 per client. **Owner decision 2026-10-10 (plt-admin-limits): the global ceiling of 12 at once is removed**; 3 per client remains (admin-editable). The connection is still released before every model call (tested with 100 questions at once); pool 30 + 10 kept open so a burst does not churn connections; the model client's pool is 1000 connections, uvicorn `--limit-concurrency` 1000 |
| A-M2 | Download centre: catalogue routes unlimited and rebuilt per call; no global cap on relayed streams | Fixed, #116: catalogue cached per language, routes limited, global ceilings for streams and size checks |
| A-M3 | Account copies (saved items, learning progress, learning log) had no total cap and merged item by item | Fixed, #116: ceilings per account, only ids of the path kept, one read per merge, per-account write limits |
| A-M4 | Conversation threads had no size cap and were read whole | Fixed, #116: the latest 200 messages with earlier ones on demand; daily ceilings per conversation; guest messages limited by address |
| A-M5 | Argon2 ran on the event loop; password change had no limit | Fixed, #113 (worker thread, 2 at a time) and #110 (limit) |
| A-M6 | The retrieval query could be made expensive | Fixed, #116: a bounded number of words, prefixes from 3 letters, a statement timeout. Search candidates unchanged for 30 of the 31 evaluation questions |
| A-M7 | External pages were parsed with patterns that were slow on hostile input | Fixed, #116: linear tag stripping with identical output, a page-size cap, parsing in a worker thread |
| B-M1 | A suspended, revoked or de-roled mentor kept full access to his groups | Fixed, #114 (access blocked; members keep the group). What becomes of such a group is an owner question |
| B-M2 | Opening a link could create an urgent request with no tap | Fixed, #118: the urgent screen starts only after the tap on the assistant's danger panel; a bare link shows the guidance, the helplines and the button |
| B-M3 | Any responder could read, answer and close any urgent thread, and close pool requests they did not hold | Fixed, #114 |
| B-M4 | Organisation dashboard small-number protection: further hardening | **Partly**, #114 (per-code daily link limit and counts for the admin). The lasting fix is a design decision for the owner |
| B-M5 | The contact filter was quadratic on other shapes too | Fixed with A-H1, #107 |
| B-M6 | A learner's or guest's gender is self-declared and changeable | **Partly**, #114: a guest's first answer is bound to the token; no change while the account has a mentor, a group or an open request. Self-declaration stays (owner decision) |
| C-M1 | `notify.yml`: no shell injection, but a stranger's pull-request title and branch reached the events log that AI build sessions read | Fixed, #112: fields blank for forks, an `external` flag, values cut to 200 characters. Sessions treat log fields as data |
| C-M2 | Production would start with the public default JWT secret if the setting were ever missing | Fixed, #110: production refuses the default or a short secret, and a short first-admin password |
| C-M3 | Logs could hold personal data (bound parameters, mail recipients, push endpoints); no log rotation | Fixed, #110 and #112 |
| C-M4 | The mentor applicant's contact should be encrypted at rest | **Ready, on hold: #111.** Waits for the owner to add two keys to the secrets file |
| C-M5 | Invite codes carried 32 bits, including admin invites | Fixed, #110: 128-bit codes and a global cap on failed claims |

## Low

| # | Finding | Fix or accepted risk |
| --- | --- | --- |
| A-L1 | AI budget check not atomic under concurrency | Fixed, #113 (estimated cost held until settled) |
| A-L2 | Host router cuts at 60 s, the live ask deadline was 60 s | Fixed, #113 (55 s) |
| A-L3 | No rate limit on cheap public routes | Fixed, #116: a generous per-address limit on `/api/` in the app's nginx |
| A-L5 | Library search fan-out multiplied by keys | Fixed, #113 (same keying; 3000 outbound searches a day) |
| A-L6 | Service-worker caches without expiry | Fixed, #116 (ceilings; chosen downloads untouched) |
| A-L7 | No uvicorn concurrency or keep-alive limits | Fixed, #113 |
| B-L1 | Source text was not fenced in model prompts; no check for links or markup in answers | Fixed, #118. To do once: run the KNW-04 evaluation on real models with the fenced prompts |
| B-L2 | `/api/learning/explain` took free text into the prompt | Fixed, #118: only the exercise's own ids |
| B-L4, C-L9 | Refresh cookie without a prefix; no Origin check on refresh and logout | Prefix fixed, #110 (`__Secure-`; `__Host-` is impossible with `Path=/api/auth`). Refresh and logout refuse a request from another origin, #118. **Accepted risk:** the cookie is not bound to this host alone |
| B-L9 | Reporting hid a message for everyone at once | Fixed, #114 (caps per reporter and per author) |
| B-L10 | A pending mentor application could be overwritten, or taken over by another account | Fixed, #114 |
| B-L11 | `_answers()` skipped the mentor gate | Fixed, #114 |
| B-L12 | Push endpoint check loose; a known endpoint's keys could be overwritten | Fixed, #118: exact hosts on port 443; only the device or its linked account changes a subscription |
| B-L13 | Library link check followed redirects to any host | Fixed, #118: the library's hosts only, each hop checked |
| B-L14 | Unknown lesson ids from anonymous events were listed to the team | Fixed, #118: only ids of the path are listed |
| C-L2 | Limiter keys from raw usernames | Fixed, #110 |
| C-L3 | Sign-in lockout trade-off | **Accepted** (`implementation/PLT-02.md` §3) |
| C-L4, C-L5 | Two-step codes: older codes stayed valid; attempts not atomic; `/2fa/confirm` unlimited | Fixed, #110 |
| C-L6 | Refresh-token handling: one further hardening step | **Deferred** (`implementation/PLT-02.md` §3) |
| C-L7 | Access tokens outlived a password change by up to 30 minutes | Fixed, #110 |
| C-L8 | `/api/me/password` unlimited | Fixed, #110 |
| C-L10 | Expired sessions and codes never purged | Fixed, #110 (daily) and #116 (outbox retention) |
| C-L11 | Account deletion left the account's id in some outbox rows | Fixed, #110 |
| C-L12 | API docs and schema public in production | Fixed, #110 |
| C-L13 | Database container settings to narrow | Ready with #111 (on hold) |
| C-L14 | Backup policy | **Accepted for now** |
| C-L15 | Password policy is a length minimum only | **Deferred** (`implementation/PLT-02.md` §3) |
| A/B/C | Per-address limits depend on the client address reaching the app correctly | **Checked safe** in audit A; the host router is outside the repo |

## What the public repository revealed

| Item | Status |
| --- | --- |
| The bootstrap admin's account name in two `STATUS.md` files | Removed from the tree, #112 |
| The server account's home-directory paths in infra scripts, docs and the deck sources | Replaced by `RAFEEQ_CONFIG_DIR`, `RAFEEQ_CORPUS_DIR`, `RAFEEQ_BACKUP_DIR` and `~/…`, #112 |
| Three personal email addresses in commit metadata | History only |
| No secret, key or token in the tree or its history; no seed or demo accounts; no real phone numbers | Checked |

## Outside the repository

Server-side steps for the owner are tracked privately.

## Decisions waiting for the owner

- What happens to the groups of a suspended, revoked or de-roled mentor (members keep writing; nobody moderates).
- Whether the team sees a whole escalated private conversation or only what follows the escalation.
- The default caps: 5 hides a day per reporter and 2 per author; 200 organisation links a day per code; 120 AI requests a minute; signed-in people behind one address share its AI allowance.
- B-M4 (the organisation dashboard's small-number protection) and B-M6 (self-declared gender): the lasting fixes are design decisions.

## Checked and found safe

- **SQL:** four `text()` uses, all with bound parameters; full-text terms are word tokens; the one `ILIKE` is escaped; no column or order from input.
- **Model outputs:** routes are enum-checked; cited ids must be in the retrieved set; source cards are built on the server from records, never from model text; no tool calls.
- **Live sources:** fixed hosts, https on 443, public-address check on every hop, 3 MB cap, HTML stripped to text.
- **Browser:** no `dangerouslySetInnerHTML`, `innerHTML` from data, `eval` or markdown rendering; external links pass a host allow-list; `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'` on every location.
- **Redirects and files:** nginx redirects are relative; the media route is a strict pattern; downloads go by catalogue id with a host allow-list and no redirects.
- **Access:** every object route checks its owner or role; roles are read from the database on every request; no CORS; cookies are HttpOnly, Secure and SameSite=Lax.
- **Authentication:** Argon2id; HS256 fixed on encode and decode; refresh tokens random, stored hashed and rotated; one-time codes hashed with five attempts.
- **Dependencies:** lockfiles present and used with `--frozen` / `npm ci`; no pinned version known to be vulnerable.

## Earlier review (2026-10-05), re-checked

Item 2 «CI keeps running on the production host's runner, accepted because the repo is private» no longer holds: see C-H1. Item 4 (the database container receives the whole secrets file) is ready in #111 (on hold). The items listed as fixed there were confirmed, with these residuals now closed: #2 ex-mentor access (B-M1), #5 AI budget (A-H3, A-L1), #6 urgent flooding (A-H4).
