/** POST /api/ask response (docs/engineering/implementation/KNW-01.md §2). */
export type Outcome =
  | "answered"
  | "cached"
  | "no_source"
  | "unavailable"
  | "danger"
  | "refused"
  | "out_of_scope"
  | "learning_guide"

export type SourceCard = {
  id: string
  source_id: string
  source_name: string
  kind: "quran_arabic" | "quran_translation" | "quran_tafsir" | "hadith" | string
  lang: string
  ref: { sura?: number; aya?: number; hadith_id?: number; title?: string; [k: string]: unknown }
  ref_key: string
  /** The stored text of the record (never written by the model). */
  quote_text: string
  /** Arabic ayah or Arabic hadith of the same record, from the database. */
  arabic_text: string | null
  translation: string | null
  grade: string | null
  attribution: string | null
  title: string | null
  origin_url: string
  version: string
}

export type AskResponse = {
  ask_id: string
  outcome: Outcome
  route: string | null
  level: string | null
  answer: string
  sources: SourceCard[]
  notes: string[]
  should_escalate: boolean
  handoff: { kind: "urgent" | "escalation"; lang: string } | null
  objective_id: string | null
  lang: string
}

export type Turn =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; state: "pending"; startedAt: number }
  | { id: string; role: "assistant"; state: "done"; response: AskResponse }
  | { id: string; role: "assistant"; state: "error"; question: string; code: "network" | "rate_limited" }
  | { id: string; role: "assistant"; state: "guide"; text: string; nextHref: string | null; ai: boolean }
