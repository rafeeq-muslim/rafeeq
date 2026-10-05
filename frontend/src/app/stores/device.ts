/**
 * Device-level settings (PLT). Persisted locally; nothing here leaves the
 * device except the random install ID inside anonymous events (MOT-07 R4).
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Locale } from "@/app/i18n"

export type City = { id: string; name: Record<string, string>; country: string; lat: number; lng: number; tz: string }

type DeviceState = {
  installId: string
  locale: Locale
  onboarded: boolean
  placementOffered: boolean
  shareEvents: boolean
  quickExit: boolean
  discreet: boolean
  firstOpenedAt: string
  city: City | null
  askConsent: boolean // KNW-10 R5: off until the learner turns it on
  dismissedSaveSheet: boolean
  /** Team accounts: show lessons still in Sharia review (never for learners). */
  preview: boolean
  set: (patch: Partial<Omit<DeviceState, "set">>) => void
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

function guessLocale(): Locale {
  const l = (typeof navigator !== "undefined" ? navigator.language : "ar").toLowerCase()
  if (l.startsWith("ar")) return "ar"
  if (l.startsWith("tl") || l.startsWith("fil")) return "tl"
  if (l.startsWith("en")) return "en"
  return "ar"
}

export const useDevice = create<DeviceState>()(
  persist(
    (set) => ({
      installId: newId(),
      locale: guessLocale(),
      onboarded: false,
      placementOffered: false,
      shareEvents: true,
      quickExit: false,
      discreet: false,
      firstOpenedAt: new Date().toISOString(),
      city: null,
      askConsent: false,
      dismissedSaveSheet: false,
      preview: false,
      set: (patch) => set(patch),
    }),
    { name: "rafeeq.device", version: 1 },
  ),
)
