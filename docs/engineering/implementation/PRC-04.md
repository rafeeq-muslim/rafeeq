# PRC-04 Hijri calendar and Ramadan mode: implementation

**Feature:** `docs/domains/practice/features/PRC-04-hijri-calendar-ramadan.md` · **Research:** `docs/agents/research/06-hijri-calendar-and-ramadan.md`
**Written:** 2026-10-05 by Claude (overnight build).

## 1. Rules → modules

| Rule / example | Module | What it does |
| --- | --- | --- |
| R1 (Umm al-Qura date for everyone, offline) | `frontend/src/app/practice/hijri.ts::hijriOf` | `Intl.DateTimeFormat('en-u-ca-islamic-umalqura')` parts → `{year, month, day}`; month names from UI strings. Same date in Riyadh and Manila for the same civil day |
| R2 (expected start, countdown) | `hijri.ts::expectedStart(month, from)` | Walks forward day by day to the first civil date whose Umm al-Qura date is `1/month`. «متوقع» until an announcement exists |
| R2 (announcement wins; ±1 day check) | backend `app/practice/sightings.py` + `hijri.ts::ramadanState` | `prc_sightings` rows (country `SA`). `validate()` rejects a start date more than 1 day from the expected date. The client uses an announced date when present, else the expected one |
| R2 (published without team approval) | `sightings.py::publish` | Called by the reader job; no review step. ⚠️ The SPA reader itself is not built tonight (see §5); a team-only `POST` is the interim entry point and goes through the same `validate()` |
| R2 (Manila, no announcement) | `PrayerScreen.tsx` | Expected date + the approved line `practice_line:ramadan_local` (shown only after Sharia approval) |
| R3 (suhoor ends at Fajr, iftar at Maghrib, no imsak) | `times.ts::fastingTimes` | Suhoor end = ⌊raw Fajr⌋ (never later than the official Fajr in the 40 checked days), iftar = Maghrib (⌈t⌉). No other "imsak" value exists in the code |
| R3 (time left to iftar) | `RamadanCard` in `PrayerScreen.tsx` | Countdown to iftar between Fajr and Maghrib |
| R4 (Isha +30 in Ramadan, KSA only) | `times.ts::dayTimes` | `UmmAlQura` method and the day is in Ramadan (announced, else calendar) → Isha + 30 min. Other methods unchanged |
| R5 (no fasting tracking) | — | No question, no storage, no event |
| R6 (nothing identifying leaves the device) | `GET /api/practice/sightings` | No query parameters; the same JSON for everyone; `Cache-Control: public` |

## 2. Endpoints (`app/practice/router.py`)

- `GET /api/practice/sightings` → `{"items":[{"country":"SA","hijri_year":1448,"hijri_month":9,"start":"2027-02-09","source_url":"…","published_at":"…"}]}`
- `POST /api/practice/sightings` (role `team`) body `{country, hijri_year, hijri_month, start, expected, source_url}` → 201, or 422 `too_far_from_expected`.
- `GET /api/practice/lines?lang=` → approved Practice lines (`qibla_direction`, `ramadan_local`) for that language only.

## 3. Data

- Table `prc_sightings` (Alembic migration `prc_04_sightings`): `id`, `country`, `hijri_year`, `hijri_month`, `start_date`, `source_url`, `published_at`; unique (`country`, `hijri_year`, `hijri_month`).
- `content/practice/lines.json`: short Sharia lines per language, registered with the review desk as `practice_line`.

## 4. Tests

| Example | Test |
| --- | --- |
| R1 5 Oct 2026 = 24 Rabi II 1448 (and offline, Manila) | `hijri.test.ts` |
| R2 20 Jan 2027 → expected 8 Feb, 19 days | `hijri.test.ts` |
| R2 announced 9 Feb → 8 Feb is not Ramadan | `hijri.test.ts` |
| R2 SPA statement accepted / >1 day rejected | `backend/tests/test_prc04_sightings.py` |
| R2 Manila line only after approval | `test_prc04_sightings.py::test_prc04_r2_local_line_only_after_approval` |
| R3 8 Feb 2027 suhoor 5:12, iftar 5:43; 3 pm countdown; no imsak | `hijri.test.ts` / `times.test.ts` |
| R4 Isha 7:13 → 7:43 → 7:30; Manila no delay | `times.test.ts` |
| R5 no tracking | `practice.test.ts` (no motivation import) |
| R6 same file for all | `test_prc04_sightings.py::test_prc04_r6_same_file_no_params` |

## 5. Not built tonight

The SPA reader (`publish` from the Supreme Court statement) needs a stable source format; the feature itself lists it as an open question. Until then the team-only endpoint applies the same ±1 day rule.
