/**
 * MOT-05 open-question default: until push reaches every device, the gentle
 * reminder is also shown inside Rafeeq when it is opened on its day. Used on
 * devices that cannot receive push (unsupported, iPhone outside the Home
 * Screen, or permission refused); push devices get the push instead.
 *
 * Same rules as the push reminder (backend app/platform/push.py `due`):
 * R1 off until turned on with a chosen time; R2 at most once a day and
 * never on a day already learned; R3 neutral text; R4 thins out after 3
 * and 6 ignored reminders, and any learning brings it back to daily.
 * Stored on this device only.
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { dayBefore, localDay } from "./streak"

export type InAppReminder = {
  on: boolean
  /** "HH:MM", local time, chosen by the person (R1). */
  time: string | null
  /** The local day it was last shown. */
  shownOn: string | null
  /** Ignored reminders in a row (R4). */
  ignored: number
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`

function daysBetween(from: string, to: string): number {
  let n = 0
  for (let d = to; d > from && n < 400; d = dayBefore(d)) n++
  return n
}

/** Whether to show the reminder now, and the ignored count to store if shown. */
export function inAppDue(r: InAppReminder, learnedDays: string[], now = new Date()): { due: boolean; ignored: number } {
  const today = localDay(now)
  if (!r.on || !r.time) return { due: false, ignored: r.ignored }
  if (hhmm(now) < r.time) return { due: false, ignored: r.ignored }
  if (r.shownOn === today || learnedDays.includes(today)) return { due: false, ignored: r.ignored } // R2
  if (!r.shownOn) return { due: true, ignored: 0 }
  const learnedSince = learnedDays.some((d) => d >= r.shownOn!)
  const ignored = learnedSince ? 0 : r.ignored + 1
  const gap = ignored < 3 ? 1 : ignored < 6 ? 2 : 7 // R4
  return { due: daysBetween(r.shownOn, today) >= gap, ignored }
}

type Store = InAppReminder & { set: (p: Partial<InAppReminder>) => void }

export const useInAppReminder = create<Store>()(
  persist(
    (set) => ({ on: false, time: null, shownOn: null, ignored: 0, set: (p) => set(p) }),
    { name: "rafeeq.reminder.inApp", version: 1 },
  ),
)
