import { describe, expect, it } from "vitest"
import { MAX_QUESTIONS, asksQuestions, begin, passedUnits, question, record, stop, testMore, type PlacementState, type Probe } from "./placement"
import type { Exercise } from "./types"

const ex = (id: string): Exercise => ({ id, type: "choose", objectives: [], cards: [], prompt: id, options: [], answer: "a" })
const all: Probe[] = ["u1", "u2", "u3", "u4", "u5"].map((u) => ({ unitId: u, questions: [ex(`${u}-a`), ex(`${u}-b`)] }))

/** Answer until the test stops or offers more units. */
function answerAll(s: PlacementState, answers: boolean[], asked: string[] = []) {
  for (const a of answers) {
    const q = question(s, all)
    if (!q) break
    asked.push(q.id)
    s = record(s, all, a)
  }
  return { s, asked, passed: passedUnits(s, all) }
}

const run = (since: Parameters<typeof begin>[0], answers: boolean[]) => answerAll(begin(since, all.length), answers)

describe("lrn-05 placement", () => {
  it("lrn-05-r2: «هذا الأسبوع» asks no question and opens no unit", () => {
    // Joseph embraced Islam three days ago and chose "this week".
    const s = begin("week", all.length)
    expect(asksQuestions("week")).toBe(false)
    expect(s.done).toBe(true)
    expect(question(s, all)).toBeNull()
    expect(passedUnits(s, all)).toEqual([])
  })

  it("lrn-05-r2: unspecified time starts at the first unit", () => {
    expect(run("skip", [true]).asked).toEqual(["u1-a"])
  })

  it("lrn-05-r2: less than a month starts at the first unit", () => {
    expect(run("month", [true]).asked).toEqual(["u1-a"])
  })

  it("lrn-05-r2: more than a month, passing unit 2 also passes unit 1", () => {
    const r = run("more", [true, true, false])
    expect(r.asked.slice(0, 2)).toEqual(["u2-a", "u2-b"])
    expect(r.passed).toEqual(["u1", "u2"])
  })

  it("lrn-05-r2 (error): a miss in unit 2 falls back to unit 1", () => {
    const r = run("more", [true, false, true])
    expect(r.asked).toEqual(["u2-a", "u2-b", "u1-a"])
  })

  it("lrn-05-r2 (error): failing unit 2 then unit 1 opens nothing", () => {
    const r = run("more", [false, true, false])
    expect(r.s.done).toBe(true)
    expect(r.passed).toEqual([])
  })

  it("lrn-05-r3: stops at the first unit not passed", () => {
    const r = run("month", [true, true, true, false, true])
    expect(r.s.done).toBe(true)
    expect(r.passed).toEqual(["u1"])
  })

  it("lrn-05-r3: at most 6 questions, then «اختبر وحدات أخرى؟» when all were right", () => {
    // Daniel chose "less than a month" and answered the first six right.
    const r = run("month", Array(20).fill(true))
    expect(MAX_QUESTIONS).toBe(6)
    expect(r.asked).toHaveLength(6)
    expect(r.passed).toEqual(["u1", "u2", "u3"])
    expect(r.s.offer).toBe(true)
    expect(r.s.done).toBe(false)
    expect(question(r.s, all)).toBeNull()
    // "No": the result shows; he starts at the first unit not passed.
    const result = stop(r.s)
    expect(result.done).toBe(true)
    expect(passedUnits(result, all)).toEqual(["u1", "u2", "u3"])
  })

  it("lrn-05-r3: «اختبر وحدات أخرى؟» accepted goes on the same way for up to 6 more", () => {
    const first = run("month", Array(6).fill(true))
    const asked: string[] = []
    const r = answerAll(testMore(first.s), [true, true, true, false], asked)
    expect(asked).toEqual(["u4-a", "u4-b", "u5-a", "u5-b"])
    expect(r.s.done).toBe(true)
    expect(r.passed).toEqual(["u1", "u2", "u3", "u4"])
  })

  it("lrn-05-r3: the second round also stops after 6 more questions", () => {
    const many: Probe[] = Array.from({ length: 9 }, (_, i) => ({ unitId: `u${i + 1}`, questions: [ex(`u${i + 1}-a`), ex(`u${i + 1}-b`)] }))
    let s = begin("month", many.length)
    let count = 0
    const go = () => {
      while (question(s, many)) {
        s = record(s, many, true)
        count++
      }
    }
    go()
    expect(count).toBe(6)
    s = testMore(s)
    go()
    expect(count).toBe(12)
    expect(s.offer).toBe(true)
    expect(passedUnits(s, many)).toHaveLength(6)
  })

  it("lrn-05-r3: a round with a miss (fall back) ends without the offer", () => {
    // "More than a month": a miss in unit 2, then unit 1, 2 and 3 right: six questions, one wrong.
    const r = run("more", [true, false, true, true, true, true, true, true])
    expect(r.asked).toHaveLength(6)
    expect(r.s.offer).toBe(false)
    expect(r.s.done).toBe(true)
  })
})
