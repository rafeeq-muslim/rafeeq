/**
 * KNW-09 saved items: on the device first (guests included), keyed by kind
 * and id so nothing is saved twice (R1). Cards and library items keep only
 * their ids: what is shown is always the current approved content, so
 * withdrawn content is never shown from here (R6). A saved answer also keeps
 * its wording, its source ids and its language (R2), never the question; the
 * Quran and hadith words are fetched by id from the stored records when it is
 * shown. Signed-in learners get an account copy, merged as a union, answers
 * with their text (R3). Deleting one or all removes the text too (R5).
 * Nothing here is visible to a mentor or group (R4).
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { api } from "@/app/lib/api"
import { useAuth } from "@/app/stores/auth"

export type SavedKind = "card" | "library" | "answer"
export type SavedEntry = { kind: SavedKind; ref: string; saved_at: string }
/** R2: what a saved answer keeps. No question field, by design. */
export type AnswerText = { lang: string; answer: string; source_ids: string[] }

const keyOf = (e: { kind: string; ref: string }) => `${e.kind}:${e.ref}`

/** Union by kind+ref; the earliest save date wins; newest first. */
export function mergeSaved(a: SavedEntry[], b: SavedEntry[]): SavedEntry[] {
  const m = new Map<string, SavedEntry>()
  for (const e of [...a, ...b]) {
    const k = keyOf(e)
    const cur = m.get(k)
    if (!cur || e.saved_at < cur.saved_at) m.set(k, { kind: e.kind, ref: e.ref, saved_at: e.saved_at })
  }
  return [...m.values()].sort((x, y) => y.saved_at.localeCompare(x.saved_at))
}

// --- answer text on the device (`rafeeq.savedAnswers`, keyed by the random ask id) ---

const ANSWERS = "rafeeq.savedAnswers"

function readAnswers(): Record<string, AnswerText> {
  try {
    const all = JSON.parse(localStorage.getItem(ANSWERS) ?? "{}")
    return all && typeof all === "object" ? all : {}
  } catch {
    return {}
  }
}

function writeAnswers(all: Record<string, AnswerText>) {
  try {
    if (Object.keys(all).length === 0) localStorage.removeItem(ANSWERS)
    else localStorage.setItem(ANSWERS, JSON.stringify(all))
  } catch {
    /* storage blocked: nothing is kept */
  }
}

const isAnswerText = (a: unknown): a is AnswerText => {
  const x = a as AnswerText | null
  return !!x && typeof x.answer === "string" && x.answer.length > 0 && typeof x.lang === "string" && Array.isArray(x.source_ids) && x.source_ids.length > 0
}

/** Only the three fields are kept or sent (older copies carried more). */
const clean = (a: AnswerText): AnswerText => ({ lang: a.lang, answer: a.answer, source_ids: [...a.source_ids] })

export function savedAnswer(ref: string): AnswerText | undefined {
  const a = readAnswers()[ref]
  return isAnswerText(a) ? clean(a) : undefined
}

function keepAnswer(ref: string, a: AnswerText) {
  writeAnswers({ ...readAnswers(), [ref]: clean(a) })
}

function forgetAnswer(ref: string) {
  const all = readAnswers()
  if (!(ref in all)) return
  delete all[ref]
  writeAnswers(all)
}

/** R5: no answer text stays on the device once its entry is gone (also cleans older copies). */
export function pruneAnswers(items: SavedEntry[]) {
  const live = new Set(items.filter((e) => e.kind === "answer").map((e) => e.ref))
  const all = readAnswers()
  const kept = Object.fromEntries(Object.entries(all).filter(([ref]) => live.has(ref)))
  if (Object.keys(kept).length !== Object.keys(all).length) writeAnswers(kept)
}

type SavedState = {
  items: SavedEntry[]
  has: (kind: SavedKind, ref: string) => boolean
  save: (kind: SavedKind, ref: string, now?: Date, answer?: AnswerText) => void
  remove: (kind: SavedKind, ref: string) => void
  clear: () => void
  replace: (items: SavedEntry[]) => void
}

export const useSaved = create<SavedState>()(
  persist(
    (set, get) => ({
      items: [],
      has: (kind, ref) => get().items.some((e) => e.kind === kind && e.ref === ref),
      save: (kind, ref, now = new Date(), answer) => {
        if (kind === "answer" && answer) keepAnswer(ref, answer)
        set({ items: mergeSaved(get().items, [{ kind, ref, saved_at: now.toISOString() }]) })
        void pushSaved()
      },
      remove: (kind, ref) => {
        set({ items: get().items.filter((e) => !(e.kind === kind && e.ref === ref)) })
        if (kind === "answer") forgetAnswer(ref)
        if (useAuth.getState().token) void api(`/api/me/saved/${kind}/${encodeURIComponent(ref)}`, { method: "DELETE" }).catch(() => {})
      },
      clear: () => {
        set({ items: [] })
        writeAnswers({})
        if (useAuth.getState().token) void api("/api/me/saved", { method: "DELETE" }).catch(() => {})
      },
      replace: (items) => set({ items }),
    }),
    {
      name: "rafeeq.saved",
      version: 1,
      partialize: (s) => ({ items: s.items }),
      onRehydrateStorage: () => (state) => {
        if (state) pruneAnswers(state.items)
      },
    },
  ),
)

type AccountEntry = SavedEntry & { answer?: AnswerText | null }

/** R3: send the device's list (answers with their text) to the account and keep the merged result. */
export async function pushSaved(): Promise<void> {
  if (!useAuth.getState().token) return
  const items: AccountEntry[] = useSaved.getState().items.map((e) => {
    const answer = e.kind === "answer" ? savedAnswer(e.ref) : undefined
    return answer ? { ...e, answer } : e
  })
  try {
    const r = await api<{ items: AccountEntry[] }>("/api/me/saved", { method: "PUT", body: { items } })
    // An answer saved on another device arrives with its text.
    for (const e of r.items) if (e.kind === "answer" && isAnswerText(e.answer) && !savedAnswer(e.ref)) keepAnswer(e.ref, e.answer)
    useSaved.getState().replace(mergeSaved(useSaved.getState().items, r.items))
  } catch {
    /* offline: the device copy stays; merged on the next visit */
  }
}
