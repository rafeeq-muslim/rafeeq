/**
 * Learning (LRN) device state: completed lessons, placement unlocks,
 * objective mastery (BKT) and the in-progress lesson (LRN-03 R5).
 * Owned by Learning; Motivation hears about completions via `bus`.
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { applyAnswer, type ExerciseType, type ObjectiveState, fresh } from "@/app/learning/bkt"
import type { Progress } from "@/app/learning/path"

export type LessonSession = {
  lessonId: string
  step: number // index in the lesson's flow (cards, then exercises)
  answered: string[] // exercises answered correctly
  firstTried: string[] // exercises whose first answer was already counted
  queue: string[] // exercises to return before the end (wrong ones)
  lastAnswerAt: string
}

type LearningState = Progress & {
  mastery: Record<string, ObjectiveState>
  sessions: Record<string, LessonSession>
  placementDone: boolean
  /** LRN-02 R2: the unit the path scrolls to on its first opening after
   * placement (the starting unit); cleared once the path has scrolled there. */
  landingUnit: string | null
  markSeen: (objectiveIds: string[]) => void
  firstAnswer: (objectiveIds: string[], exerciseId: string, type: ExerciseType, correct: boolean) => void
  markChecked: (objectiveId: string) => void
  completeLesson: (lessonId: string) => { isRepeat: boolean }
  unlockUnits: (unitIds: string[]) => void
  saveSession: (s: LessonSession) => void
  clearSession: (lessonId: string) => void
  replaceAll: (p: Partial<Pick<LearningState, "completed" | "unlockedUnits" | "mastery">>) => void
  set: (patch: Partial<LearningState>) => void
}

export const useLearning = create<LearningState>()(
  persist(
    (set, get) => ({
      completed: {},
      unlockedUnits: [],
      mastery: {},
      sessions: {},
      placementDone: false,
      landingUnit: null,
      markSeen: (ids) =>
        set((s) => {
          const mastery = { ...s.mastery }
          for (const id of ids) mastery[id] = { ...(mastery[id] ?? fresh()), seen: true }
          return { mastery }
        }),
      firstAnswer: (ids, exerciseId, type, correct) =>
        set((s) => {
          const mastery = { ...s.mastery }
          for (const id of ids) mastery[id] = applyAnswer(mastery[id], correct, type, exerciseId)
          return { mastery }
        }),
      markChecked: (id) =>
        set((s) => ({ mastery: { ...s.mastery, [id]: { ...(s.mastery[id] ?? fresh()), checksDone: (s.mastery[id]?.checksDone ?? 0) + 1 } } })),
      completeLesson: (lessonId) => {
        const now = new Date().toISOString()
        const prev = get().completed[lessonId]
        set((s) => ({
          completed: {
            ...s.completed,
            [lessonId]: prev ? { ...prev, last: now, times: prev.times + 1 } : { first: now, last: now, times: 1 },
          },
        }))
        return { isRepeat: !!prev }
      },
      unlockUnits: (ids) => set((s) => ({ unlockedUnits: [...new Set([...s.unlockedUnits, ...ids])] })),
      saveSession: (sess) => set((s) => ({ sessions: { ...s.sessions, [sess.lessonId]: sess } })),
      clearSession: (id) =>
        set((s) => {
          const sessions = { ...s.sessions }
          delete sessions[id]
          return { sessions }
        }),
      replaceAll: (p) => set(p),
      set: (patch) => set(patch),
    }),
    { name: "rafeeq.learning", version: 1 },
  ),
)
