/**
 * CMP-01 R1: the help button of a lesson or a review opens the assistant.
 * This is everything that travels: where the learner came from, the
 * lesson's title, and (owner's decision 2026-10-07) what is on screen as
 * IDS ONLY: the lesson id plus the card id or the exercise id. Never the
 * learner's answer, whether it was right, or their progress. It rides in
 * the route state (never the URL).
 *
 * The ids go to /api/ask with the question while the context chip is shown
 * (pages/Ask.tsx); the server loads the approved text itself. The chip's
 * words are read here from the content this device already has.
 */
import type { Lesson } from "@/app/learning/types"

/** What is on screen, as ids (the shape /api/ask accepts as `context`). */
export type HelpContext = { lesson_id: string; card_id?: string; exercise_id?: string }
export type LessonHelp = { from: "lesson" | "review"; topic: string; context?: HelpContext }

const TOPIC_MAX = 120
const ID = /^[A-Za-z0-9_-]{1,32}$/
const isId = (v: unknown): v is string => typeof v === "string" && ID.test(v)

/** Keeps the three known ids and nothing else; null when they are not ids. */
export function readHelpContext(raw: unknown): HelpContext | null {
  if (!raw || typeof raw !== "object") return null
  const { lesson_id, card_id, exercise_id } = raw as Record<string, unknown>
  if (!isId(lesson_id)) return null
  if (isId(exercise_id)) return { lesson_id, exercise_id }
  if (isId(card_id)) return { lesson_id, card_id }
  return { lesson_id }
}

export const lessonHelpState = (from: LessonHelp["from"], topic: string, context?: HelpContext): { lessonHelp: LessonHelp } => {
  const ids = readHelpContext(context)
  return { lessonHelp: { from, topic: topic.trim().slice(0, TOPIC_MAX), ...(ids ? { context: ids } : {}) } }
}

/** Reads the hand-over from the route state, keeping only its known fields. */
export function readLessonHelp(state: unknown): LessonHelp | null {
  const raw = (state as { lessonHelp?: unknown } | null)?.lessonHelp
  if (!raw || typeof raw !== "object") return null
  const { from, topic, context } = raw as Record<string, unknown>
  if ((from !== "lesson" && from !== "review") || typeof topic !== "string") return null
  const ids = readHelpContext(context)
  return { from, topic: topic.trim().slice(0, TOPIC_MAX), ...(ids ? { context: ids } : {}) }
}

/**
 * The chip's words: the lesson's title and the exercise's question (or the
 * start of the card), from the approved content on this device. Null when
 * the device does not have that lesson, card or exercise: then no chip is
 * shown and no context is sent.
 */
export function describeContext(lessons: Record<string, Lesson> | undefined, context: HelpContext): { lesson: string; item: string } | null {
  const lesson = lessons?.[context.lesson_id]
  if (!lesson) return null
  if (context.exercise_id) {
    const exercise = lesson.exercises.find((e) => e.id === context.exercise_id)
    return exercise ? { lesson: lesson.title, item: exercise.prompt } : null
  }
  if (context.card_id) {
    const card = lesson.cards.find((c) => c.id === context.card_id)
    return card ? { lesson: lesson.title, item: typeof card.text === "string" ? card.text.trim().split("\n")[0] : "" } : null
  }
  return { lesson: lesson.title, item: "" }
}
