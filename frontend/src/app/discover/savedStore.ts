/**
 * KNW-09 saved items: on the device first (guests included), keyed by kind
 * and id so nothing is saved twice (R1). Only ids are kept: what is shown is
 * always the current approved content, so withdrawn content is never shown
 * from here (R6). Signed-in learners get an account copy, merged as a union
 * (R3). Nothing here is visible to a mentor or group (R4).
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { api } from "@/app/lib/api"
import { useAuth } from "@/app/stores/auth"

export type SavedKind = "card" | "library" | "answer"
export type SavedEntry = { kind: SavedKind; ref: string; saved_at: string }

const keyOf = (e: { kind: string; ref: string }) => `${e.kind}:${e.ref}`

/** Union by kind+ref; the earliest save date wins; newest first. */
export function mergeSaved(a: SavedEntry[], b: SavedEntry[]): SavedEntry[] {
  const m = new Map<string, SavedEntry>()
  for (const e of [...a, ...b]) {
    const k = keyOf(e)
    const cur = m.get(k)
    if (!cur || e.saved_at < cur.saved_at) m.set(k, e)
  }
  return [...m.values()].sort((x, y) => y.saved_at.localeCompare(x.saved_at))
}

type SavedState = {
  items: SavedEntry[]
  has: (kind: SavedKind, ref: string) => boolean
  save: (kind: SavedKind, ref: string, now?: Date) => void
  remove: (kind: SavedKind, ref: string) => void
  clear: () => void
  replace: (items: SavedEntry[]) => void
}

export const useSaved = create<SavedState>()(
  persist(
    (set, get) => ({
      items: [],
      has: (kind, ref) => get().items.some((e) => e.kind === kind && e.ref === ref),
      save: (kind, ref, now = new Date()) => {
        set({ items: mergeSaved(get().items, [{ kind, ref, saved_at: now.toISOString() }]) })
        void pushSaved()
      },
      remove: (kind, ref) => {
        set({ items: get().items.filter((e) => !(e.kind === kind && e.ref === ref)) })
        if (useAuth.getState().token) void api(`/api/me/saved/${kind}/${encodeURIComponent(ref)}`, { method: "DELETE" }).catch(() => {})
      },
      clear: () => {
        set({ items: [] })
        if (useAuth.getState().token) void api("/api/me/saved", { method: "DELETE" }).catch(() => {})
      },
      replace: (items) => set({ items }),
    }),
    { name: "rafeeq.saved", version: 1, partialize: (s) => ({ items: s.items }) },
  ),
)

/** R3: send the device's list to the account and keep the merged result. */
export async function pushSaved(): Promise<void> {
  if (!useAuth.getState().token) return
  try {
    const r = await api<{ items: SavedEntry[] }>("/api/me/saved", { method: "PUT", body: { items: useSaved.getState().items } })
    useSaved.getState().replace(mergeSaved(useSaved.getState().items, r.items))
  } catch {
    /* offline: the device copy stays; merged on the next visit */
  }
}
