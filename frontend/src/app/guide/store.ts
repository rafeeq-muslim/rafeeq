/**
 * PLT-08 R6: what was suggested, dismissed or opened stays on this device.
 * Nothing here is sent anywhere.
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { GuideMemory } from "./suggest"

type GuideState = GuideMemory & {
  dismiss: (key: string, day: string) => void
  markUsed: (keys: string[]) => void
  markShown: (key: string, day: string) => void
}

export const useGuide = create<GuideState>()(
  persist(
    (set) => ({
      dismissed: {},
      used: {},
      lastShown: null,
      dismiss: (key, day) => set((s) => ({ dismissed: { ...s.dismissed, [key]: day } })),
      markUsed: (keys) =>
        set((s) => (keys.every((k) => s.used[k]) ? s : { used: { ...s.used, ...Object.fromEntries(keys.map((k) => [k, true as const])) } })),
      markShown: (key, day) => set((s) => (s.lastShown?.key === key && s.lastShown.day === day ? s : { lastShown: { key, day } })),
    }),
    { name: "rafeeq.guide", version: 1 },
  ),
)
