/** KNW-09 R6: saved ids resolve to current approved content, or «unavailable». */
import type { SourceCard } from "@/app/ask/types"
import type { AnswerText, LiveSourceRef, SavedEntry } from "./savedStore"

export type Resolved<C, L, A = never> =
  | { entry: SavedEntry; available: true; content: C | L | A }
  | { entry: SavedEntry; available: false }

export function resolveSaved<C, L, A = never>(
  entries: SavedEntry[],
  approved: { cards: Map<string, C>; library: Map<string, L>; answers?: Map<string, A> },
): Resolved<C, L, A>[] {
  return entries.map((entry) => {
    const content =
      entry.kind === "card"
        ? approved.cards.get(entry.ref)
        : entry.kind === "library"
          ? approved.library.get(entry.ref)
          : entry.kind === "answer"
            ? approved.answers?.get(entry.ref)
            : undefined
    return content === undefined ? { entry, available: false as const } : { entry, available: true as const, content }
  })
}

/** A saved answer ready to show: its wording plus the stored record of every source. */
export type SavedAnswerView<S> = { text: AnswerText; sources: S[] }

/**
 * KNW-09 R2/R6: a saved answer is shown with the records the server serves
 * today for its source ids (Quran and hadith words come only from there).
 * No text on the device, or any source no longer served → not shown at all,
 * never half-sourced (rules.md §1.3, §2.3).
 */
export function resolveAnswer<S extends { id: string }>(
  text: AnswerText | undefined,
  records: Map<string, S>,
  liveRecord?: (ref: LiveSourceRef, lang: string) => S,
): SavedAnswerView<S> | undefined {
  if (!text || text.source_ids.length === 0) return undefined
  const live = new Map((text.live_sources ?? []).map((r) => [r.id, r]))
  const sources: S[] = []
  for (const id of text.source_ids) {
    // PRD live v3 step 6: a source read live is shown by its saved link and read time,
    // never as a new live search and never with text the device did not keep.
    const ref = live.get(id)
    const s = records.get(id) ?? (ref && liveRecord ? liveRecord(ref, text.lang) : undefined)
    if (!s) return undefined
    sources.push(s)
  }
  return { text, sources }
}

/** The card of a saved live source: identity, link and read time; no text. */
export function liveSourceCard(ref: LiveSourceRef, lang: string): SourceCard {
  const external = ref.id.split(":")[3] ?? ""
  return {
    id: ref.id,
    source_id: ref.source_id,
    source_name: ref.source_id,
    kind: "fatwa",
    lang,
    ref: { title: ref.title },
    ref_key: external,
    quote_text: "",
    arabic_text: null,
    translation: null,
    grade: null,
    attribution: null,
    title: ref.title || null,
    origin_url: ref.origin_url,
    version: `live:${ref.retrieved_at}`,
    live: true,
    retrieved_at: ref.retrieved_at,
  }
}
