# PRC-01 prayer times and qibla: implementation

**Feature:** `docs/domains/practice/features/PRC-01-prayer-times-qibla.md` · **Research:** `docs/agents/research/05-prayer-times-and-qibla.md`
**Written:** 2026-10-05 by Claude (overnight build). Order of authority: `rules.md` → feature → this file.

Everything here runs **on the device**. No endpoint receives a city, coordinates, time zone or prayer time (R1, `rules.md` §4).

## 1. Rules → modules

| Rule / example | Module | What it does |
| --- | --- | --- |
| R1 (offline), R1 permission | `frontend/src/app/stores/device.ts` (`city`, existing) | The chosen city lives in the persisted device store only. `lib/sync.ts` never sends it; nothing new is added to the account |
| R2 (city list, search in own language) | `frontend/src/app/practice/cities.json` + `cities.ts` | Offline GeoNames extract (see §3). `searchCities(q)` matches Arabic and Latin names (diacritics and hamza folded) |
| R2 (Riyadh suggested from the device time zone) | `cities.ts::suggestCities(tz)` | `Intl.DateTimeFormat().resolvedOptions().timeZone` → cities in that zone, largest first. No permission prompt |
| R2 (optional geolocation, denied → back to list) | `practice/CityPicker.tsx` | `navigator.geolocation` only on an explicit tap; the position is used on the device to pick the **nearest listed city within 150 km** (`cities.ts::locateCity`, `NEAREST_MAX_KM`) and is then discarded. Beyond 150 km no city is chosen: above 48° the person is told their area is not supported yet (`practice.city.farAwayHigh`), otherwise that no listed city is near (`practice.city.farAway`); before this, London got Lyon, Oslo Milan and Edmonton Seattle, each in another time zone. 150 km keeps the towns around every listed city and bounds the east–west error to ≈ 5½–8 min (4 min per degree of longitude), the same order as R2's village example ⚠️ (technical default for the owner to confirm). Denied/failed → calm message, list stays |
| R2 (village not listed) | `CityPicker.tsx` | A typed name with no match → "choose the nearest city, or use your location". Nothing typed and no listed city in the device zone (e.g. `Europe/London`) → "type your city's name, or use your location" (`practice.city.typeToSearch`), never "not found" |
| R3 (official method per country, never asked) | `practice/times.ts::methodFor(country)` | SA → `UmmAlQura`; KW → `Kuwait`; QA → `Qatar`; AE → `Dubai` (research/05 §4 proposal); every other country → `MuslimWorldLeague`. No method or madhhab name is ever shown |
| R3 (never before the official time; sunrise never after) | `times.ts::dayTimes` | `Rounding.None`, then per prayer: Fajr ⌈t⌉+1, Sunrise ⌊t⌋, Dhuhr ⌈t⌉, Asr ⌈t⌉+1, Maghrib ⌈t⌉, Isha ⌈t⌉. Chosen against 40 official days (§4) |
| R3 (London, high latitude) | `cities.json` build | Cities above 48° N/S are left out (owner decision 2026-10-05) until the 45° proportional rule is built |
| R4 (next prayer, countdown, city time zone) | `times.ts::nextPrayer`, `formatTime` | Times are absolute instants; they are always formatted with the **city's** IANA zone, never the device zone. After Isha the next prayer is tomorrow's Fajr |
| R5 (great-circle bearing) | `practice/qibla.ts::qiblaBearing` | `adhan` `Qibla()`; Riyadh = 244° |
| R5 (no compass / denied) | `practice/QiblaScreen.tsx` | Live compass only when `DeviceOrientationEvent` gives an absolute heading (iOS `webkitCompassHeading` after a tap-to-allow; Android `deviceorientationabsolute`). Otherwise: bearing from north + a short how-to, no failure message |
| R5 (reassurance line) | `content/practice/lines.json` → review desk item `practice_line:qibla_direction` | Shown once merged (rules.md §1.4 (2026-10-06): merged content is shown directly; a version the reviewer returns in the desk is withdrawn in that language until corrected). Test: `test_prc04_sightings.py::test_prc01_r5_merged_qibla_line_shown` |
| R6 (no motivation) | — | No event, no counter, no streak call anywhere in `practice/` |

## 2. Endpoints

None for times or qibla. The reassurance line comes with the other live Practice lines: `GET /api/practice/lines?lang=` (see PRC-04 doc).

## 3. Data

- `frontend/src/app/practice/cities.json`: built by `content/practice/build_cities.py` from GeoNames `cities15000` (CC BY 4.0, credit shown in the city picker): population ≥ 100,000 in the persona countries (SA, AE, KW, QA, BH, OM, PH, ET, ER, LK, IN, NP, GB, US, CA, AU, EG, JO, ID, MY, PK, BD, NG, KE) plus the capital of each, |lat| ≤ 48. Fields: `id` (GeoNames id), `n` {ar?, en}, `c` country, `lat`, `lng`, `tz`, `p` population. Arabic names come from the GeoNames alternate names (first name in Arabic script); English is the GeoNames ASCII name.
- Device store: `city` (existing type `City`).

## 4. Tests (vitest, `frontend/src/app/practice/*.test.ts`)

| Example | Test |
| --- | --- |
| R1 offline | `times.test.ts` "computes a full day with no network" (pure function, `fetch` stubbed to throw) |
| R2 Riyadh suggested | `cities.test.ts` "suggests Riyadh first for Asia/Riyadh without asking for location" |
| R2 village not listed | `cities.test.ts` "unknown name returns no match (UI offers nearest city / location)"; `CityPicker.test.tsx` (typed name → «not found»; nothing typed in `Europe/London` → invite to search) |
| R2 location far from every listed city | `cities.test.ts` "prc-01-r2 London / Oslo / Edmonton / Glasgow … not supported yet", 150 km limit, central Australia; `CityPicker.test.tsx` London → message, no city saved, no fetch |
| R3 Riyadh 5 Oct 2026 | `times.test.ts` "matches the official Umm al-Qura times" (04:30, 11:42, 15:05, 17:37, 19:07) |
| R3 never before official | `times.test.ts` over `__fixtures__/umm-al-qura.json` (40 official days, 5 cities, fetched team-side from the KACST API, `sources.md`) |
| R3 Manila | `times.test.ts` "Philippines uses MWL and exposes no method name" |
| R3 London | `cities.test.ts` "no city above 48°" |
| R4 after Isha | `times.test.ts` "next prayer after Isha is tomorrow's Fajr" |
| R4 device in Manila zone | `times.test.ts` "formats in the city zone, not the device zone" |
| R5 244° | `times.test.ts` "Riyadh faces 244° from north" |
| R6 | `practice.test.ts` "no motivation call" (the module imports nothing from `motivation`) |
