/**
 * PRC-01 prayer times, computed on the device with `adhan` (MIT). Location
 * never leaves the device (rules.md §4): nothing here touches the network.
 *
 * R3: each country's official calendar method (Umm al-Qura in KSA), MWL
 * where there is none; the learner is never asked about a method or madhhab.
 * R3 (error example): a prayer is never shown before its official time and
 * sunrise never after it. Times are computed unrounded and then rounded in
 * the cautious direction per prayer; the offsets were chosen against 40
 * official Umm al-Qura days in 5 cities (__fixtures__/umm-al-qura.json).
 * R4: everything is formatted in the CITY's time zone, never the device's.
 */
import { CalculationMethod, Coordinates, PrayerTimes, Qibla, Rounding } from "adhan"

export type PrayerKey = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha"
export type TimeKey = PrayerKey | "sunrise"
export const PRAYER_KEYS: PrayerKey[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"]
export const TIME_KEYS: TimeKey[] = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]

export type Method = "UmmAlQura" | "Kuwait" | "Qatar" | "Dubai" | "MuslimWorldLeague"
export type Place = { lat: number; lng: number; country: string }
export type YMD = { y: number; m: number; d: number }

const OFFICIAL: Record<string, Method> = { SA: "UmmAlQura", KW: "Kuwait", QA: "Qatar", AE: "Dubai" }

/** R3: the official calendar of the city's country, else the Muslim World League. */
export function methodFor(country: string): Method {
  return OFFICIAL[country] ?? "MuslimWorldLeague"
}

const MIN = 60_000

/** Minutes added after rounding up (prayers) — 0 means plain ceiling. */
const AFTER_CEIL: Record<PrayerKey, number> = { fajr: 1, dhuhr: 0, asr: 1, maghrib: 0, isha: 0 }

const ceilMin = (d: Date, plus = 0) => new Date(Math.ceil(d.getTime() / MIN) * MIN + plus * MIN)
const floorMin = (d: Date) => new Date(Math.floor(d.getTime() / MIN) * MIN)

/** The civil date in a time zone at an instant. */
export function ymdIn(tz: string, at: Date): YMD {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return { y: get("year"), m: get("month"), d: get("day") }
}

export function addDays(ymd: YMD, n: number): YMD {
  const t = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d + n))
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }
}

export const ymdKey = (v: YMD) => `${v.y}-${String(v.m).padStart(2, "0")}-${String(v.d).padStart(2, "0")}`
export const daysBetween = (a: YMD, b: YMD) => Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000)

function raw(place: Place, ymd: YMD) {
  const params = CalculationMethod[methodFor(place.country)]()
  params.rounding = Rounding.None
  // adhan reads the calendar day from the Date's local fields: build it from the city's date.
  return new PrayerTimes(new Coordinates(place.lat, place.lng), new Date(ymd.y, ymd.m - 1, ymd.d), params)
}

export type DayTimes = Record<TimeKey, Date> & { ymd: YMD; method: Method }

/**
 * One day's times for a place. `ramadan`: the day is in Ramadan (announced
 * or expected, see hijri.ts) — Umm al-Qura then delays Isha 30 minutes
 * (PRC-04 R4); other methods are unchanged.
 */
export function dayTimes(place: Place, ymd: YMD, opts: { ramadan?: boolean } = {}): DayTimes {
  const t = raw(place, ymd)
  const method = methodFor(place.country)
  const out = { ymd, method, sunrise: floorMin(t.sunrise) } as DayTimes
  for (const k of PRAYER_KEYS) out[k] = ceilMin(t[k], AFTER_CEIL[k])
  if (opts.ramadan && method === "UmmAlQura") out.isha = new Date(out.isha.getTime() + 30 * MIN)
  return out
}

/**
 * PRC-04 R3: the fast runs from Fajr to Maghrib, with no «imsak» before Fajr.
 * Suhoor end is the unrounded Fajr rounded DOWN (never later than the
 * official Fajr), iftar is Maghrib rounded up (never earlier).
 */
export function fastingTimes(place: Place, ymd: YMD): { suhoorEnds: Date; iftar: Date } {
  const t = raw(place, ymd)
  return { suhoorEnds: floorMin(t.fajr), iftar: ceilMin(t.maghrib) }
}

export type NextPrayer = { key: PrayerKey; at: Date; ymd: YMD; tomorrow: boolean }

/** R4: the next of the five prayers in the city; after Isha it is tomorrow's Fajr. */
export function nextPrayer(place: Place & { tz: string }, now: Date, isRamadan: (d: YMD) => boolean = () => false): NextPrayer {
  const today = ymdIn(place.tz, now)
  const t = dayTimes(place, today, { ramadan: isRamadan(today) })
  for (const key of PRAYER_KEYS) if (t[key] > now) return { key, at: t[key], ymd: today, tomorrow: false }
  const tomorrow = addDays(today, 1)
  return { key: "fajr", at: dayTimes(place, tomorrow, { ramadan: isRamadan(tomorrow) }).fajr, ymd: tomorrow, tomorrow: true }
}

/** The prayer whose time we are in now (null before Fajr). */
export function currentPrayer(times: DayTimes, now: Date): PrayerKey | null {
  let cur: PrayerKey | null = null
  for (const k of PRAYER_KEYS) if (times[k] <= now) cur = k
  return cur
}

const LOCALE_TAG: Record<string, string> = { ar: "ar-u-nu-latn", en: "en-US", tl: "fil-PH" }

/** «4:30» in the city's zone, Latin digits, 12-hour without the day period. */
export function formatTime(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(d)
  return parts
    .filter((p) => p.type === "hour" || p.type === "minute" || p.type === "literal")
    .map((p) => p.value)
    .join("")
    .trim()
}

/** «4:30 ص» / «4:30 AM» in the city's zone, Latin digits. */
export function formatTimeFull(d: Date, tz: string, locale: string): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale] ?? "en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(d)
}

export function splitDuration(ms: number): { h: number; m: number } {
  const total = Math.max(0, Math.ceil(ms / MIN))
  return { h: Math.floor(total / 60), m: total % 60 }
}

/** R5: great-circle bearing to the Kaaba from true north, in whole degrees. */
export function qiblaBearing(lat: number, lng: number): number {
  return Math.round(Qibla(new Coordinates(lat, lng))) % 360
}
