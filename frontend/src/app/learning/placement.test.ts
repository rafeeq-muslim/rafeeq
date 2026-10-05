import { describe, expect, it } from "vitest"
import { MAX_QUESTIONS, begin, passedUnits, question, record, type Probe } from "./placement"
import type { Exercise } from "./types"

const ex = (id: string): Exercise => ({ id, type: "choose", objectives: [], cards: [], prompt: id, options: [], answer: "a" })
const all: Probe[] = ["u1", "u2", "u3", "u4", "u5"].map((u) => ({ unitId: u, questions: [ex(`${u}-a`), ex(`${u}-b`)] }))

function run(since: Parameters<typeof begin>[0], answers: boolean[]) {
  let s = begin(since, all.length)
  const asked: string[] = []
  for (const a of answers) {
    const q = question(s, all)
    if (!q) break
    asked.push(q.id)
    s = record(s, all, a)
  }
  return { s, asked, passed: passedUnits(s, all) }
}

describe("LRN-05 placement", () => {
  it("R2: unspecified time starts at the first unit", () => {
    expect(run("skip", [true]).asked).toEqual(["u1-a"])
  })

  it("R2: more than a month, passing unit 2 also passes unit 1", () => {
    const r = run("more", [true, true, false])
    expect(r.asked.slice(0, 2)).toEqual(["u2-a", "u2-b"])
    expect(r.passed).toEqual(["u1", "u2"])
  })

  it("R2 (error): a miss in unit 2 falls back to unit 1", () => {
    const r = run("more", [true, false, true])
    expect(r.asked).toEqual(["u2-a", "u2-b", "u1-a"])
  })

  it("R2 (error): failing unit 2 then unit 1 opens nothing", () => {
    const r = run("more", [false, true, false])
    expect(r.s.done).toBe(true)
    expect(r.passed).toEqual([])
  })

  it("R3: stops at the first unit not passed", () => {
    const r = run("week", [true, true, true, false, true])
    expect(r.s.done).toBe(true)
    expect(r.passed).toEqual(["u1"])
  })

  it("R3: stops after 8 questions", () => {
    const r = run("week", Array(20).fill(true))
    expect(r.asked).toHaveLength(MAX_QUESTIONS)
    expect(r.passed).toEqual(["u1", "u2", "u3", "u4"])
  })
})
