/**
 * KNW-07 R4: the card of the day is chosen on the device from the date
 * alone, so every learner sees the same card and nothing about them is
 * needed: index = day number modulo the size of the ordered set. The day is
 * the device's local calendar date.
 */
import type { DailyCardData } from "./types"

const DAY = 86_400_000

/** Days since 1970-01-01 for the local calendar date of `d`. */
export function dayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY)
}

/**
 * Plan §8.4 step 6: when the set grows, keep the old modulus until the
 * first day (from the change) whose remainder on the old count is 0, so no
 * card repeats before the old cycle ends.
 */
export function modulusFor(day: number, total: number, previous?: { count: number; since: number } | null): number {
  if (!previous || previous.count <= 0 || previous.count === total) return total
  const { count, since } = previous
  const switchDay = since + ((count - (since % count)) % count)
  return day < switchDay ? count : total
}

/**
 * The card of `day` among `approved` (cards approved in the learner's
 * language, each with its `order` in the whole set). If today's card is not
 * approved in this language, the next approved one is shown (R1 error, R6).
 */
export function cardOfDay(
  approved: DailyCardData[],
  total: number,
  day: number,
  previous?: { count: number; since: number } | null,
): DailyCardData | null {
  if (!approved.length || total <= 0) return null
  const n = modulusFor(day, total, previous)
  const index = ((day % n) + n) % n
  const sorted = [...approved].sort((a, b) => a.order - b.order)
  return sorted.find((c) => c.order >= index) ?? sorted[0]
}
