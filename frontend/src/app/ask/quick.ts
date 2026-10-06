/** LRN-10 R5: which exercise the quick check after an assistant answer shows. */
import type { ObjectiveState } from "@/app/learning/bkt"
import { exercisesByObjective } from "@/app/learning/reviewItems"
import type { Content, Exercise } from "@/app/learning/types"

/** One approved exercise for the objective (the content holds approved
 * lessons only), preferring one the learner has not answered. */
export function pickQuickCheck(content: Content | undefined, objectiveId: string, state?: ObjectiveState): Exercise | null {
  if (!content) return null
  const pool = exercisesByObjective(content)[objectiveId] ?? []
  const seen = new Set(state?.seenExercises ?? [])
  return pool.find((e) => !seen.has(e.id)) ?? pool[0] ?? null
}
