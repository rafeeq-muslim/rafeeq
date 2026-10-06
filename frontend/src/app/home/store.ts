/**
 * PLT-09 R5, R6: the day's order, the optional slots placed today and the
 * hidden optional components. Kept on this device only (PLT-08 R6); none
 * of it is ever sent, the model included.
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { Order, OptionalId } from "./layout"

type HomeState = {
  /** R5: the device day (YYYY-MM-DD) the order was set, and the order. */
  day: string | null
  order: Order | null
  /** Optional components placed today, in place (R5). */
  slots: OptionalId[]
  /** R6: hidden with one tap; they do not come back. */
  hidden: Partial<Record<OptionalId, true>>
  setDay: (day: string, order: Order) => void
  setSlots: (slots: OptionalId[]) => void
  hide: (id: OptionalId) => void
}

export const useHome = create<HomeState>()(
  persist(
    (set) => ({
      day: null,
      order: null,
      slots: [],
      hidden: {},
      setDay: (day, order) => set({ day, order, slots: [] }),
      setSlots: (slots) => set((s) => (s.slots.length === slots.length && s.slots.every((x, i) => x === slots[i]) ? s : { slots })),
      hide: (id) => set((s) => ({ hidden: { ...s.hidden, [id]: true } })),
    }),
    { name: "rafeeq.home", version: 1 },
  ),
)
