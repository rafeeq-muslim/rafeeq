/**
 * LRN-05 adaptive placement test as pure functions.
 * Each unit is probed with two questions on two of its key objectives
 * (LRN-10). R2 "more than a month" starts at unit 2; a miss there falls
 * back to unit 1. R3 a unit passes when both its questions are right; the
 * test moves on, and stops at the first unit not passed or after 8
 * questions. R4 passed units open; they are not completed.
 */
import type { Content, Exercise } from "./types"
import { visibleUnits } from "./path"

export type Since = "week" | "month" | "more" | "skip"
export type Probe = { unitId: string; questions: Exercise[] }

export const MAX_QUESTIONS = 8

/** Two questions per unit on its key objectives (first exercise of each). */
export function probes(content: Content): Probe[] {
  const out: Probe[] = []
  for (const unit of visibleUnits(content.units)) {
    const lessons = unit.lessons.map((id) => content.lessons[id]).filter(Boolean)
    const marked = lessons.flatMap((l) => l.objectives.filter((o) => o.key).map((o) => ({ o, l })))
    // Units without marked key objectives: each lesson's first objective, in order.
    const keys = marked.length >= 2 ? marked : lessons.flatMap((l) => l.objectives.slice(0, 1).map((o) => ({ o, l })))
    const picked: Exercise[] = []
    for (const { o, l } of keys) {
      const ex = l.exercises.find((e) => e.objectives.includes(o.id) && e.type === "choose") ?? l.exercises.find((e) => e.objectives.includes(o.id))
      if (ex && !picked.some((p) => p.id === ex.id)) picked.push(ex)
      if (picked.length === 2) break
    }
    if (picked.length === 2) out.push({ unitId: unit.id, questions: picked })
    else break // a unit we cannot probe ends the test's reach
  }
  return out
}

export type PlacementState = {
  start: number // probe index the test started at
  unit: number // probe index being asked
  q: number // question index within the unit
  asked: number
  passed: number[] // probe indexes passed
  fellBack: boolean
  done: boolean
}

export function begin(since: Since, available: number): PlacementState {
  const start = since === "more" && available > 1 ? 1 : 0
  return { start, unit: start, q: 0, asked: 0, passed: [], fellBack: false, done: available === 0 }
}

export function question(s: PlacementState, all: Probe[]): Exercise | null {
  return s.done ? null : (all[s.unit]?.questions[s.q] ?? null)
}

export function record(s: PlacementState, all: Probe[], correct: boolean): PlacementState {
  const asked = s.asked + 1
  let next: PlacementState
  if (correct && s.q === 0) {
    next = { ...s, asked, q: 1 }
  } else if (correct) {
    // Unit passed. Passing the starting unit above unit 1 also passes the ones before it (R2 example).
    const below = s.unit === s.start && !s.fellBack ? Array.from({ length: s.unit }, (_, i) => i) : []
    const passed = [...new Set([...s.passed, ...below, s.unit])].sort((a, b) => a - b)
    next = { ...s, asked, passed, unit: s.unit + 1, q: 0, done: s.unit + 1 >= all.length }
  } else if (s.unit === s.start && s.start > 0 && !s.fellBack) {
    next = { ...s, asked, unit: 0, q: 0, fellBack: true } // R2: back to unit 1
  } else {
    next = { ...s, asked, done: true } // R3: stop at the first unit not passed
  }
  if (next.asked >= MAX_QUESTIONS) next = { ...next, done: true }
  return next
}

/** Unit ids that the result opens (R4). */
export function passedUnits(s: PlacementState, all: Probe[]): string[] {
  return s.passed.map((i) => all[i].unitId)
}
