/**
 * PLT-09 the organized home: pure rules, computed on the device.
 *
 * - R1: the next step is never part of the order; three main components,
 *   at most two optional ones.
 * - R3: a fixed optional list; eligibility decided here from local state.
 * - R4: the model's order is checked again here; else the fixed order.
 * - R5: the order is set once per device day; an optional component that
 *   stops being eligible is removed in place and its slot stays empty that
 *   day. One the learner hides (R6) also leaves its slot empty until the
 *   next day, when the next eligible one may take it.
 * - PLT-08 R3 (not replaced by PLT-09): at most one NEW optional component
 *   a day, and none for a feature the learner already opened.
 */
import type { PrayerKey, DayTimes } from "@/app/practice/times"

export const MAIN = ["daily", "card", "ask"] as const
export type MainId = (typeof MAIN)[number]
/** R3 table order = the fixed order of the optional list. */
export const OPTIONAL = ["ramadan", "human", "save", "reciter", "library"] as const
export type OptionalId = (typeof OPTIONAL)[number]
export const MAX_OPTIONAL = 2

export type Order = { main: MainId[]; optional: OptionalId[] }
/** R4: «يومي، بطاقة اليوم، اسأل، ثم الاختياريان بترتيب الجدول». Also the offline order. */
export const FIXED_ORDER: Order = { main: [...MAIN], optional: [...OPTIONAL] }

/** R4: known ids only, each main component once, nothing else (the next step is never in it). */
export function checkOrder(o: unknown): Order | null {
  if (!o || typeof o !== "object") return null
  const { main, optional } = o as { main?: unknown; optional?: unknown }
  if (!Array.isArray(main) || !Array.isArray(optional)) return null
  if (main.length !== MAIN.length || new Set(main).size !== MAIN.length || !main.every((m) => (MAIN as readonly unknown[]).includes(m))) return null
  if (new Set(optional).size !== optional.length || !optional.every((x) => (OPTIONAL as readonly unknown[]).includes(x))) return null
  const opt = optional as OptionalId[]
  return { main: main as MainId[], optional: [...opt, ...OPTIONAL.filter((x) => !opt.includes(x))] }
}

// --- R4: the time of day, one bucket from the device clock -------------------------

export type Bucket = "fajr" | "morning" | "dhuhr" | "asr" | "evening" | "night"

/**
 * One of six words from the device's clock hour only. Not from prayer
 * times: those come from the location, which never leaves the device and
 * never reaches the model (R2 ex3, R4).
 */
export function timeBucket(d: Date): Bucket {
  const h = d.getHours()
  if (h >= 4 && h < 6) return "fajr"
  if (h >= 6 && h < 11) return "morning"
  if (h >= 11 && h < 15) return "dhuhr"
  if (h >= 15 && h < 18) return "asr"
  if (h >= 18 && h < 21) return "evening"
  return "night"
}

// --- R3: eligibility on the device ----------------------------------------------

/** Last lesson of the day-one unit (LRN-01): «بعد إتمام دليل اليوم الأول». */
export const LESSON_LAST_DAY_ONE = "u01-l7"
export const RAMADAN_LEAD_DAYS = 14

export type Eligibility = {
  completed: Record<string, unknown>
  signedIn: boolean
  /** CMP-03: the learner chose a mentor (only known when signed in). */
  hasMentor: boolean
  /** PLT-02: «احفظ تقدّمك» closed with «لاحقًا» (PLT-08 R3 / current Home). */
  saveDismissed: boolean
  ramadan: { kind: "ramadan" } | { kind: "upcoming"; daysLeft: number } | null
  /** KNW-08: the learner listened to a surah on this device. */
  openedListening: boolean
  reciterChosen: boolean
  /** KNW-08 R4: approved per-verse reciters (a choice needs two or more). */
  recitersAvailable: number
  /** KNW-06: an approved book or clip for the learner's unit, in their language. */
  libraryPick: boolean
  /** PLT-08 R3: features the learner already opened, so not offered again. */
  opened: Partial<Record<OptionalId, true>>
}

export function eligible(id: OptionalId, c: Eligibility): boolean {
  if (c.opened[id]) return false
  const firstLessonDone = Object.keys(c.completed).length > 0
  switch (id) {
    case "ramadan":
      return c.ramadan != null && (c.ramadan.kind === "ramadan" || c.ramadan.daysLeft <= RAMADAN_LEAD_DAYS)
    case "human":
      return firstLessonDone && !c.hasMentor
    case "save":
      return !c.signedIn && firstLessonDone && !c.saveDismissed
    case "reciter":
      return c.openedListening && !c.reciterChosen && c.recitersAvailable > 1 // a choice exists (the picker shows from two)
    case "library":
      return Boolean(c.completed[LESSON_LAST_DAY_ONE]) && c.libraryPick
  }
}

