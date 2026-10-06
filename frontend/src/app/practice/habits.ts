/**
 * PRC-02 habits (draft feature). Pure functions over the device-only store.
 * R2: a worship habit shows today's mark only — no count, no streak, no
 * points, no event. R3: other habits show the days kept. R5: missed days are
 * never listed. Nothing here imports Motivation.
 */
import type { Habit } from "./store"
import { ymdIn, ymdKey } from "./times"

export type Suggestion = { key: string; worship: boolean }

/** Proposal by Claude, open question for the Sharia reviewer (PRC-02). No fasting (PRC-04 R5). */
export const SUGGESTED: Suggestion[] = [
  { key: "prayOnTime", worship: true },
  { key: "adhkar", worship: true },
  { key: "quranListen", worship: true },
  { key: "learn5", worship: false },
  { key: "family", worship: false },
  { key: "smile", worship: false },
  { key: "sleepEarly", worship: false },
]

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2))

/** R1: a written habit is a worship habit unless the learner chooses otherwise. */
export function newHabit(input: { title?: string; suggested?: string; worship?: boolean }, now = new Date()): Habit {
  const s = input.suggested ? SUGGESTED.find((x) => x.key === input.suggested) : undefined
  return {
    id: newId(),
    title: (input.title ?? "").trim(),
    worship: s ? s.worship : (input.worship ?? true),
    suggested: s?.key,
    createdAt: now.toISOString(),
  }
}

/**
 * Today's key, YYYY-MM-DD, in the chosen city's time zone (like the prayer
 * times, PRC-01 R4), so a device set to another zone does not move the day
 * early or late. No city chosen → the device's own day.
 */
export function localDay(d = new Date(), tz?: string): string {
  if (tz) {
    try {
      return ymdKey(ymdIn(tz, d))
    } catch {
      // An unknown zone falls back to the device's day.
    }
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export type HabitView = { id: string; checkedToday: boolean; daysKept?: number; private: boolean }

export function habitView(h: Habit, log: Record<string, string[]>, today: string): HabitView {
  const days = log[h.id] ?? []
  const checkedToday = days.includes(today)
  return h.worship ? { id: h.id, checkedToday, private: true } : { id: h.id, checkedToday, daysKept: new Set(days).size, private: false }
}

/** Mark or unmark today. Worship habits keep no history beyond today's mark. */
export function toggleToday(h: Habit, log: Record<string, string[]>, today: string): Record<string, string[]> {
  const days = log[h.id] ?? []
  const next = days.includes(today) ? days.filter((d) => d !== today) : h.worship ? [today] : [...days, today]
  return { ...log, [h.id]: next }
}

export function deleteHabit(habits: Habit[], log: Record<string, string[]>, id: string) {
  const rest = { ...log }
  delete rest[id]
  return { habits: habits.filter((h) => h.id !== id), log: rest }
}
