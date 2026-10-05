/**
 * PRC-07 R6: which adhkar group to open first, from the device city's prayer
 * times (an order of display, not a ruling on the time of a dhikr; proposal
 * in the feature's open questions). No city → the book's fixed order.
 */
import type { DayTimes } from "./times"

export type GroupKey = "morning_evening" | "after_prayer" | "sleep" | "waking" | "daily"
export const GROUP_ORDER: GroupKey[] = ["morning_evening", "after_prayer", "sleep", "waking", "daily"]

const HALF_HOUR = 30 * 60_000

export function suggestGroup(t: DayTimes | null, now: Date): GroupKey | null {
  if (!t) return null
  const n = now.getTime()
  for (const k of ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const) {
    const at = t[k].getTime()
    if (n >= at && n < at + HALF_HOUR && k !== "fajr" && k !== "asr") return "after_prayer"
  }
  if (n >= t.fajr.getTime() && n < t.dhuhr.getTime()) return "morning_evening"
  if (n >= t.asr.getTime() && n < t.isha.getTime()) return "morning_evening"
  if (n >= t.isha.getTime()) return "sleep"
  return null
}

/** Groups in display order with the suggested one first. */
export function orderedGroups(suggested: GroupKey | null): GroupKey[] {
  return suggested ? [suggested, ...GROUP_ORDER.filter((g) => g !== suggested)] : GROUP_ORDER
}
