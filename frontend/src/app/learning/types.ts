/** Content model as served by GET /api/content?lang= : one language, the
 * Sharia reviewer's approved snapshot (KNW-05 R3, LRN-01 R6). */

export type QuranRef = { sura: number; ayat: [number, number] }

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

export type Objective = { id: string; text: string; cards: string[]; key?: boolean }

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
