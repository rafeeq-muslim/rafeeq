import { describe, expect, it } from "vitest"
import { cardOfDay, dayNumber, modulusFor } from "./daily"
import type { DailyCardData } from "./types"

const card = (order: number): DailyCardData => ({
  id: `c${order}`,
  order,
  kind: "benefit",
  title: "",
  text: "",
  benefits: [],
  explanation: "",
  grade: "",
  attribution: "",
  source: { name: "HadeethEnc.com", url: "", version: "" },
})
const all = [0, 1, 2, 3].map(card)

describe("KNW-07 card of the day", () => {
  it("R4: same card all day (morning and evening)", () => {
    const morning = dayNumber(new Date(2026, 9, 5, 7, 0))
    const evening = dayNumber(new Date(2026, 9, 5, 22, 30))
    expect(morning).toBe(evening)
    expect(cardOfDay(all, 4, morning)?.id).toBe(cardOfDay(all, 4, evening)?.id)
  })

  it("R4: the next day brings the next card", () => {
    const d = dayNumber(new Date(2026, 9, 5))
    const today = cardOfDay(all, 4, d)!
    expect(cardOfDay(all, 4, d + 1)!.order).toBe((today.order + 1) % 4)
  })

  it("R4: the set restarts after the last card", () => {
    const first = 4 * 5000 // a day whose remainder is 0
    expect(cardOfDay(all, 4, first + 3)?.id).toBe("c3")
    expect(cardOfDay(all, 4, first + 4)?.id).toBe("c0")
  })

  it("R1: unapproved card on its day → next approved", () => {
    const approved = [card(0), card(2), card(3)] // c1 not approved in this language
    expect(cardOfDay(approved, 4, 4 * 5000 + 1)?.id).toBe("c2")
    expect(cardOfDay([card(0), card(1)], 4, 4 * 5000 + 3)?.id).toBe("c0") // wraps to the start
  })

  it("R5: returning after days away shows only today's card", () => {
    const today = 4 * 5000 + 2
    // The function only knows today: nothing about the days the learner was away.
    expect(cardOfDay(all, 4, today)?.id).toBe("c2")
  })

  it("R6: no approved card in the language → nothing, never a machine translation", () => {
    expect(cardOfDay([], 4, 123)).toBeNull()
  })

  it("step 6: grown set keeps the old modulus until a remainder-0 day", () => {
    const since = 4 * 5000 + 1 // set grew from 4 to 6 on a day with remainder 1
    expect(modulusFor(since, 6, { count: 4, since })).toBe(4)
    expect(modulusFor(since + 2, 6, { count: 4, since })).toBe(4)
    expect(modulusFor(since + 3, 6, { count: 4, since })).toBe(6) // remainder 0 on the old count
  })
})