/** PLT-08 R3: paths that count as opening an optional component's feature, beyond the guide's own moments. */
export const OPENED_BY: Partial<Record<OptionalId, RegExp>> = {
  save: /^\/me\/account/,
  library: /^\/discover\/library/,
}

export function openedBy(path: string): OptionalId[] {
  return (Object.keys(OPENED_BY) as OptionalId[]).filter((id) => OPENED_BY[id]!.test(path))
}

/**
 * PLT-02 R1: Ramadan holds a slot for a whole month, so in that time the
 * save-progress offer, when eligible, is never below second among the
 * eligible components. Otherwise the day's order stands (R4).
 */
export function keepSaveInReach(order: OptionalId[], isEligible: (id: OptionalId) => boolean): OptionalId[] {
  if (!isEligible("ramadan")) return order
  const live = order.filter(isEligible)
  const at = live.indexOf("save")
  if (at <= 1) return order
  const rest: OptionalId[] = order.filter((id) => id !== "save")
  const after = rest.indexOf(live[0]) + 1
  return [...rest.slice(0, after), "save", ...rest.slice(after)]
}

/**
 * R1, R5, R6 and PLT-08 R3: the optional components of today, in the day's
 * order. `slots` are the ids placed today (kept on the device): each keeps
 * its place all day, hidden or no longer eligible (shown as nothing), so a
 * freed slot stays empty until tomorrow. Empty slots fill from the order,
 * and at most one of today's components may be new (`shown`: the day each
 * was first shown).
 */
export function daySlots(
  slots: OptionalId[],
  order: OptionalId[],
  isEligible: (id: OptionalId) => boolean,
  hidden: Partial<Record<OptionalId, true>>,
  shown: Partial<Record<OptionalId, string>> = {},
  today = "",
): OptionalId[] {
  const out = slots.slice(0, MAX_OPTIONAL)
  let newToday = out.filter((id) => !shown[id] || shown[id] === today).length
  for (const id of keepSaveInReach(order, isEligible)) {
    if (out.length >= MAX_OPTIONAL) break
    if (out.includes(id) || hidden[id] || !isEligible(id)) continue
    const isNew = !shown[id] || shown[id] === today
    if (isNew && newToday >= 1) continue
    if (isNew) newToday++
    out.push(id)
  }
  return out
}

/** What to render from the slots: eligible and not hidden, in place. */
export function visibleOptional(slots: OptionalId[], isEligible: (id: OptionalId) => boolean, hidden: Partial<Record<OptionalId, true>>): OptionalId[] {
  return slots.filter((id) => !hidden[id] && isEligible(id))
}

// --- R2: «يومي» follows the time, its place does not -----------------------------

export const SOON_MS = 60 * 60_000
export const AFTER_PRAYER_MS = 30 * 60_000

export type PrayerLine =
  | { kind: "unknown" }
  | { kind: "at"; key: PrayerKey; at: Date }
  | { kind: "soon"; key: PrayerKey; at: Date; minutes: number }

/** R2: the next prayer and its time; highlighted with the time left in the last hour. */
export function prayerLine(next: { key: PrayerKey; at: Date } | null, now: Date): PrayerLine {
  if (!next) return { kind: "unknown" }
  const left = next.at.getTime() - now.getTime()
  if (left > 0 && left <= SOON_MS) return { kind: "soon", key: next.key, at: next.at, minutes: Math.max(1, Math.ceil(left / 60_000)) }
  return { kind: "at", key: next.key, at: next.at }
}

export type AdhkarLine = "morning" | "evening" | "afterPrayer" | "sleep" | "any"

/**
 * R2: «أذكار الصباح بعد الفجر، وأذكار المساء بعد العصر، وأذكار ما بعد الصلاة
 * عقب كل صلاة». After a prayer (half an hour, as PRC-07 R6 orders the
 * groups) the after-prayer adhkar; otherwise morning from Fajr to Dhuhr,
 * evening from Asr to Isha, sleep after Isha. No city → the adhkar.
 */
export function adhkarLine(t: DayTimes | null, now: Date): AdhkarLine {
  if (!t) return "any"
  const n = now.getTime()
  for (const k of ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const) {
    const at = t[k].getTime()
    if (n >= at && n < at + AFTER_PRAYER_MS) return "afterPrayer"
  }
  if (n >= t.fajr.getTime() && n < t.dhuhr.getTime()) return "morning"
  if (n >= t.asr.getTime() && n < t.isha.getTime()) return "evening"
  // After Isha, and after midnight until Fajr (still the night after Isha).
  if (n >= t.isha.getTime() || n < t.fajr.getTime()) return "sleep"
  return "any"
}
