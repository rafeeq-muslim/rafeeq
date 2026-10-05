/**
 * LRN-03 lesson flow as pure functions over the saved session.
 * R1 cards first, then exercises. R3 a wrong exercise comes back before the
 * end, with no limit and no penalty. R4 the lesson completes when every
 * exercise has been answered correctly. R5 resumable; after 24 hours the
 * learner chooses to continue or restart.
 */
import type { LessonSession } from "@/app/stores/learning"
import type { ChooseExercise, Exercise, Item, Lesson, MatchExercise, OrderExercise } from "./types"

const DAY = 86_400_000

export function startSession(lesson: Lesson, now = new Date()): LessonSession {
  return {
    lessonId: lesson.id,
    step: 0,
    answered: [],
    firstTried: [],
    queue: lesson.exercises.map((e) => e.id),
    lastAnswerAt: now.toISOString(),
  }
}

export type Screen =
  | { kind: "card"; index: number; total: number }
  | { kind: "exercise"; exercise: Exercise }
  | { kind: "done" }

export function current(lesson: Lesson, s: LessonSession): Screen {
  if (s.step < lesson.cards.length) return { kind: "card", index: s.step, total: lesson.cards.length }
  const id = s.queue[0]
  const exercise = lesson.exercises.find((e) => e.id === id)
  return exercise ? { kind: "exercise", exercise } : { kind: "done" }
}

/** Overall progress 0–100: cards count once, each exercise once when right. */
export function progressOf(lesson: Lesson, s: LessonSession): number {
  const total = lesson.cards.length + lesson.exercises.length
  if (total === 0) return 100
  const done = Math.min(s.step, lesson.cards.length) + s.answered.length
  return Math.round((done / total) * 100)
}

export function nextCard(s: LessonSession): LessonSession {
  return { ...s, step: s.step + 1 }
}

export function previousCard(s: LessonSession): LessonSession {
  return { ...s, step: Math.max(0, s.step - 1) }
}

/** Record an answer. Returns the new session and whether this was the
 * exercise's first answer (BKT and MOT-09 count first answers only). */
export function answer(s: LessonSession, exerciseId: string, correct: boolean, now = new Date()): { session: LessonSession; first: boolean } {
  const first = !s.firstTried.includes(exerciseId)
  const rest = s.queue.filter((id) => id !== exerciseId)
  return {
    first,
    session: {
      ...s,
      firstTried: first ? [...s.firstTried, exerciseId] : s.firstTried,
      answered: correct && !s.answered.includes(exerciseId) ? [...s.answered, exerciseId] : s.answered,
      queue: correct ? rest : [...rest, exerciseId], // R3: back before the end
      lastAnswerAt: now.toISOString(),
    },
  }
}

export function isComplete(lesson: Lesson, s: LessonSession): boolean {
  return s.step >= lesson.cards.length && lesson.exercises.every((e) => s.answered.includes(e.id))
}

/** R5: a session untouched for a full day asks continue-or-restart. */
export function needsResumeChoice(s: LessonSession | undefined, now = new Date()): boolean {
  if (!s || (s.step === 0 && s.firstTried.length === 0)) return false
  return now.getTime() - new Date(s.lastAnswerAt).getTime() >= DAY
}

// --- Checking answers --------------------------------------------------------

export function checkChoose(e: ChooseExercise, picked: string): boolean {
  return picked === e.answer
}

export function checkOrder(e: OrderExercise, ids: string[]): boolean {
  return ids.length === e.answer.length && ids.every((id, i) => id === e.answer[i])
}

export function checkMatch(e: MatchExercise, pairs: [string, string][]): boolean {
  const want = new Set(e.answer.map(([l, r]) => `${l}|${r}`))
  return pairs.length === want.size && pairs.every(([l, r]) => want.has(`${l}|${r}`))
}

// --- Stable shuffles (same order after a resume) -------------------------------

function seeded(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

export function shuffle<T>(items: T[], seed: string): T[] {
  const rnd = seeded(seed)
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Shuffle so the items never start in the answer order (for "order"). */
export function shuffleAway(items: Item[], answer: string[], seed: string): Item[] {
  if (items.length < 2) return items
  for (let k = 0; k < 6; k++) {
    const out = shuffle(items, `${seed}:${k}`)
    if (out.some((it, i) => it.id !== answer[i])) return out
  }
  return [...items].reverse()
}
