/** KNW-09 R6: saved ids resolve to current approved content, or «unavailable». */
import type { SavedEntry } from "./savedStore"

export type Resolved<C, L> =
  | { entry: SavedEntry; available: true; content: C | L }
  | { entry: SavedEntry; available: false }

export function resolveSaved<C, L>(
  entries: SavedEntry[],
  approved: { cards: Map<string, C>; library: Map<string, L> },
): Resolved<C, L>[] {
  return entries.map((entry) => {
    const content = entry.kind === "card" ? approved.cards.get(entry.ref) : entry.kind === "library" ? approved.library.get(entry.ref) : undefined
    return content === undefined ? { entry, available: false as const } : { entry, available: true as const, content }
  })
}
