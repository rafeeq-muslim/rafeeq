/** Starter suggestions of the Ask screen (KNW-01 reliability R1). The id is
 * stable across languages and used for tracing and tests only: a suggestion
 * sends its shown text through the same request as typing it. */
import type { Key } from "@/app/i18n"

export const SUGGESTIONS: { id: string; key: Key }[] = [
  { id: "learning_next", key: "ask.whatNext" },
  { id: "shahada_meaning", key: "ask.suggest.1" },
  { id: "wudu_virtue", key: "ask.suggest.2" },
  { id: "parents_treatment", key: "ask.suggest.3" },
]
