/** Content model (content/*.json, served by the API with approvals). */
import type { Locale } from "@/app/i18n"

export type L10n = Partial<Record<Locale, string>>

export type Card = {
  id: string
  kind: "text" | "step" | "review"
  text: L10n
  image_url?: string | null
  quran?: { sura: number; ayat: [number, number] } | null
}

export type Objective = { id: string; text: L10n; cards: string[]; key?: boolean }

type ExerciseBase = { id: string; objectives: string[]; cards: string[]; prompt: L10n }
export type ChooseExercise = ExerciseBase & { type: "choose"; options: { id: string; text: L10n }[]; answer: string }
export type OrderExercise = ExerciseBase & { type: "order"; items: { id: string; text: L10n }[]; answer: string[] }
export type MatchExercise = ExerciseBase & {
  type: "match"
  left: { id: string; text: L10n }[]
  right: { id: string; text: L10n }[]
  answer: [string, string][]
}
export type Exercise = ChooseExercise | OrderExercise | MatchExercise

export type Lesson = {
  id: string
  unit: string
  order: number
  title: L10n
  cards: Card[]
  objectives: Objective[]
  exercises: Exercise[]
  /** Languages the Sharia reviewer approved (or `preview` for team accounts). */
  approved: Locale[]
  media?: { audio?: L10n; video?: L10n }
}

export type Unit = {
  id: string
  order: number
  title: L10n
  badge_name: L10n
  source_credit: L10n
  lessons: string[]
  approved: Locale[]
}
