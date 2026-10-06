/**
 * Save an answer (KNW-09 R2). The saved list and the answer text both live in
 * KNW-09's store (`useSaved`, kind "answer", keyed by the random ask id): the
 * answer's wording, its source ids and the date. The question text is never
 * kept (its consent rule is still an open question in KNW-09). Removing the
 * entry removes the text too (R5).
 */
import { useSaved } from "@/app/discover/savedStore"
import type { AskResponse } from "./types"

export function useSaveAnswer(r: AskResponse) {
  const saved = useSaved((s) => s.items.some((e) => e.kind === "answer" && e.ref === r.ask_id))
  const save = useSaved((s) => s.save)
  const remove = useSaved((s) => s.remove)
  const toggle = () => {
    if (saved) remove("answer", r.ask_id)
    else {
      // PRD live v3 step 6: a live source keeps its link and read time (not its text).
      const live_sources = r.sources
        .filter((s) => s.live && s.retrieved_at)
        .map((s) => ({ id: s.id, source_id: s.source_id, title: s.title ?? "", origin_url: s.origin_url, retrieved_at: s.retrieved_at as string }))
      save("answer", r.ask_id, new Date(), {
        lang: r.lang,
        answer: r.answer,
        source_ids: r.sources.map((s) => s.id),
        ...(live_sources.length ? { live_sources } : {}),
      })
    }
  }
  return { saved, toggle }
}
