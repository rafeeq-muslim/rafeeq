/**
 * MOT-02 forgiving streak. A day counts when a lesson (repeat included) or
 * a review completes, by the device's local date. Counted days are never
 * removed, so the count never decreases; missing days only pause it.
 * MOT-03: consistency badges at 7, 30 and 66 learning days.
 */
export const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

export function addDay(days: string[], day: string): string[] {
  return days.includes(day) ? days : [...days, day].sort()
}

export function streakView(days: string[], today = localDay()): { count: number; paused: boolean } {
  if (days.length === 0) return { count: 0, paused: false }
  const last = days[days.length - 1]
  const yesterday = localDay(new Date(Date.now() - 86_400_000))
  return { count: days.length, paused: last !== today && last !== yesterday }
}

/** MOT-02 R5 example: device 6 days + account 9 days → the account keeps 9
 * (the higher streak), not a sum. */
export function mergeDays(account: string[], device: string[]): string[] {
  return (device.length > account.length ? device : account).slice().sort()
}

export const STREAK_BADGES = [7, 30, 66] as const
export const streakBadgeId = (n: number) => `days-${n}`

export function newStreakBadges(count: number, have: Record<string, unknown>): string[] {
  return STREAK_BADGES.filter((n) => count >= n && !have[streakBadgeId(n)]).map(streakBadgeId)
}
