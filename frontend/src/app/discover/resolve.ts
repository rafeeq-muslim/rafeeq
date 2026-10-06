/** KNW-09 R6: saved ids resolve to current approved content, or «unavailable». */
import type { AnswerText, SavedEntry } from "./savedStore"

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
export function resolveAnswer<S extends { id: string }>(text: AnswerText | undefined, records: Map<string, S>): SavedAnswerView<S> | undefined {
  if (!text || text.source_ids.length === 0) return undefined
  const sources: S[] = []
  for (const id of text.source_ids) {
    const s = records.get(id)
    if (!s) return undefined
    sources.push(s)
  }
  return { text, sources }
}
