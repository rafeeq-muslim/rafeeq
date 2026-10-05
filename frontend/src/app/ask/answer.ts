/**
 * Splitting an answer into the model's wording and the stored scripture
 * (KNW-01 R1, rules.md §1.3): every {{q:ID}} marker becomes the record with
 * that id from `sources`; the model never supplies the words. A marker whose
 * record is missing is dropped, never shown as text.
 */
import type { SourceCard } from "./types"

export type Segment = { type: "text"; text: string } | { type: "quote"; source: SourceCard }

const MARKER = /\{\{q:([^{}\s]+)\}\}/g

export function segments(answer: string, sources: SourceCard[]): Segment[] {
  const byId = new Map(sources.map((s) => [s.id, s]))
  const out: Segment[] = []
  const shown = new Set<string>()
  let last = 0
  for (const m of answer.matchAll(MARKER)) {
    const before = answer.slice(last, m.index).trim()
    if (before) out.push({ type: "text", text: before })
    const src = byId.get(m[1])
    // One quote per record: a second marker for the same id adds nothing.
    if (src && !shown.has(src.id)) {
      out.push({ type: "quote", source: src })
      shown.add(src.id)
    }
    last = (m.index ?? 0) + m[0].length
  }
  const rest = answer.slice(last).trim()
  if (rest) out.push({ type: "text", text: rest })
  // Drop bits that are only punctuation left over after a marker («… {{q:x}}.»).
  return out.filter((s) => s.type === "quote" || /[\p{L}\p{N}]/u.test(s.text))
}

export const isQuran = (s: SourceCard) => s.source_id === "quranenc"
export const isHadith = (s: SourceCard) => s.kind === "hadith"
