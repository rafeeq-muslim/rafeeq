# PRC-02 habits: implementation

**Feature:** `docs/domains/practice/features/PRC-02-habits.md` (draft by Claude for review)
**Written:** 2026-10-05 by Claude (overnight build).

## 1. Rules → modules

| Rule / example | Module | What it does |
| --- | --- | --- |
| R1 suggested or own habit; own = worship until changed | `frontend/src/app/practice/habits.ts::newHabit`, `SUGGESTED` | Suggested habits carry a fixed `worship` flag; a written habit defaults to `worship: true`; the form shows the type before saving, and each suggestion shows its type (`HabitsScreen.tsx::KindTag`: «عبادة، خاص بك» or «من حياتي اليومية») before it is added |
| R2 worship: today only, no count, no event | `habits.ts::habitView` | For worship habits returns `{checkedToday}` and no count; nothing imports Motivation |
| R3 non-worship: days committed; undo | `habitView`, `toggleToday` | Count = number of distinct days logged; unchecking today removes today |
| R4 device only; offline | `usePractice` (`habits`, `log`) persisted in `localStorage` | No endpoint, not in `lib/sync.ts` |
| R5 no missed days shown | `habitView` | Only today's state; no history grid, no "missed" text |
| R6 delete with its log | `deleteHabit` | Removes the habit and its dates |

## 2. Endpoints

None.

## 3. Data

`usePractice.habits: {id, title, worship, suggestedKey?, createdAt}[]`, `usePractice.log: Record<habitId, string[]>` (`YYYY-MM-DD` dates in the chosen city's time zone, `habits.ts::localDay(d, city.tz)`, the device's day when no city is chosen; worship habits keep only the latest date — enough for "today", no history kept).

## 4. Tests (`habits.test.ts`)

One per example: suggested worship habit (and every suggestion's saved type, `HabitsScreen.test.tsx` for the tag shown before saving); «today» in the city zone; own habit as life habit; own habit default worship; ten days worship → no count; worship check → no motivation import; four days → 4; undo → 3; device only (store key, no fetch); three days away → only today; delete removes log.
