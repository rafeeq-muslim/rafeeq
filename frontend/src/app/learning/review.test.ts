import { describe, expect, it } from "vitest"
import { REVIEW_PAUSE_MS, selectReview } from "./review"
import type { ObjectiveState } from "./bkt"
import type { Exercise } from "./types"

const ex = (id: string): Exercise => ({ id, type: "choose", objectives: ["o1"], cards: [], prompt: id, options: [], answer: "a" })
const NOW = new Date("2026-10-06T12:00:00Z")
const practising = (minutesAgo: number, seen: string[] = []): ObjectiveState => ({
  p: 0.4,
  seen: true,
  answered: true,
  checksDone: 0,
  lastAnswerAt: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
  lastExerciseId: seen[seen.length - 1],
  seenExercises: seen,
})

describe("LRN-04 review selection (issue #9)", () => {
  const pool = { o1: [ex("e1"), ex("e2")] }

  it("only objectives of completed lessons enter review", () => {
    expect(selectReview({ o1: practising(120) }, pool, NOW, 5, new Set())).toEqual([])
    expect(selectReview({ o1: practising(120) }, pool, NOW, 5, new Set(["o1"]))).toHaveLength(1)
  })

  it("an objective answered minutes ago waits", () => {
    expect(selectReview({ o1: practising(5) }, pool, NOW, 5, new Set(["o1"]))).toEqual([])
    expect(REVIEW_PAUSE_MS).toBe(60 * 60 * 1000)
  })

  it("prefers an exercise the learner has never answered", () => {
    const picked = selectReview({ o1: practising(120, ["e1", "e2"].slice(0, 1)) }, pool, NOW, 5, new Set(["o1"]))
    expect(picked[0].exercise.id).toBe("e2")
  })
})
