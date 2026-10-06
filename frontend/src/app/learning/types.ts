/** Content model as served by GET /api/content?lang= : one language, the
 * Sharia reviewer's approved snapshot (KNW-05 R3, LRN-01 R6). */

/** LRN-01 R2: the book quotes part of a verse — a 1-based word span of the
 * stored Arabic (split on single spaces) and, for en/tl, the book's own
 * translation of that part. */
export type QuranExcerpt = { words: [number, number]; translation?: string }
/** `recite`: LRN-01 R4 / LRN-09 R2 — set by the server only on a whole-verse
 * card whose recitation file the Sharia reviewer approved. */
export type QuranRef = { sura: number; ayat: [number, number]; excerpt?: QuranExcerpt | null; recite?: boolean }

export type Card = {
  id: string
  kind: "text" | "step" | "review"
  text: string
  image_url?: string | null
  extra_images?: string[]
  quran?: QuranRef | null
  /** Recitation for this card in the learner's language (one file or verse by verse). */
  audio?: string[] | null
  hadith?: boolean
}

/** `text` is the team's wording for measuring mastery; `label` is the short
 * name the learner reads (LRN-10 R1). Never show `text` to learners. */
export type Objective = { id: string; text: string; label?: string; cards: string[]; key?: boolean }

export type Item = { id: string; text: string }
type ExerciseBase = { id: string; objectives: string[]; cards: string[]; prompt: string }
export type ChooseExercise = ExerciseBase & { type: "choose"; options: Item[]; answer: string }
export type OrderExercise = ExerciseBase & { type: "order"; items: Item[]; answer: string[] }
export type MatchExercise = ExerciseBase & { type: "match"; left: Item[]; right: Item[]; answer: [string, string][] }
export type Exercise = ChooseExercise | OrderExercise | MatchExercise

export type Lesson = {
  id: string
  unit: string
  order: number
  title: string
  cards: Card[]
  objectives: Objective[]
  exercises: Exercise[]
  source?: { page?: string; page_ar?: string } | null
  /** Learners only ever receive approved lessons; previews show the flag. */
  approved: boolean
  /** Team preview: the working text differs from what learners see. */
  changed?: boolean
  /** LRN-01 R5: optional support video in the learner's language. */
  media?: { video?: string | null } | null
}

export type Unit = {
  id: string
  order: number
  title: string
  badge_name: string
  source_credit: string
  lessons: string[]
  approved: boolean
}

export type Content = { lang: string; preview: boolean; units: Unit[]; lessons: Record<string, Lesson> }
