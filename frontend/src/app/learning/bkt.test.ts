/** LRN-10 R3 (Bayesian Knowledge Tracing on first answers) and R4 (the four
 * levels), one test per example (audit 2026-10-06). */
import { describe, expect, it } from "vitest"
import { applyAnswer, fresh, guessFor, levelOf, MASTERY, P_L0, P_S, P_T, update, type ObjectiveState } from "./bkt"
import { answer, startSession } from "./session"
import { selectReview } from "./review"
import type { Lesson } from "./types"

const NOW = new Date("2026-10-06T12:00:00Z")

describe("lrn-10-r3 mastery after each first answer", () => {
  it("lrn-10-r3: the initial parameters are the PRD's", () => {
    expect([P_L0, P_T, P_S, guessFor("choose"), guessFor("match"), guessFor("order"), MASTERY]).toEqual([0.1, 0.2, 0.1, 0.25, 0.25, 0.05, 0.95])
  })

  it("lrn-10-r3: Joseph at 0.1 orders the first wudu steps right on his first try: mastery rises by the formula and is saved with the date", () => {
    const after = applyAnswer({ ...fresh(), p: 0.1 }, true, "order", "u01-l3-e1", NOW)
    const posterior = (0.1 * 0.9) / (0.1 * 0.9 + 0.9 * 0.05) // correct, P(G)=0.05 for ordering
    expect(after.p).toBeCloseTo(posterior + (1 - posterior) * 0.2, 10)
    expect(after.p).toBeCloseTo(0.7333, 4)
    expect(after.lastAnswerAt).toBe(NOW.toISOString())
    expect(after.answered).toBe(true)
    expect(after.seenExercises).toEqual(["u01-l3-e1"])
  })

  it("lrn-10-r3: a wrong answer lowers mastery", () => {
    expect(update(0.5, false, "choose")).toBeLessThan(0.5)
  })

  it("lrn-10-r3: wrong, then the correction, then right before the end: only the first answer counts", () => {
    const lesson = { id: "l", cards: [], exercises: [{ id: "e1" }] } as unknown as Lesson
    const one = answer(startSession(lesson, NOW), "e1", false, NOW)
    expect(one.first).toBe(true)
    const two = answer(one.session, "e1", true, NOW)
    expect(two.first).toBe(false) // the player records first answers only (Lesson, Review, quick check)
  })
})

describe("lrn-10-r4 four levels from mastery and what was seen", () => {
  const s = (over: Partial<ObjectiveState>): ObjectiveState => ({ ...fresh(), ...over })

  it("lrn-10-r4: not started / exposed / practising / mastered", () => {
    expect(levelOf(undefined)).toBe("not_started")
    expect(levelOf(s({}))).toBe("not_started")
    expect(levelOf(s({ seen: true }))).toBe("exposed") // saw its cards or read an assistant answer
    expect(levelOf(s({ seen: true, answered: true, p: 0.94 }))).toBe("practising")
    expect(levelOf(s({ seen: true, answered: true, p: 0.95 }))).toBe("mastered")
  })

  it("lrn-10-r4: at 0.96, a wrong review answer drops to about 0.80: practising again, and first in his review", () => {
    const masteredAt = "2026-09-20T12:00:00Z"
    const before = s({ seen: true, answered: true, p: 0.96, masteredAt, lastAnswerAt: masteredAt })
    expect(levelOf(before)).toBe("mastered")
    const after = applyAnswer(before, false, "choose", "e2", new Date("2026-10-06T10:00:00Z"))
    expect(after.p).toBeCloseTo(0.81, 2)
    expect(levelOf(after)).toBe("practising")
    expect(after.masteredAt).toBeUndefined()
    const other = s({ seen: true, answered: true, p: 0.9, lastAnswerAt: "2026-10-01T12:00:00Z" })
    const pool = { weak: [{ id: "e1" }], other: [{ id: "e3" }] } as never
    expect(selectReview({ other, weak: after }, pool, NOW, 5)[0].objectiveId).toBe("weak")
  })
})
