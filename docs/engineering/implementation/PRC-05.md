# PRC-05 prayer reminder: implementation (web, in-app)

**Feature:** `docs/domains/practice/features/PRC-05-prayer-reminder.md` · **Research:** `docs/agents/research/07-prayer-reminder-and-adhkar.md` §1
**Written:** 2026-10-05 by Claude (overnight build).

## 0. Scope on the web

R6 says reminders are scheduled on the device and work offline, and its web example says the learner must know the reminder works only in the mobile app. The web cannot schedule a notification while the app is closed (Notification Triggers ended; iOS push needs a server holding the schedule, which would send the city/time to a server and break R6). So the web build ships the **settings and the schedule computation** exactly as specified, delivers reminders **inside Rafeeq while it is open** (a toast), and says so plainly on the settings screen. The decision log exempts prayer reminders from the one-a-day rule (decisions.md 2026-10-05). Native delivery plugs into the same `upcomingReminders()` later.

## 1. Rules → modules

| Rule / example | Module | What it does |
| --- | --- | --- |
| R1 off by default; chosen prayers only; up to 5 a day; no back-off | `frontend/src/app/practice/store.ts` (`reminders`), `reminders.ts::upcomingReminders` | `enabled:false` by default; `prayers` subset; nothing counts ignored reminders |
| R1 Ramadan suhoor / iftar reminders, off | `reminders.ts` | Two extra keys `suhoor` (before Fajr by the chosen offset) and `iftar` (at Maghrib), listed only during Ramadan, off by default |
| R2 neutral text by default | `reminders.ts::reminderText` | «تذكير» only; the prayer name and minutes only if `showName` is on |
| R3 at the time or N minutes before; city's times; recompute on city change | `upcomingReminders(city, settings, now)` | Pure function of the device city and settings; nothing cached across cities |
| R4 sound | — | Silent toast. The Rafeeq tone (PLT-07) does not exist yet and the adhan option waits for permission (feature open question), so no sound option is shown |
| R5 no tracking, no reminder for a missed prayer | `upcomingReminders` | Only future instants; nothing is recorded when a reminder fires or is ignored |
| R6 on device; honest web note | `reminders.ts::startReminderLoop` (side-effect import in `main.tsx`), `RemindersScreen.tsx` | One timer in the open app; no network. The screen states that reminders work only while Rafeeq is open on this device |

## 2. Endpoints

None.

## 3. Data

`usePractice` (zustand `persist`, key `rafeeq.practice`): `reminders = {enabled, prayers[], offset (0|5|10|15|20|30), showName, suhoor, iftar}`; `firedKeys` (last 20 reminder ids, to avoid firing twice after a reload).

## 4. Tests (`reminders.test.ts`)

| Example | Test |
| --- | --- |
| R1 fresh install → nothing | "off until enabled" |
| R1 Fajr+Maghrib only → no Dhuhr | "only chosen prayers" |
| R1 ignored a week → still sent | "never backs off" |
| R1 Ramadan suhoor/iftar off until enabled | "Ramadan reminders listed, off" |
| R2 neutral / named | "neutral text by default" / "named when chosen" |
| R3 10 min before Asr in Riyadh 5 Oct → 2:55 | "fires 10 minutes before"; offsets 0/5/10/15/20/30 (`reminders.ts::REMINDER_OFFSETS`, used by `RemindersScreen`) and 20 min → 2:45 |
| R3 city changed to Manila | "recomputed from Manila times" |
| R5 missed prayer → no second reminder | "no reminder for a time that passed" |
| R6 offline | pure function, no fetch |
| R6 web note | `RemindersScreen` copy key `practice.reminders.webNote` asserted present in all three dictionaries |
