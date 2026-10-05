# Decision log and open questions

Newest first. "Why" and "rejected" let anyone revisit a decision without re-arguing it.

## Decisions

| Date | Decision | Why | Rejected alternatives |
| --- | --- | --- | --- |
| 2026-10-05 | Daily adhkar (PRC-07) use Hisn al-Muslim from hisnmuslim.com; text and audio links kept in `data/hisnmuslim/`, audio files out of git | The site approved use and says the data is public; it has Arabic, English and per-dhikr audio. Domain owner's choice | HadeethEnc only (fewer adhkar); recording our own |
| 2026-10-05 | Prayer reminders (PRC-05) go up to five a day and never back off; the one-a-day, back-off rule applies to learning reminders only. ⚠️ `rules.md` wording awaits the product owner | Users choose prayer reminders themselves. Domain owner's choice | One reminder a day for everything |
| 2026-10-05 | Reminder sound: Rafeeq's own non-musical tone (PLT-07); adhan option = first two takbirs by a Haramain muezzin, only at the time itself, once permission is granted | Brand recognition without revealing religion; IslamQA 115674 allows the adhan at the real time only. Domain owner's choice | Full adhan; any adhan before the time |
| 2026-10-05 | Sighting announcements are published automatically from the Supreme Court statement on SPA, with no manual approval; a date more than one day from the expected date is rejected and the date stays "expected" (PRC-04) | No one has to be on call on the sighting night; the one-day limit blocks misreadings. Domain owner's choice | Team member approves each announcement |
| 2026-10-05 | The Umm al-Qura Hijri date is shown to every user in every country in v1 (PRC-04) | One calendar, computed on the device. Domain owner's choice | Per-country Hijri calendars |
| 2026-10-05 | Cities above 48° N or S estimate Fajr and Isha proportionally on latitude 45° (MWL Fiqh Academy, 1428H); until built they are left out of the city list; above 66° out of scope (PRC-01) | Library defaults give wrong times there (`research/05` §3.1). Domain owner's choice | `adhan` default high-latitude rule |
| 2026-10-05 | Sighting announcements in v1 cover Saudi Arabia only; elsewhere the expected date plus a line to follow the local announcement (PRC-04) | Only a Saudi announcement source is known and someone must approve each update. Domain owner's choice | Many countries from launch; no announcements at all |
| 2026-10-05 | Prayer times follow each country's official calendar (Umm al-Qura in KSA); where none exists, the Muslim World League method. The user is never asked about a calculation method or madhhab (PRC-01) | Follows what local mosques use; keeps new Muslims away from details they don't need; `research/05`. Domain owner's choice | User picks method and madhhab; one method for every country |
| 2026-10-04 | Docs use domains (strategic DDD) and behaviours (BDD Example Mapping: story, rules, examples, questions). Detailed tactical DDD (aggregates, repositories) is out of scope for docs | Domains give light limits for short-time work; behaviours become acceptance criteria and tests | Fully open creativity (not practical in 3 days); heavy DDD (over-engineering) |
| 2026-10-04 | Six domains: Learning, Motivation, Knowledge & Ask (with Discover), Companion & Community, Daily Practice, Platform. Organizations postponed | Product owner's choice | 8 domains with separate Discover and Content; Discover inside Platform |
| 2026-10-04 | Worship is tracked privately with no rewards; points and badges only for learning and non-worship habits | Riya' risk; rewards must stay secondary to intention | Worship habits with gentle rewards; no worship tracking at all |
| 2026-10-04 | XP points for learning only | Product owner's choice | No points (research recommendation) |
| 2026-10-04 | Individual leaderboard, opt-in, learning XP only, display name only | Product owner's choice | Group progress only (research and Muhannad's file); on by default |
| 2026-10-04 | No hearts/lives/energy, no leagues | Beginners need safe mistakes; competition risks riya' | Duolingo's full mechanics |
| 2026-10-04 | Scenarios written in Arabic (بافتراض / عندما / فإن); agents translate to English test names in code | Team reads Arabic | Arabic Gherkin dialect; English Gherkin |
| 2026-10-04 | Runtime corpus = license-permitted sources (QuranEnc, HadeethEnc, IslamHouse, Bayan, Quranpedia, binbaz with citation); others link-only until permission | Licenses (`research/03`) | Indexing all approved sources regardless of terms |
| 2026-10-04 | Prayer times on-device; no location to servers; adhan reminders wait for a native wrapper | Privacy; web push cannot schedule offline | Aladhan API; push server with users' schedules |
| 2026-10-03 | Optional account with three generatable fields and optional email 2FA | Minimum data; users may hide their conversion | Mandatory account with phone or email |
| 2026-10-03 | Approved sources: challenge package plus IslamQA, binbaz, ICSA encyclopedias, on equal footing | Product owner's choice | Package only |
| 2026-10-03 | Web first; native later if time allows | Fastest to build and test in 3 days | Native app first |
| 2026-09-29 | No Al-Fatiha recitation coach; no transliteration | Sharia concern about writing Al-Fatiha in non-Arabic letters; voice assessment not feasible now | Transliteration; voice recitation scoring |
| 2026-09-29 | Name: رفيق | Expresses companionship | سند، مطلع، يقين |
| 2026-09-26 | Answer by retrieving approved content, never by generating a fatwa | Safer; less hallucination | Model answers in its own words |

## Open questions

| Question | Owner | Due |
| --- | --- | --- |
| Confirm the P1 cut in `../features.md` | ناصر بن عبدالعزيز | Oct 4 |
| Stack: language, framework, database, hosting, models on OpenRouter | ناصر بن عبدالعزيز | Oct 4 |
| Owner of Companion & Community | ناصر بن عبدالعزيز | Oct 4 |
| Who acts as mentor during testing and judging; which helpline numbers per country (official sources only) | Companion owner | Oct 5 |
| Recruit 5–8 testers from the target group (dawah office contact) | ناصر بن عبدالعزيز | Oct 5 |
| Send permission requests listed in `sources.md` | مسلّم بن عبدالعزيز | Oct 6 |
| Habit graduation threshold | ناصر بن خالد | Before PRC-03 |
| Named scholar review of the motivation design | مهند بن صالح | Before public launch |
| Open-source license for the repo | ناصر بن عبدالعزيز | Oct 6 |
