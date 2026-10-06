/**
 * LRN-02: path state. Pure functions over content + device progress.
 * R1 lessons are done / next / locked; R2 a lesson opens after the previous
 * one (placement unlocks whole units, which never become the next step);
 * R3 one clear next step.
 */
import type { Lesson, Unit } from "./types"

export type LessonStatus = "done" | "next" | "open" | "locked"

export type Progress = {
  completed: Record<string, { first: string; last: string; times: number }>
  unlockedUnits: string[]
}

/** Units in path order. The server sends only units approved in the
 * learner's language (LRN-02 R1, LRN-09 R2); a team preview sends all. */
export function visibleUnits(units: Unit[]): Unit[] {
  return [...units].sort((a, b) => a.order - b.order)
}

/** Ordered lessons across visible units. */
export function orderedLessons(units: Unit[], lessons: Record<string, Lesson>): Lesson[] {
  return visibleUnits(units).flatMap((u) => u.lessons.map((id) => lessons[id]).filter(Boolean))
}

export function lessonStatus(lesson: Lesson, all: Lesson[], p: Progress): LessonStatus {
  if (p.completed[lesson.id]) return "done"
  const isNext = nextLesson(all, p)?.id === lesson.id
  if (p.unlockedUnits.includes(lesson.unit)) return isNext ? "next" : "open"
  const idx = all.findIndex((l) => l.id === lesson.id)
  const prev = all[idx - 1]
  const prevOk = !prev || !!p.completed[prev.id] || p.unlockedUnits.includes(prev.unit)
  if (!prevOk) return "locked"
  return isNext ? "next" : "open"
}

/** The learner's one next step (R2, R3), used everywhere a next step is
 * shown: the first lesson not completed after the last unit passed in
 * placement (LRN-05); when everything after it is completed, the first
 * lesson not completed anywhere. Passed units stay open but never become
 * the next step while a later lesson is left. */
export function nextLesson(all: Lesson[], p: Progress): Lesson | undefined {
  let from = 0
  for (let i = all.length - 1; i >= 0; i--) {
    if (p.unlockedUnits.includes(all[i].unit)) {
      from = i + 1
      break
    }
  }
  return all.slice(from).find((l) => !p.completed[l.id]) ?? all.find((l) => !p.completed[l.id])
}

/** A unit opened by placement (LRN-05 R4) and not yet completed lesson by
 * lesson: the path says it was passed instead of «0 من 7» (R2). */
export function unitPassed(unit: Unit, p: Progress): boolean {
  return p.unlockedUnits.includes(unit.id) && !unitDone(unit, p)
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
