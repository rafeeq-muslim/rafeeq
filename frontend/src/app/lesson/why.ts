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

export async function askWhy(lessonId: string, exercise: Exercise, lang: string, answer: unknown): Promise<Why> {
  const cardOnly = Math.random() < 0.2 || (typeof navigator !== "undefined" && !navigator.onLine)
  const objective_id = exercise.objectives[0]
  if (cardOnly) {
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
