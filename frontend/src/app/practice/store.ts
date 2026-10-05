/**
 * Practice settings and records kept ON THE DEVICE only (PRC-02 R4, PRC-05 R6):
 * prayer-reminder settings and private habits. Never synced to the account
 * and never sent anywhere. The city itself lives in the device store.
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { PrayerKey } from "./times"

export type ReminderKey = PrayerKey | "suhoor" | "iftar"

export type ReminderSettings = {
  /** PRC-05 R1: off until the learner turns it on. */
  enabled: boolean
  prayers: PrayerKey[]
  /** R3: minutes before the time (0 = at the time). */
  offset: number
  /** R2: neutral «تذكير» unless the learner chooses to show the prayer name. */
  showName: boolean
  /** R1: Ramadan only, off until chosen. */
  suhoor: boolean
  iftar: boolean
}

export type Habit = {
  id: string
  title: string
  /** PRC-02: worship habits are private and never counted or rewarded. */
  worship: boolean
  /** A suggested habit's key (its title then comes from the UI strings). */
  suggested?: string
  createdAt: string
}

type PracticeState = {
  reminders: ReminderSettings
  habits: Habit[]
  /** habit id → local dates (YYYY-MM-DD) it was kept. Worship habits keep the latest date only. */
  log: Record<string, string[]>
  /** Reminder ids already shown, so a reload does not repeat them. */
  fired: string[]
  set: (patch: Partial<Omit<PracticeState, "set">>) => void
}

export const DEFAULT_REMINDERS: ReminderSettings = {
  enabled: false,
  prayers: ["fajr", "dhuhr", "asr", "maghrib", "isha"],
  offset: 0,
  showName: false,
  suhoor: false,
  iftar: false,
}

export const usePractice = create<PracticeState>()(
  persist(
    (set) => ({
      reminders: DEFAULT_REMINDERS,
      habits: [],
      log: {},
      fired: [],
      set: (patch) => set(patch),
    }),
    { name: "rafeeq.practice", version: 1 },
  ),
)
