/**
 * LRN-03 R6 «لماذا؟» after a wrong answer. The assistant rewords the card
 * text of the exercise's objective in the learner's language, labelled as
 * Rafeeq's explanation; the server shows it only if a check found nothing
 * added beyond the card. Offline, slow or refused: the card text alone,
 * immediately, with no technical error. MOT-09 R4: one request in five is
 * randomly answered with the card text only, to measure the explanation's
 * effect; the learner sees no sign of it.
 */
import { api, sendEvent } from "@/app/lib/api"
import type { Exercise } from "@/app/learning/types"

export type Why = { text: string | null; ai: boolean }

/** MOT-09 R4: the random fifth is the experiment's comparison group
 * (`card_holdout`); card text shown because the device was offline, the
 * call failed or the check refused is `card_only` and stays out of it. */
export async function askWhy(lessonId: string, exercise: Exercise, lang: string, answer: unknown, random = Math.random): Promise<Why> {
  const objective_id = exercise.objectives[0]
  if (random() < 0.2) {
    sendEvent({ type: "why_shown", shown: "card_holdout", exercise_id: exercise.id, objective_id })
    return { text: null, ai: false }
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    sendEvent({ type: "why_shown", shown: "card_only", exercise_id: exercise.id, objective_id })
    return { text: null, ai: false }
  }
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const r = await api<{ text: string | null }>("/api/learning/explain", {
      method: "POST",
      body: { lesson_id: lessonId, exercise_id: exercise.id, lang, answer },
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer))
    sendEvent({ type: "why_shown", shown: r.text ? "ai_explanation" : "card_only", exercise_id: exercise.id, objective_id })
    return { text: r.text, ai: !!r.text }
  } catch {
    sendEvent({ type: "why_shown", shown: "card_only", exercise_id: exercise.id, objective_id })
    return { text: null, ai: false }
  }
}
