/**
 * LRN-04 adaptive review: select objectives, not exercises.
 * R1 practising/exposed objectives enter; mastered ones return 7 and 30
 * days after mastery. R2 at most 5: practising (lowest p first), then
 * exposed, then due checks; ties → longest unpractised; one exercise each,
 * not the one answered last time.
 */
import { levelOf, type ObjectiveState } from "./bkt"
import type { Exercise } from "./types"

const DAY = 86_400_000

export function dueCheck(s: ObjectiveState, now = new Date()): boolean {
  if (levelOf(s) !== "mastered" || !s.masteredAt) return false
  const since = now.getTime() - new Date(s.masteredAt).getTime()
  return (s.checksDone === 0 && since >= 7 * DAY) || (s.checksDone === 1 && since >= 30 * DAY)
}

export function inReview(s: ObjectiveState | undefined, now = new Date()): boolean {
  if (!s) return false
  const lvl = levelOf(s)
  return lvl === "practising" || lvl === "exposed" || dueCheck(s, now)
}

const ts = (s: ObjectiveState) => (s.lastAnswerAt ? new Date(s.lastAnswerAt).getTime() : 0)

/** Issue #9: an objective just answered waits before it returns in review. */
export const REVIEW_PAUSE_MS = 60 * 60 * 1000

export function selectReview(
  mastery: Record<string, ObjectiveState>,
  exercisesByObjective: Record<string, Exercise[]>,
  now = new Date(),
  max = 5,
  /** Objectives of completed lessons only (issue #9: no review before the lesson is done). */
  eligible?: Set<string>,
): { objectiveId: string; exercise: Exercise }[] {
  const rested = (s: ObjectiveState) => !s.lastAnswerAt || now.getTime() - new Date(s.lastAnswerAt).getTime() >= REVIEW_PAUSE_MS
  const entries = Object.entries(mastery).filter(
    ([id, s]) => (!eligible || eligible.has(id)) && inReview(s, now) && rested(s) && (exercisesByObjective[id]?.length ?? 0) > 0,
  )
  const rank = (s: ObjectiveState) => (levelOf(s) === "practising" ? 0 : levelOf(s) === "exposed" ? 1 : 2)
  entries.sort(([, a], [, b]) => rank(a) - rank(b) || (rank(a) === 0 ? a.p - b.p : 0) || ts(a) - ts(b))
  return entries.slice(0, max).map(([objectiveId, s]) => {
    const pool = exercisesByObjective[objectiveId]
    const seen = new Set(s.seenExercises ?? [])
    const exercise = pool.find((e) => !seen.has(e.id)) ?? pool.find((e) => e.id !== s.lastExerciseId) ?? pool[0]
    return { objectiveId, exercise }
  })
}
