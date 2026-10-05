/**
 * LRN-02: path state. Pure functions over content + device progress.
 * R1 lessons are done / next / locked; R2 a lesson opens after the previous
 * one (placement unlocks whole units); R3 one clear next step.
 */
import type { Locale } from "@/app/i18n"
import type { Lesson, Unit } from "./types"

export type LessonStatus = "done" | "next" | "open" | "locked" | "unavailable"

export type Progress = {
  completed: Record<string, { first: string; last: string; times: number }>
  unlockedUnits: string[]
}

/** Units visible to the learner: approved in their language (LRN-02 R1, LRN-09 R2). */
export function visibleUnits(units: Unit[], locale: Locale): Unit[] {
  return [...units].sort((a, b) => a.order - b.order).filter((u) => u.approved.includes(locale))
}

/** Ordered lessons across visible units. */
export function orderedLessons(units: Unit[], lessons: Record<string, Lesson>, locale: Locale): Lesson[] {
  return visibleUnits(units, locale).flatMap((u) => u.lessons.map((id) => lessons[id]).filter(Boolean))
}

export function lessonStatus(lesson: Lesson, all: Lesson[], p: Progress, locale: Locale): LessonStatus {
  if (!lesson.approved.includes(locale)) return "unavailable"
  if (p.completed[lesson.id]) return "done"
  if (p.unlockedUnits.includes(lesson.unit)) return firstIncomplete(all, p, locale)?.id === lesson.id ? "next" : "open"
  const idx = all.findIndex((l) => l.id === lesson.id)
  const prev = all[idx - 1]
  const prevOk = !prev || !!p.completed[prev.id] || p.unlockedUnits.includes(prev.unit)
  if (!prevOk) return "locked"
  return firstIncomplete(all, p, locale)?.id === lesson.id ? "next" : "open"
}

/** R3: the first lesson not completed, in order. */
export function firstIncomplete(all: Lesson[], p: Progress, locale: Locale): Lesson | undefined {
  return all.find((l) => l.approved.includes(locale) && !p.completed[l.id])
}

export function unitDone(unit: Unit, p: Progress): boolean {
  return unit.lessons.length > 0 && unit.lessons.every((id) => p.completed[id])
}

export function unitProgress(unit: Unit, p: Progress): { done: number; total: number } {
  return { done: unit.lessons.filter((id) => p.completed[id]).length, total: unit.lessons.length }
}

/** Merge device progress with an account copy: union, keep earliest/latest (LRN-02 R4). */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const completed: Progress["completed"] = { ...a.completed }
  for (const [id, v] of Object.entries(b.completed)) {
    const c = completed[id]
    completed[id] = c
      ? { first: c.first < v.first ? c.first : v.first, last: c.last > v.last ? c.last : v.last, times: Math.max(c.times, v.times) }
      : v
  }
  return { completed, unlockedUnits: [...new Set([...a.unlockedUnits, ...b.unlockedUnits])] }
}
