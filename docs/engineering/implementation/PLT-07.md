# PLT-07 the Rafeeq tone: implementation

**Feature:** `docs/domains/platform/features/PLT-07-rafeeq-tone.md` (PR #25) · **Rules touched:** `rules.md` §1.4 (no music) · **Written:** 2026-10-06 by Claude.

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 short, not musical, approved first | `frontend/src/app/lib/tone.ts` (`APPROVED_TONE`, `usableTone`) | A tone is used only when it names the approving reviewer and date and lasts under 2 seconds. **No tone exists or is approved, so `APPROVED_TONE = null` and nothing plays** (open question default: in-app alerts stay silent). No audio file was invented or committed |
| R2 only while Rafeeq is open | `tone.ts::playTone` (page visible only), called from `practice/reminders.ts` when an in-app prayer reminder fires; `sw.ts` unchanged | Web notifications carry no custom sound (MDN `Notification.silent` only); outside the app the device's sound is heard |
| R3 tone off, alert kept | `device.ts::toneOn` (default on), switch in Me | The switch appears only once a tone is approved (no switch that does nothing). Off = the toast still shows, silently |

**To add the tone:** put the file in `frontend/public/sounds/`, record مهند's approval (name, date) in `tone.ts` and in `docs/agents/sources.md` (with the file's licence), set `APPROVED_TONE`. Nothing else changes.

## 2. Tests

Frontend `src/app/platform.rules.test.tsx` (`plt-07 …`): no tone until approved (and the 2-second / approval checks), plays only while the page is visible, the service worker has no custom sound, tone off keeps the alert silent.
