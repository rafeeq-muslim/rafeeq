import { describe, expect, it } from "vitest"
import { answer, checkMatch, checkOrder, current, isComplete, needsResumeChoice, nextCard, progressOf, shuffleAway, startSession } from "./session"
import type { Lesson } from "./types"

const lesson: Lesson = {
  id: "u2-l1",
  unit: "u2",
  order: 1,
  title: "Wudu (1)",
  approved: true,
  cards: [
    { id: "c1", kind: "step", text: "Intention" },
    { id: "c2", kind: "step", text: "Wash the hands" },
  ],
  objectives: [{ id: "o1", text: "Orders the first steps", cards: ["c1", "c2"] }],
  exercises: [
    { id: "e1", type: "order", objectives: ["o1"], cards: ["c1", "c2"], prompt: "Order", items: [{ id: "a", text: "Intention" }, { id: "b", text: "Hands" }], answer: ["a", "b"] },
    { id: "e2", type: "choose", objectives: ["o1"], cards: ["c1"], prompt: "Where?", options: [{ id: "a", text: "Heart" }, { id: "b", text: "Tongue" }], answer: "a" },
  ],
}

const read = (s = startSession(lesson)) => nextCard(nextCard(s))

describe("LRN-03 lesson flow", () => {
  it("R1: cards first, then exercises", () => {
    const s = startSession(lesson)
    expect(current(lesson, s)).toMatchObject({ kind: "card", index: 0 })
    expect(current(lesson, read())).toMatchObject({ kind: "exercise", exercise: { id: "e1" } })
  })

  it("R3: a wrong exercise comes back before the end, any number of times", () => {
    let s = read()
    for (let i = 0; i < 6; i++) s = answer(s, "e1", false).session
    expect(s.queue).toEqual(["e2", "e1"])
    s = answer(s, "e2", true).session
    expect(current(lesson, s)).toMatchObject({ kind: "exercise", exercise: { id: "e1" } })
  })

  it("R3/LRN-10: only the first answer counts as first", () => {
    let s = read()
    const a = answer(s, "e1", false)
    s = a.session
    expect(a.first).toBe(true)
    expect(answer(s, "e1", true).first).toBe(false)
  })

  it("R4: complete only when every exercise is answered correctly", () => {
    let s = read()
    expect(isComplete(lesson, s)).toBe(false)
    s = answer(s, "e1", false).session
    s = answer(s, "e2", true).session
    expect(isComplete(lesson, s)).toBe(false)
    s = answer(s, "e1", true).session
    expect(isComplete(lesson, s)).toBe(true)
    expect(current(lesson, s)).toEqual({ kind: "done" })
    expect(progressOf(lesson, s)).toBe(100)
  })

  it("R4 (error): reading the cards and leaving does not complete", () => {
    expect(isComplete(lesson, read())).toBe(false)
  })

  it("R5: after three hours it simply resumes; after two days it asks", () => {
    const s = answer(read(startSession(lesson, new Date("2026-10-10T08:00:00Z"))), "e1", true, new Date("2026-10-10T08:05:00Z")).session
    expect(needsResumeChoice(s, new Date("2026-10-10T11:05:00Z"))).toBe(false)
    expect(needsResumeChoice(s, new Date("2026-10-12T08:05:00Z"))).toBe(true)
    expect(current(lesson, s)).toMatchObject({ kind: "exercise", exercise: { id: "e2" } })
  })
})

describe("answer checks", () => {
  it("order needs the exact sequence and never starts solved", () => {
    const e = lesson.exercises[0] as Extract<Lesson["exercises"][number], { type: "order" }>
    expect(checkOrder(e, ["a", "b"])).toBe(true)
    expect(checkOrder(e, ["b", "a"])).toBe(false)
    expect(shuffleAway(e.items, e.answer, "e1").map((i) => i.id)).toEqual(["b", "a"])
  })

  it("match accepts pairs in any order", () => {
    const e = { id: "m", type: "match" as const, objectives: [], cards: [], prompt: "", left: [], right: [], answer: [["l1", "r1"], ["l2", "r2"]] as [string, string][] }
    expect(checkMatch(e, [["l2", "r2"], ["l1", "r1"]])).toBe(true)
    expect(checkMatch(e, [["l1", "r2"], ["l2", "r1"]])).toBe(false)
  })
})
