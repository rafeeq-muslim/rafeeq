# PLT-08 the Rafeeq guide: implementation

**Feature:** `docs/domains/platform/features/PLT-08-rafeeq-guide.md` · **Rules touched:** `rules.md` §3 (worship never rewarded or nagged about), §4 (minimum data: nothing leaves the device) · **Written:** 2026-10-06 by Claude (branch `plt-audit-gaps`, describing the build in commit `c16cde2` plus the tests added here).

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 the journey first, then at most one suggestion | `frontend/src/app/pages/Home.tsx` (order on the sheet), `guide/SuggestionCard.tsx`, `guide/suggest.ts::suggestion` | The next lesson card comes first (then the LRN-04 review row when due), then one `SuggestionCard`. `suggestion()` returns one suggestion or none |
| R2 a fixed table of moments | `guide/suggest.ts::MOMENTS` (ramadan, prayer, human, adhkar, discover, highest first); `guide/useGuide.ts::useGuideContext` | Ramadan from 14 days before (`RAMADAN_LEAD_DAYS`, PRC-04's expected date) to its end; prayer after `u01-l5` («أتهيأ للصلاة»); «لست وحدك» after the first lesson; adhkar after `u01-l7` (last lesson of the day-one unit); Discover after 3 learning days (`DISCOVER_AFTER_DAYS`, open question default). When several are ready, the highest is shown |
| R3 closed with one tap, gone once used, one new suggestion a day | `guide/store.ts` (`dismissed`, `used`, `lastShown`), `useGuide.ts::useGuideTracker` (called in `AppLayout`) | Close → dismissed for good. Opening the feature's route anywhere marks it used. The card first shown on a day stays that day; after closing it, the next one waits until tomorrow. Ramadan's key carries the year, so it returns each year. (PRC-07 R4, branch `prc-audit-gaps`, changes how opening adhkar is stored; R3 ex3 still holds) |
| R4 «كل ما في رفيق»: one page, five groups | `guide/GuideScreen.tsx` (route `/guide`), `guide/catalogue.ts::GROUPS` | Groups: learn, ask, day, discover, privacy; each row has a one-line body and opens its screen. Rows needing an account carry a short note and still open (the screen invites the visitor). Habits (PRC-02) and role tools are not listed |
| R5 reached from the end of Home and first in «حسابي» | `Home.tsx` (last row of the sheet, with `guide.homeLinkBody` saying there is more), `Me.tsx` (first row of «الأدوات») | — |
| R6 kept on the device; no blame about worship | `guide/store.ts` (persisted as `rafeeq.guide` in localStorage, never sent) ; copy `guide.suggest.*` | Suggestion texts introduce the tool and never mention a missed prayer |

## 2. Tests

Frontend `src/app/guide/suggest.test.ts` (R2, R3, R4, R6): `test_plt08_r2_*`, `test_plt08_r3_*`, `test_plt08_r4_*`, `test_plt08_r6_suggestion_copy_never_blames_about_worship`.

Frontend `src/app/platform.gaps.rules.test.tsx` (added on `plt-audit-gaps`):

| Example | Test |
| --- | --- |
| R1 ex1 (lesson first, then the suggestion) | `plt08_r1_next_lesson_first_then_the_suggestion` |
| R1 (at most one suggestion when several are ready) | `plt08_r1_never_more_than_one_suggestion_when_several_are_ready` |
| R5 ex1 (end of Home) | `plt08_r5_home_ends_with_everything_in_rafeeq` |
| R5 ex2 (first in «حسابي» tools) | `plt08_r5_me_tools_start_with_everything_in_rafeeq` |

## 3. Open questions kept at their defaults

Discover after three learning days; no «جديد» label; after the first lesson the «لست وحدك» suggestion and the save-progress offer show together, the suggestion first.

## 4. Reconciliation with PLT-09 (2026-10-06)

PLT-09 (the organized home, approved and on by default) replaces this feature's rules 1, 4 and 5; where the two documents differ, PLT-09 wins. Rule 3 is not replaced and now also governs the organized home's optional components: at most one new a day, a hidden one is not replaced until the next day, and nothing is offered for a feature already opened. The classic Home above keeps its own one-card behaviour. Details and tests: `PLT-09.md` §4.
