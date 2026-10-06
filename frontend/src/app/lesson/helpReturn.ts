/**
 * LRN-03 R5 (owner's decision 2026-10-07): a learner who leaves a lesson for
 * the assistant or for a human request (CMP-01) comes back to the very same
 * card or exercise, with the choice they had not checked yet.
 *
 * The card or exercise itself is already in the saved lesson session. What
 * is held here is only what that session does not have: which lesson to go
 * back to, and the exercise as it was on screen. It lives in this module's
 * memory and nowhere else: never in the URL, the route state, storage, the
 * assistant's question or the help request (CMP-01 R1). It is dropped as soon
 * as a lesson is opened again, when the assistant is opened from its own
 * tab, and with the page itself.
 */
import type { Result, Value } from "./Exercises"

/** The exercise as the learner left it: the choice, its option order, and its result if already checked. */
export type ExerciseDraft = { exerciseId: string; value: Value; round: number; result: Result }

let held: { lessonId: string; draft: ExerciseDraft | null } | null = null

/** Called by the lesson's help button, before leaving. */
export function holdLessonForHelp(lessonId: string, draft: ExerciseDraft | null) {
  held = { lessonId, draft }
}

/** Where «ارجع إلى الدرس» goes (a router path, under the app's base); null when not known (the page was reloaded). */
export const lessonReturnPath = (): string | null => (held ? `/learn/lesson/${held.lessonId}` : null)

/** The exercise left on screen in this lesson, if any. Reading does not drop it. */
export const heldDraft = (lessonId: string): ExerciseDraft | null => (held?.lessonId === lessonId ? held.draft : null)

export function dropLessonHelpReturn() {
  held = null
}
