/**
 * Save an answer (hook for KNW-09). The saved list itself is KNW-09's
 * (`useSaved`, kind "answer", keyed by the random ask id); this keeps the
 * answer's text, its source ids and the date on the device, so the saved
 * view can show it. The question text is never kept (plan §8.6: only with
 * explicit consent, which is not built yet).
 */
import { useSaved } from "@/app/discover/saved"
import type { AskResponse } from "./types"

export type SavedAnswer = { ask_id: string; lang: string; answer: string; source_ids: string[]; saved_at: string }

const KEY = "rafeeq.savedAnswers"

function read(): Record<string, SavedAnswer> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}")
  } catch {
    return {}
  }
}

function write(all: Record<string, SavedAnswer>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* storage blocked: the saved index still records the id */
  }
}

export function savedAnswer(askId: string): SavedAnswer | undefined {
  return read()[askId]
}

export function useSaveAnswer(r: AskResponse) {
  const saved = useSaved((s) => s.items.some((e) => e.kind === "answer" && e.ref === r.ask_id))
  const save = useSaved((s) => s.save)
  const remove = useSaved((s) => s.remove)
  const toggle = () => {
    const all = read()
    if (saved) {
      delete all[r.ask_id]
      write(all)
      remove("answer", r.ask_id)
      return
    }
    all[r.ask_id] = {
      ask_id: r.ask_id,
      lang: r.lang,
      answer: r.answer,
      source_ids: r.sources.map((s) => s.id),
      saved_at: new Date().toISOString(),
    }
    write(all)
    save("answer", r.ask_id)
  }
  return { saved, toggle }
}
