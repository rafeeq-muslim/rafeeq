/**
 * PLT-08 R2–R3: which feature to suggest on Home, and when. Pure functions,
 * computed on the device from local progress only (R6).
 *
 * One table of moments, highest first. A moment is "ready" when the journey
 * reaches it; it stops for good once dismissed or once the learner opened
 * the feature (for adhkar, without recording the opening: QUIET_MOMENTS). Within one day the card stays the same; a new suggestion
 * appears at most once a day.
 */

export type MomentId = "ramadan" | "prayer" | "human" | "adhkar" | "discover"

/** Lessons of the day-one unit (LRN-01) that open a moment. */
export const LESSON_PREPARE_PRAYER = "u01-l5"
export const LESSON_LAST_DAY_ONE = "u01-l7"

export type RamadanLite =
  | { kind: "ramadan"; start: string }
  | { kind: "upcoming"; start: string; daysLeft: number }

export type GuideContext = {
  /** Completed lessons by id (LRN-02 progress). */
  completed: Record<string, unknown>
  /** Distinct days with a learning interaction (MOT-02). */
  learningDays: number
  ramadan: RamadanLite | null
  /** The device's local date, YYYY-MM-DD. */
  today: string
}

export type GuideMemory = {
  /** Moment key → the day it was dismissed. */
  dismissed: Record<string, string>
  /** Moment keys whose feature the learner opened. */
  used: Record<string, true>
  /** The suggestion first shown on a given day, kept for that day. */
  lastShown: { key: string; day: string } | null
}

export type Moment = {
  id: MomentId
  /** Home button target. */
  route: string
  /** Routes that count as "opened this feature". */
  opens: RegExp[]
  ready: (c: GuideContext) => boolean
  /** Ramadan returns each year; the others once. */
  key: (c: GuideContext) => string
}

export const RAMADAN_LEAD_DAYS = 14
export const DISCOVER_AFTER_DAYS = 3

export const MOMENTS: Moment[] = [
  {
    id: "ramadan",
    route: "/practice",
    opens: [/^\/practice\/?$/],
    ready: (c) => c.ramadan != null && (c.ramadan.kind === "ramadan" || c.ramadan.daysLeft <= RAMADAN_LEAD_DAYS),
    key: (c) => `ramadan-${c.ramadan?.start.slice(0, 4) ?? ""}`,
  },
  {
    id: "prayer",
    route: "/practice",
    opens: [/^\/practice\/?$/, /^\/practice\/qibla/],
    ready: (c) => Boolean(c.completed[LESSON_PREPARE_PRAYER]),
    key: () => "prayer",
  },
  {
    id: "human",
    route: "/mentor",
    opens: [/^\/mentor/],
    ready: (c) => Object.keys(c.completed).length > 0,
    key: () => "human",
  },
  {
    id: "adhkar",
    route: "/practice/adhkar",
    opens: [/^\/practice\/adhkar/],
    ready: (c) => Boolean(c.completed[LESSON_LAST_DAY_ONE]),
    key: () => "adhkar",
  },
  {
    id: "discover",
    route: "/discover",
    opens: [/^\/discover/],
    ready: (c) => c.learningDays >= DISCOVER_AFTER_DAYS,
    key: () => "discover",
  },
]

export type Suggestion = { moment: Moment; key: string }

/** Ready moments not yet dismissed or used, highest first. */
export function pending(c: GuideContext, m: GuideMemory): Suggestion[] {
  return MOMENTS.filter((x) => x.ready(c))
    .map((moment) => ({ moment, key: moment.key(c) }))
    .filter(({ key }) => !(key in m.dismissed) && !m.used[key])
}

/** The one suggestion for Home now, or null (R1: at most one). */
export function suggestion(c: GuideContext, m: GuideMemory): Suggestion | null {
  const list = pending(c, m)
  // R3: the card shown today stays today; once it is dismissed or used,
  // the next one waits until tomorrow.
  if (m.lastShown?.day === c.today) return list.find((s) => s.key === m.lastShown?.key) ?? null
  return list[0] ?? null
}

/**
 * PRC-07 R4 («لا يُحفظ أنه فتحها»): opening the adhkar is never recorded, not
 * even on the device. Opening a quiet moment's feature switches its
 * suggestion off exactly like a dismissal, with no date, so the stored state
 * cannot tell an opening from a «not now» (R3 still holds: no suggestion
 * after the learner opened it). Their keys are fixed (key === id).
 */
export const QUIET_MOMENTS: ReadonlySet<string> = new Set<MomentId>(["adhkar"])

const opened = (path: string, c: GuideContext) =>
  MOMENTS.filter((x) => x.opens.some((r) => r.test(path))).filter((x) => x.id !== "ramadan" || x.ready(c))

/** Keys the learner "used" by opening this path (R3: no suggestion after). Quiet moments are left out. */
export function usedKeys(path: string, c: GuideContext): string[] {
  return opened(path, c)
    .filter((x) => !QUIET_MOMENTS.has(x.id))
    .map((x) => x.key(c))
}

/** Quiet moments whose suggestion ends because this path was opened (stored as a dateless dismissal). */
export function quietKeys(path: string, c: GuideContext): string[] {
  return opened(path, c)
    .filter((x) => QUIET_MOMENTS.has(x.id))
    .map((x) => x.key(c))
}

/** YYYY-MM-DD in the device's local time. */
export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
