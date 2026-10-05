/**
 * Motivation (MOT) device state: learning days (streak) and badges.
 * No points, no ranking (rules.md §3).
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { addDay, localDay, newStreakBadges, streakView } from "@/app/motivation/streak"

export type EarnedBadge = { id: string; earnedAt: string }

type MotivationState = {
  days: string[]
  badges: Record<string, EarnedBadge>
  /** Badges to celebrate once (MOT-03 R4). */
  pending: string[]
  /** For MOT-02 R4: welcome back after a pause. */
  lastSeenPausedAt?: string
  learnedToday: () => boolean
  recordLearningDay: () => { newBadges: string[]; resumedAfterPause: boolean }
  earn: (badgeId: string) => boolean
  popPending: () => string | undefined
  replaceAll: (p: { days?: string[]; badges?: Record<string, EarnedBadge> }) => void
}

export const useMotivation = create<MotivationState>()(
  persist(
    (set, get) => ({
      days: [],
      badges: {},
      pending: [],
      learnedToday: () => get().days.includes(localDay()),
      recordLearningDay: () => {
        const before = streakView(get().days)
        const days = addDay(get().days, localDay())
        const count = days.length
        const fresh = newStreakBadges(count, get().badges)
        const now = new Date().toISOString()
        set((s) => ({
          days,
          badges: { ...s.badges, ...Object.fromEntries(fresh.map((id) => [id, { id, earnedAt: now }])) },
          pending: [...s.pending, ...fresh],
        }))
        return { newBadges: fresh, resumedAfterPause: before.paused }
      },
      earn: (badgeId) => {
        if (get().badges[badgeId]) return false // MOT-03 R2: once
        const now = new Date().toISOString()
        set((s) => ({ badges: { ...s.badges, [badgeId]: { id: badgeId, earnedAt: now } }, pending: [...s.pending, badgeId] }))
        return true
      },
      popPending: () => {
        const [first, ...rest] = get().pending
        set({ pending: rest })
        return first
      },
      replaceAll: (p) => set(p),
    }),
    { name: "rafeeq.motivation", version: 1 },
  ),
)
