/**
 * PLT-08 R6: what was suggested, dismissed or opened stays on this device.
 * Nothing here is sent anywhere.
 *
 * PRC-07 R4: for quiet moments (adhkar) nothing says the feature was opened:
 * opening it and dismissing it both store the same dateless dismissal.
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"

import { QUIET_MOMENTS, type GuideMemory } from "./suggest"

type GuideState = GuideMemory & {
  dismiss: (key: string, day: string) => void
  markUsed: (keys: string[]) => void
  /** End quiet moments' suggestions without recording why (PRC-07 R4). */
  switchOff: (keys: string[]) => void
  markShown: (key: string, day: string) => void
}

/** Version 1 stored `used.adhkar`; move it to a dateless dismissal (PRC-07 R4). */
export function migrateGuide(state: unknown, version: number): GuideMemory {
  const s = (state ?? {}) as Partial<GuideMemory>
  const used = { ...(s.used ?? {}) }
  const dismissed = { ...(s.dismissed ?? {}) }
  if (version < 2) {
    for (const key of QUIET_MOMENTS) {
      if (used[key] || key in dismissed) dismissed[key] = ""
      delete used[key]
    }
  }
  return { dismissed, used, lastShown: s.lastShown ?? null }
}

export const useGuide = create<GuideState>()(
  persist(
    (set) => ({
      dismissed: {},
      used: {},
      lastShown: null,
      dismiss: (key, day) => set((s) => ({ dismissed: { ...s.dismissed, [key]: QUIET_MOMENTS.has(key) ? "" : day } })),
      markUsed: (keys) =>
        set((s) => (keys.every((k) => s.used[k]) ? s : { used: { ...s.used, ...Object.fromEntries(keys.map((k) => [k, true as const])) } })),
      switchOff: (keys) =>
        set((s) => (keys.every((k) => k in s.dismissed) ? s : { dismissed: { ...s.dismissed, ...Object.fromEntries(keys.map((k) => [k, ""])) } })),
      markShown: (key, day) => set((s) => (s.lastShown?.key === key && s.lastShown.day === day ? s : { lastShown: { key, day } })),
    }),
    { name: "rafeeq.guide", version: 2, migrate: migrateGuide },
  ),
)
