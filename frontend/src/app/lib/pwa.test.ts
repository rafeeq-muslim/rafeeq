import { describe, expect, it } from "vitest"
import { inLearningFlow } from "./pwa"

describe("issue #9 item 11: updates never interrupt a lesson (LRN-03 R5)", () => {
  it("lesson, review and placement wait for the learner", () => {
    for (const p of ["/learn/lesson/u01-l1", "/learn/review", "/learn/placement"]) expect(inLearningFlow(p)).toBe(true)
  })
  it("everywhere else reloads quietly", () => {
    for (const p of ["/", "/learn", "/ask", "/me", "/practice"]) expect(inLearningFlow(p)).toBe(false)
  })
})
