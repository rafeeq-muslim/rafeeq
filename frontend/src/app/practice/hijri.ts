/**
 * PRC-04: the Umm al-Qura Hijri date for every user, computed on the device
 * with the browser's built-in `islamic-umalqura` calendar (no library, no
 * network). Ramadan and Shawwal starts are «expected» until a sighting
 * announcement is published (Saudi Arabia only in v1); elsewhere the expected
 * date stands with a line to follow the local announcement.
 */
import { addDays, daysBetween, type YMD } from "./times"

export type Hijri = { year: number; month: number; day: number }
export type Sighting = { country: string; hijri_year: number; hijri_month: number; start: string }

const FMT = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", {
  timeZone: "UTC",
  year: "numeric",
  month: "numeric",
  day: "numeric",
})

/** R1: the Umm al-Qura date of a civil day (same everywhere for the same civil day). */
export function hijriOf(ymd: YMD): Hijri {
  const parts = FMT.formatToParts(new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d, 12)))
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10)
  return { year: get("relatedYear") || get("year"), month: get("month"), day: get("day") }
}

export const parseYmd = (s: string): YMD => {
  const [y, m, d] = s.split("-").map(Number)
  return { y, m, d }
}

/** The civil date that the calendar gives for day 1 of a Hijri month (searching around `near`). */
const starts = new Map<string, YMD>()

export function expectedStartOf(year: number, month: number, near: YMD): YMD {
  const key = `${year}-${month}`
  const hit = starts.get(key)
  if (hit) return hit
  // Estimate with the mean lunar month, then look a few days either side.
  const h = hijriOf(near)
  const months = (year - h.year) * 12 + (month - h.month)
  const guess = addDays(near, Math.round(months * 29.530589) - (h.day - 1))
  for (let i = 0; i <= 6; i++) {
    for (const d of [addDays(guess, i), addDays(guess, -i)]) {
      const x = hijriOf(d)
      if (x.year === year && x.month === month && x.day === 1) {
        starts.set(key, d)
        return d
      }
    }
  }
  throw new Error(`no start for ${year}/${month}`)
}

/** R2: day 1 of a month — the announced date in Saudi Arabia when published, else the calendar's. */
export function monthStart(year: number, month: number, near: YMD, sightings: Sighting[], country: string): { date: YMD; announced: boolean } {
  const s = country === "SA" ? sightings.find((x) => x.country === "SA" && x.hijri_year === year && x.hijri_month === month) : undefined
  return s ? { date: parseYmd(s.start), announced: true } : { date: expectedStartOf(year, month, near), announced: false }
}

export type RamadanState =
  | { kind: "ramadan"; day: number; start: YMD; announced: boolean }
  | { kind: "upcoming"; start: YMD; daysLeft: number; announced: boolean }

/** Where today stands relative to Ramadan, for one country's announcements. */
export function ramadanState(today: YMD, sightings: Sighting[], country: string): RamadanState {
  const h = hijriOf(today)
  for (const year of h.month >= 9 ? [h.year, h.year + 1] : [h.year]) {
    const start = monthStart(year, 9, today, sightings, country)
    const end = monthStart(year, 10, addDays(start.date, 30), sightings, country)
    if (daysBetween(today, start.date) > 0) return { kind: "upcoming", start: start.date, daysLeft: daysBetween(today, start.date), announced: start.announced }
    if (daysBetween(today, end.date) > 0) return { kind: "ramadan", day: daysBetween(start.date, today) + 1, start: start.date, announced: start.announced }
  }
  const next = monthStart(h.year + 1, 9, addDays(today, 330), sightings, country)
  return { kind: "upcoming", start: next.date, daysLeft: daysBetween(today, next.date), announced: next.announced }
}

/** R2: Ramadan mode (Isha +30 under Umm al-Qura, suhoor and iftar, fasting
 * reminders) starts only with an announced sighting, never from the
 * calculation alone; until then the day is shown as expected. */
export function isRamadan(today: YMD, sightings: Sighting[], country: string): boolean {
  const s = ramadanState(today, sightings, country)
  return s.kind === "ramadan" && s.announced
}
