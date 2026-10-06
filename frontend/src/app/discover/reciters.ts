/**
 * KNW-08 R4: the reciter the learner listens to. Only Quranpedia per-verse
 * Hafs reciters the Sharia reviewer approved are offered (the server sends no
 * other); until one is approved, al-Muaiqly's per-surah mushaf stays. The
 * choice is kept on this device only.
 */
import { quranpediaUrl } from "@/app/lib/quranpedia"
import type { VerseReciter } from "./types"

const KEY = "rafeeq.quranReciter"

export function loadReciterChoice(storage: Pick<Storage, "getItem"> = localStorage): string | null {
  try {
    return storage.getItem(KEY)
  } catch {
    return null
  }
}

export function saveReciterChoice(id: string, storage: Pick<Storage, "setItem"> = localStorage) {
  try {
    storage.setItem(KEY, id)
  } catch {
    /* storage blocked: the first approved reciter next time */
  }
}

/** The chosen approved reciter, else the first approved one; null → al-Muaiqly. */
export function pickReciter(reciters: VerseReciter[], chosen: string | null): VerseReciter | null {
  return reciters.find((r) => r.id === chosen) ?? reciters[0] ?? null
}

export const verseUrl = (r: VerseReciter, sura: number, aya: number) => quranpediaUrl(r.quranpedia_id, sura, aya)

/**
 * R2: bring the verse being recited into view, only when it is not already
 * visible between the top bar and the player bar. No smooth scroll when the
 * learner asked for reduced motion.
 */
export function followVerse(el: Element, win: Window = window, top = 72, bottom = 112) {
  const r = el.getBoundingClientRect()
  if (r.top >= top && r.bottom <= win.innerHeight - bottom) return false
  const reduce = win.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" })
  return true
}
