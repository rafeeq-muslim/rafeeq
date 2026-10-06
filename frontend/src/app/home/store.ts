/**
 * PLT-09 R5, R6: the day's order, the optional slots placed today and the
 * hidden optional components; PLT-08 R3: the day each optional component was
 * first shown, and the features opened. Kept on this device only (PLT-08 R6);
 * none of it is ever sent, the model included.
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { Order, OptionalId } from "./layout"

type Shown = Partial<Record<OptionalId, string>>

export type HomeMemory = {
  /** R5: the device day (YYYY-MM-DD) the order was set, and the order. */
  day: string | null
  order: Order | null
  /** Optional components placed today, in place (R5); a hidden one keeps its slot until tomorrow. */
  slots: OptionalId[]
  /** R6: hidden with one tap; they do not come back. */
  hidden: Partial<Record<OptionalId, true>>
  /** PLT-08 R3: the day each optional component was first shown (one new a day). */
  shown: Shown
  /** PLT-08 R3: features opened outside the guide's moments (save progress, library). */
  opened: Partial<Record<OptionalId, true>>
}

type HomeState = HomeMemory & {
  setDay: (day: string, order: Order) => void
  setSlots: (slots: OptionalId[]) => void
  hide: (id: OptionalId) => void
  markOpened: (ids: OptionalId[]) => void
}

/** Version 1 had no `shown`/`opened`: today's slots count as shown today. */
export function migrateHome(state: unknown, version: number): HomeMemory {
  const s = (state ?? {}) as Partial<HomeMemory>
  const shown: Shown = { ...(s.shown ?? {}) }
  if (version < 2 && s.day) for (const id of s.slots ?? []) shown[id] ??= s.day
  return { day: s.day ?? null, order: s.order ?? null, slots: s.slots ?? [], hidden: s.hidden ?? {}, shown, opened: s.opened ?? {} }
}

export const useHome = create<HomeState>()(
  persist(
    (set) => ({
      day: null,
      order: null,
      slots: [],
      hidden: {},
      shown: {},
      opened: {},
      setDay: (day, order) => set({ day, order, slots: [] }),
      setSlots: (slots) =>
        set((s) => {
          const same = s.slots.length === slots.length && s.slots.every((x, i) => x === slots[i])
          const fresh = s.day ? slots.filter((id) => !s.shown[id]) : []
          if (same && !fresh.length) return s
          return { slots, shown: fresh.length ? { ...s.shown, ...Object.fromEntries(fresh.map((id) => [id, s.day])) } : s.shown }
        }),
      hide: (id) => set((s) => ({ hidden: { ...s.hidden, [id]: true } })),
      markOpened: (ids) => set((s) => (ids.every((id) => s.opened[id]) ? s : { opened: { ...s.opened, ...Object.fromEntries(ids.map((id) => [id, true as const])) } })),
    }),
    { name: "rafeeq.home", version: 2, migrate: migrateHome },
  ),
)
