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

/**
 * The chosen approved reciter, else the first approved one; null → al-Muaiqly.
 * PLT-11 R5: a per-verse reciter is the default whenever one is approved;
 * al-Muaiqly's whole-surah files only when the learner chose them
 * (`wholeSurahId`, the recitation's id) or no per-verse reciter is approved.
 */
export function pickReciter(reciters: VerseReciter[], chosen: string | null, wholeSurahId?: string | null): VerseReciter | null {
  if (wholeSurahId && chosen === wholeSurahId) return null
  return reciters.find((r) => r.id === chosen) ?? reciters[0] ?? null
}

/**
 * PLT-11 R5: the size of a whole-surah file in megabytes, for the learner to
 * read before it plays (one decimal under 10 MB). null when not measured.
 */
export function surahMegabytes(sizes: Record<string, number> | undefined, sura: number): number | null {
  const bytes = sizes?.[String(sura)]
  if (!bytes) return null
  const mb = bytes / 1_000_000
  return mb < 10 ? Math.max(0.1, Math.round(mb * 10) / 10) : Math.round(mb)
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
