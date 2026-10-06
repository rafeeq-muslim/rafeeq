/** POST /api/ask contract (docs/engineering/implementation/KNW-01.md §2). */
export type Outcome =
  | "answered"
  | "cached"
  | "no_source"
  | "verification_failed"
  | "unavailable"
  | "danger"
  | "refused"
  | "out_of_scope"
  | "learning_guide"

/** Public reason codes (KNW-01 reliability R4). The app never sees provider messages. */
export type ReasonCode =
  | "retrieval_empty"
  | "insufficient_evidence"
  | "verification_rejected"
  | "temporarily_unavailable"
  | "deadline_exceeded"
  | "service_limit"

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
  /** A value this build does not know is shown as a safe failure, never as an answer. */
  outcome: Outcome | (string & {})
  reason_code?: ReasonCode | (string & {}) | null
  retryable?: boolean
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

/** How the question was sent (R1). Both go through the same request. */
export type Entrypoint = "typed" | "suggestion"

/** What a retry re-sends: the question as first asked, never the current UI language (§14.3). */
export type AskSnapshot = {
  question: string
  lang: string
  consent_objectives: boolean
  entrypoint: Entrypoint
  suggestion_id?: string
}

export type ErrorCode =
  | "network"
  | "timeout"
  | "cancelled"
  | "rate_limited"
  | "invalid"
  | "server"
  | "invalid_response"

export type Turn =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; state: "pending"; startedAt: number; attemptId: string; snapshot: AskSnapshot }
  | { id: string; role: "assistant"; state: "done"; response: AskResponse; snapshot: AskSnapshot }
  | {
      id: string
      role: "assistant"
      state: "error"
      code: ErrorCode
      retryAfter: number | null
      snapshot: AskSnapshot
    }
  | { id: string; role: "assistant"; state: "guide"; text: string; nextHref: string | null; ai: boolean }
