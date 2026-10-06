/**
 * LRN-10 rule 3: Bayesian Knowledge Tracing, updated after each FIRST answer
 * on an exercise. Initial parameters 💬 from the PRD; logged changes go to
 * docs/agents/decisions.md (MOT-08).
 */
export type ExerciseType = "choose" | "order" | "match"
export type Level = "not_started" | "exposed" | "practising" | "mastered"

export const P_L0 = 0.1
export const P_T = 0.2
export const P_S = 0.1
export const guessFor = (t: ExerciseType) => (t === "order" ? 0.05 : 0.25)
export const MASTERY = 0.95

export function update(pL: number, correct: boolean, type: ExerciseType): number {
  const pG = guessFor(type)
  const posterior = correct
    ? (pL * (1 - P_S)) / (pL * (1 - P_S) + (1 - pL) * pG)
    : (pL * P_S) / (pL * P_S + (1 - pL) * (1 - pG))
  return posterior + (1 - posterior) * P_T
}

export type ObjectiveState = {
  p: number
  seen: boolean
  answered: boolean
  lastAnswerAt?: string
  masteredAt?: string
  lastExerciseId?: string
  checksDone: number // LRN-04: rechecks after 7 and 30 days
  /** Exercises already answered for this objective (review prefers a new one). */
  seenExercises?: string[]
}

export const fresh = (): ObjectiveState => ({ p: P_L0, seen: false, answered: false, checksDone: 0 })

/** LRN-10 rule 4. */
export function levelOf(s: ObjectiveState | undefined): Level {
  if (!s || (!s.seen && !s.answered)) return "not_started"
  if (!s.answered) return "exposed"
  return s.p >= MASTERY ? "mastered" : "practising"
}

export function applyAnswer(s: ObjectiveState | undefined, correct: boolean, type: ExerciseType, exerciseId: string, now = new Date()): ObjectiveState {
  const prev = s ?? fresh()
  const p = update(prev.p, correct, type)
  const wasMastered = prev.p >= MASTERY
  const isMastered = p >= MASTERY
  return {
    ...prev,
    p,
    seen: true,
    answered: true,
    lastAnswerAt: now.toISOString(),
    lastExerciseId: exerciseId,
    seenExercises: [...new Set([...(prev.seenExercises ?? []), exerciseId])],
    masteredAt: isMastered ? (wasMastered ? prev.masteredAt : now.toISOString()) : undefined,
    checksDone: isMastered ? (wasMastered ? prev.checksDone : 0) : 0,
  }
}
