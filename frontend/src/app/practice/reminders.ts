/**
 * PRC-05 prayer reminders on the web: computed on the device from the city's
 * times (R3, R6) and shown inside Rafeeq while it is open (see
 * docs/engineering/implementation/PRC-05.md §0). Off by default (R1), neutral
 * text by default (R2), silent (R4: no Rafeeq tone yet, no adhan before
 * permission), nothing recorded and no reminder for a time that has passed
 * (R5). Up to five prayers a day plus Ramadan's two, never backing off
 * (decisions.md 2026-10-05).
 */
import { toast } from "sonner"

import { translate, type Locale } from "@/app/i18n"
import { useDevice, type City } from "@/app/stores/device"
import { playTone } from "@/app/lib/tone"
import { isRamadan, type Sighting } from "./hijri"
import { countOf } from "./plural"
import { usePractice, type ReminderKey, type ReminderSettings } from "./store"
import { addDays, dayTimes, fastingTimes, formatTime, PRAYER_KEYS, ymdIn, ymdKey, type YMD } from "./times"

export type Reminder = { id: string; key: ReminderKey; at: Date; time: Date }

/** Reminders still to come today and tomorrow, in the city's time zone. */
export function upcomingReminders(
  city: Pick<City, "lat" | "lng" | "country" | "tz">,
  s: ReminderSettings,
  now: Date,
  isRamadan: (d: YMD) => boolean = () => false,
): Reminder[] {
  if (!s.enabled) return []
  const out: Reminder[] = []
  const today = ymdIn(city.tz, now)
  for (const ymd of [today, addDays(today, 1)]) {
    const ramadan = isRamadan(ymd)
    const t = dayTimes(city, ymd, { ramadan })
    const add = (key: ReminderKey, time: Date) => {
      const at = new Date(time.getTime() - s.offset * 60_000)
      out.push({ id: `${ymdKey(ymd)}:${key}:${s.offset}`, key, at, time })
    }
    for (const key of PRAYER_KEYS) if (s.prayers.includes(key)) add(key, t[key])
    if (ramadan) {
      const f = fastingTimes(city, ymd)
      if (s.suhoor) add("suhoor", f.suhoorEnds)
      if (s.iftar) out.push({ id: `${ymdKey(ymd)}:iftar`, key: "iftar", at: f.iftar, time: f.iftar })
    }
  }
  return out.filter((r) => r.at > now).sort((a, b) => a.at.getTime() - b.at.getTime())
}

/** R2: «تذكير» only, unless the learner chose to show the prayer's name.
 * PLT-05 R3 / PLT-06 R6: discreet mode makes it «تذكير» even then. */
export function reminderText(r: Reminder, s: ReminderSettings, locale: Locale, tz: string, discreet = useDevice.getState().discreet): string {
  if (!s.showName || discreet) return translate(locale, "practice.reminders.neutral")
  const name = translate(locale, `practice.prayer.${r.key}` as Parameters<typeof translate>[1])
  if (r.key === "iftar") return translate(locale, "practice.reminders.iftarNow")
  const minutes = Math.round((r.time.getTime() - r.at.getTime()) / 60_000)
  return minutes > 0
    ? translate(locale, "practice.reminders.before", { name, count: countOf(locale, "minutes", minutes) })
    : translate(locale, "practice.reminders.now", { name, time: formatTime(r.time, tz) })
}

let timer: ReturnType<typeof setInterval> | null = null
let known: Sighting[] = []

/** Sighting announcements as last loaded by the Practice screens (calendar dates until then). */
export function setKnownSightings(list: Sighting[]) {
  known = list
}

/** One timer while the app is open; no network. Started once from main.tsx. */
export function startReminderLoop(interval = 15_000) {
  if (timer || typeof window === "undefined") return
  let last = new Date()
  const tick = () => {
    const now = new Date()
    const { city, locale } = useDevice.getState()
    const { reminders, fired, set } = usePractice.getState()
    if (city && reminders.enabled) {
      // Everything that came due since the last tick (and not more than 2 minutes ago).
      const ramadan = (d: YMD) => isRamadan(d, known, city.country)
      const due = upcomingReminders(city, reminders, new Date(Math.max(last.getTime(), now.getTime() - 120_000) - 1), ramadan).filter(
        (r) => r.at <= now && !fired.includes(r.id),
      )
      for (const r of due) toast(reminderText(r, reminders, locale, city.tz), { id: r.id, duration: 60_000 })
      if (due.length) playTone() // PLT-07 R2: the Rafeeq tone, in the app only (silent until one is approved)
      if (due.length) set({ fired: [...fired, ...due.map((r) => r.id)].slice(-20) })
    }
    last = now
  }
  timer = setInterval(tick, interval)
}
