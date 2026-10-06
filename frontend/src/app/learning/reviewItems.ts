/** LRN-04: the review session's items from the current content. */
import type { ObjectiveState } from "./bkt"
import { selectReview } from "./review"
import type { Content, Exercise } from "./types"

export function exercisesByObjective(content: Content): Record<string, Exercise[]> {
  const out: Record<string, Exercise[]> = {}
  for (const lesson of Object.values(content.lessons))
    for (const ex of lesson.exercises) for (const o of ex.objectives) (out[o] ??= []).push(ex)
  return out
}

/** Objectives of lessons the learner has completed (LRN-04 with issue #9). */
export function completedObjectives(content: Content, completed: Record<string, unknown>): Set<string> {
  return new Set(Object.values(content.lessons).filter((l) => completed[l.id]).flatMap((l) => l.objectives.map((o) => o.id)))
}

export function reviewItems(content: Content, mastery: Record<string, ObjectiveState>, now = new Date(), completed: Record<string, unknown> = {}) {
  return selectReview(mastery, exercisesByObjective(content), now, 5, completedObjectives(content, completed))
}
