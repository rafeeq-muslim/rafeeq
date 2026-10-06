/**
 * LRN-07 learning guide (audit 2026-10-06): R2 it suggests and never forces,
 * R5 a returning learner is welcomed (also MOT-02 R4) by the fixed message
 * too, not only the AI one, R6 the summary carries no identity and the
 * message is kept nowhere.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"

import { translate, type Key } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { useLearning } from "@/app/stores/learning"
import { lessonStatus, nextLesson, type Progress } from "@/app/learning/path"
import type { Lesson } from "@/app/learning/types"
import { buildSummary, fixedMessage, GUIDE_MAX_SENTENCES, nextHref, type GuideKey, type Summary } from "./guide"

const calls: { path: string; body: unknown }[] = []
vi.mock("@/app/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/app/lib/api")>()),
  sendEvent: () => undefined,
  api: async (path: string, opts: { body?: unknown } = {}) => {
    calls.push({ path, body: opts.body })
    return { text: null } // outage / checker refused: the fixed message stays
  },
}))
const { GuideNote } = await import("@/app/learning/GuideNote")

const lessonOf = (id: string, order: number, title: string, objectives: [string, string][]): Lesson => ({
  id,
  unit: "u1",
  order,
  title,
  approved: true,
  cards: [],
  objectives: objectives.map(([oid, label]) => ({ id: oid, text: `TEAM_TEXT ${label}`, label, cards: [] })),
  exercises: [],
})
const LESSONS = [
  lessonOf("l1", 1, "أشهد", [["o1", "معنى لا إله إلا الله"], ["o2", "معنى محمد رسول الله"]]),
  lessonOf("l2", 2, "قبل الوضوء", [["o3", "متى يجب الوضوء"]]),
  lessonOf("l3", 3, "أتوضأ (1)", [["o4", "موضع النية"]]),
]
const t = (k: GuideKey, v?: Record<string, string>) => translate("ar", k as Key, v)
const sentences = (s: string) => s.split(/[.!؟?]\s*/).filter((x) => x.trim()).length
const BLAME = /غبت|غيابك|فاتك|انقطعت|أيام|يوم/

beforeEach(() => {
  calls.length = 0
  useDevice.setState({ locale: "ar" })
  vi.stubGlobal("navigator", { ...navigator, onLine: true })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// --- R2 ---------------------------------------------------------------------------------
describe("lrn-07-r2 the guide suggests and never forces", () => {
  it("lrn-07-r2: its step is the path's next lesson (never a locked one) or a review session", () => {
    const p: Progress & { mastery: Record<string, never> } = { completed: { l1: { first: "x", last: "x", times: 1 } }, unlockedUnits: [], mastery: {} }
    const s = buildSummary("ar", LESSONS, p)
    expect(s.next).toEqual({ lesson_id: nextLesson(LESSONS, p)!.id })
    expect(lessonStatus(LESSONS[1], LESSONS, p)).not.toBe("locked")
    expect(nextHref(s)).toBe("/learn/lesson/l2")
    expect(nextHref({ lang: "ar", mastered: [], reviewing: ["o1"], next: { review: true } })).toBe("/learn/review")
  })

  it("lrn-07-r2: after a lesson the guide shows one message, once, with no lock on what the learner opens", () => {
    useLearning.setState({ completed: { l1: { first: "x", last: "x", times: 1 } }, mastery: {}, unlockedUnits: [] })
    render(<GuideNote lessons={LESSONS} objectives={["o1", "o2"]} />)
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1)
    expect(lessonStatus(LESSONS[1], LESSONS, useLearning.getState())).toBe("next")
  })
})

// --- R5 ---------------------------------------------------------------------------------
describe("lrn-07-r5 a returning learner is welcomed, never blamed (MOT-02 R4)", () => {
  const back: Summary = { lang: "ar", mastered: ["o1", "o2"], reviewing: ["o3"], next: { lesson_id: "l3" }, returning: true }

  it("lrn-07-r5: the fixed message welcomes him and suggests one step, without his absence or what he missed", () => {
    const msg = fixedMessage(back, LESSONS, t)
    expect(msg.startsWith(t("ask.guide.welcome"))).toBe(true)
    expect(msg).toContain(t("ask.guide.nextLesson", { step: "أتوضأ (1)" }))
    expect(msg).not.toMatch(BLAME)
    expect(sentences(msg)).toBeLessThanOrEqual(GUIDE_MAX_SENTENCES)
  })

  it("lrn-07-r5: not returning, there is no welcome", () => {
    expect(fixedMessage({ ...back, returning: false }, LESSONS, t)).not.toContain(t("ask.guide.welcome"))
  })

  it("lrn-07-r5: in English and Filipino too", () => {
    expect(fixedMessage({ ...back, lang: "en" }, LESSONS, (k, v) => translate("en", k as Key, v))).toMatch(/^Welcome back\./)
    expect(fixedMessage({ ...back, lang: "tl" }, LESSONS, (k, v) => translate("tl", k as Key, v))).toMatch(/^Maligayang pagbabalik\./)
  })

  it("lrn-07-r5: after his first lesson back, the guide note welcomes him even when the AI wording does not arrive", async () => {
    useLearning.setState({ completed: { l1: { first: "x", last: "x", times: 1 } }, mastery: {}, unlockedUnits: [] })
    render(<GuideNote lessons={LESSONS} objectives={["o1", "o2"]} returning />)
    expect(screen.getByText(new RegExp(`^${t("ask.guide.welcome")}`))).toBeTruthy()
    await waitFor(() => expect(calls).toHaveLength(1))
    expect((calls[0].body as Summary).returning).toBe(true)
  })
})

// --- R6 ---------------------------------------------------------------------------------
describe("lrn-07-r6 the summary and the messages stay with the learner", () => {
  it("lrn-07-r6: the summary sent to the assistant has no identity and no question text", async () => {
    useLearning.setState({ completed: { l1: { first: "x", last: "x", times: 1 } }, mastery: {}, unlockedUnits: [] })
    render(<GuideNote lessons={LESSONS} objectives={["o1", "o2"]} />)
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0].path).toBe("/api/learning/guide")
    expect(Object.keys(calls[0].body as object).sort()).toEqual(["lang", "mastered", "next", "returning", "reviewing"])
  })

  it("lrn-07-r6: the guide message is not stored on the device or sent anywhere a mentor could read", () => {
    localStorage.clear()
    useLearning.setState({ completed: { l1: { first: "x", last: "x", times: 1 } }, mastery: {}, unlockedUnits: [] })
    render(<GuideNote lessons={LESSONS} objectives={["o1", "o2"]} />)
    const shown = document.querySelector("[aria-live]")!.textContent!
    const stored = Object.keys(localStorage).map((k) => localStorage.getItem(k) ?? "").join("\n")
    expect(stored).not.toContain(shown)
    expect(calls.every((c) => c.path === "/api/learning/guide")).toBe(true)
  })
})
