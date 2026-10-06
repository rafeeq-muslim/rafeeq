/**
 * CMP-01 R1: the help button of a lesson or a review opens the assistant
 * with the lesson's topic alone. This is everything that travels: where the
 * learner came from and the lesson's title. Never an exercise, an answer or
 * progress. It rides in the route state (never the URL) and stays on the
 * device: the question the learner then types is sent as any other question.
 */
export type LessonHelp = { from: "lesson" | "review"; topic: string }

const TOPIC_MAX = 120

export const lessonHelpState = (from: LessonHelp["from"], topic: string): { lessonHelp: LessonHelp } => ({
  lessonHelp: { from, topic: topic.trim().slice(0, TOPIC_MAX) },
})

/** Reads the hand-over from the route state, keeping only its two known fields. */
export function readLessonHelp(state: unknown): LessonHelp | null {
  const raw = (state as { lessonHelp?: unknown } | null)?.lessonHelp
  if (!raw || typeof raw !== "object") return null
  const { from, topic } = raw as Record<string, unknown>
  if ((from !== "lesson" && from !== "review") || typeof topic !== "string") return null
  return { from, topic: topic.trim().slice(0, TOPIC_MAX) }
}
