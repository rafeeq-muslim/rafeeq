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

export function reviewItems(content: Content, mastery: Record<string, ObjectiveState>, now = new Date()) {
  return selectReview(mastery, exercisesByObjective(content), now)
}
