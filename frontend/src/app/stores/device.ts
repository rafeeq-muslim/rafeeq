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
  /** MOT-05: mirrors the server reminder for this device's push subscription. */
  reminderOn: boolean
  reminderTime: string
  /** PLT-06 R2: mirrors the server «replies from a person» switch of this device. */
  repliesOn: boolean
  /** PLT-07 R3: the Rafeeq tone (plays only once an approved tone exists). */
  toneOn: boolean
  /** PLT-09: the server setting PLT09_ORGANIZED_HOME as last read (off until read as on; offline keeps it). */
  organizedHome: boolean
  /** PLT-09: team accounts preview the organized home on this device (off by default). */
  organizedHomePreview: boolean
  set: (patch: Partial<Omit<DeviceState, "set">>) => void
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

/** PLT-01 R1: the device's language, suggested on the first screen. */
export function guessLocale(language = typeof navigator !== "undefined" ? navigator.language : "ar"): Locale {
  const l = (language || "ar").toLowerCase()
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
      reminderOn: false,
      reminderTime: "20:00",
      repliesOn: false,
      toneOn: true,
      organizedHome: false,
      organizedHomePreview: false,
      set: (patch) => set(patch),
    }),
    { name: "rafeeq.device", version: 1 },
  ),
)
