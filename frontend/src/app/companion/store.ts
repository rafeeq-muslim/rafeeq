/** Companion (CMP) device state. The guest help token stays on this device
 * only; the server keeps its hash (CMP-01 R2). Clearing site data loses it,
 * and with it the guest's conversations (the screen says so). */
import { create } from "zustand"
import { persist } from "zustand/middleware"

type CompanionState = {
  /** Random secret for a guest's help requests. Never sent anywhere but our own API. */
  helpToken: string | null
  /** CMP-01 R3: the answer to «أخ أم أخت؟», asked once and kept on this device only. */
  helpGender: "m" | "f" | null
  /** Whether the signed-in learner is in a group (MOT-06 learning log is sent only then). */
  inGroup: boolean
  set: (p: Partial<Omit<CompanionState, "set">>) => void
}

export const useCompanion = create<CompanionState>()(
  persist(
    (set) => ({
      helpToken: null,
      helpGender: null,
      inGroup: false,
      set: (p) => set(p),
    }),
    { name: "rafeeq.companion", version: 1 },
  ),
)

export function helpHeaders(): Record<string, string> {
  const token = useCompanion.getState().helpToken
  return token ? { "X-Help-Token": token } : {}
}
