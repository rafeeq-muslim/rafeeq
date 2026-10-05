/** One first answer (LRN-10 R3): update mastery, send the anonymous event
 * (MOT-09) and, when an objective just crossed into "mastered", say so. */
import { sendEvent } from "@/app/lib/api"
import { useLearning } from "@/app/stores/learning"
import { levelOf } from "./bkt"
import type { Exercise } from "./types"

export function recordFirstAnswer(exercise: Exercise, correct: boolean, context: "lesson" | "review" | "placement" | "quick_check") {
  const before = useLearning.getState().mastery
  useLearning.getState().firstAnswer(exercise.objectives, exercise.id, exercise.type, correct)
  const after = useLearning.getState().mastery
  for (const objective_id of exercise.objectives) {
    sendEvent({ type: "first_answer", objective_id, exercise_id: exercise.id, correct, context })
    if (levelOf(before[objective_id]) !== "mastered" && levelOf(after[objective_id]) === "mastered") sendEvent({ type: "mastered", objective_id })
  }
}
