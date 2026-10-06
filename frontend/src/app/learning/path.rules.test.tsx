/**
 * LRN-02 R2 after the placement test (issue #9 item 20) and LRN-05 R2/R3
 * (a shorter placement test): the next step comes after the last passed
 * unit everywhere, passed units say so, the first path visit lands on the
 * starting unit; «هذا الأسبوع» asks nothing; at most 6 questions, then
 * «اختبر وحدات أخرى؟»; progress «سؤال 2 من 6 على الأكثر».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { translate, type Key } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { useLearning } from "@/app/stores/learning"
import { buildSummary } from "@/app/ask/guide"
import { lessonStatus, nextLesson, orderedLessons, unitPassed, type Progress } from "./path"
import type { Content, Lesson, Unit } from "./types"

// --- content: five units like the book's path --------------------------------------------
const UNITS: [string, string, string[]][] = [
  ["u01", "دليل اليوم الأول", ["أشهد", "أغتسل", "أتوضأ (1)", "أتوضأ (2)", "أتهيأ للصلاة", "أصلي (1)", "أصلي (2)"]],
  ["u02", "ربي ونبيي وكتابي", ["ربي الله", "نبيي محمد", "كتابي القرآن"]],
  ["u03", "أركان الإسلام", ["الشهادتان", "الصلاة والزكاة"]],
  ["u04", "أركان الإيمان", ["الإيمان بالله", "الإيمان بالملائكة"]],
  ["u05", "أتطهّر", ["الطهارة", "النجاسة"]],
]

function makeContent(): Content {
  const units: Unit[] = []
  const lessons: Record<string, Lesson> = {}
  UNITS.forEach(([id, title, titles], u) => {
    const ids = titles.map((_, i) => `${id}-l${i + 1}`)
    units.push({ id, order: u + 1, title, badge_name: title, source_credit: "", lessons: ids, approved: true })
    titles.forEach((lt, i) => {
      const lid = ids[i]
      lessons[lid] = {
        id: lid,
        unit: id,
        order: i + 1,
        title: lt,
        cards: [{ id: `${lid}-c`, kind: "text", text: lt }],
        objectives: [{ id: `${lid}-o`, text: lt, label: lt, cards: [`${lid}-c`], key: true }],
        exercises: [
          {
            id: `${lid}-e`,
            type: "choose",
            objectives: [`${lid}-o`],
            cards: [`${lid}-c`],
            prompt: `سؤال عن ${lt}`,
            options: [
              { id: "right", text: "الصواب" },
              { id: "wrong", text: "الخطأ" },
            ],
            answer: "right",
          },
        ],
        approved: true,
      }
    })
  })
  return { lang: "ar", preview: false, units, lessons }
}

const content = makeContent()
const lessons = orderedLessons(content.units, content.lessons)
const byTitle = (title: string) => lessons.find((l) => l.title === title)!

vi.mock("@/app/learning/useContent", () => ({
  useContent: () => ({ content, isLoading: false, isError: false, refetch: () => undefined, lessons, preview: false }),
}))
const events: Record<string, unknown>[] = []
vi.mock("@/app/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/app/lib/api")>()),
  sendEvent: (e: Record<string, unknown>) => events.push(e),
}))
vi.mock("@/app/lib/sync", () => ({ scheduleSync: () => undefined }))

const { default: Learn } = await import("@/app/pages/Learn")
const { default: Home } = await import("@/app/pages/Home")
const { default: Placement } = await import("@/app/pages/Placement")
const { LessonDone } = await import("@/app/lesson/LessonDone")

const ar = (k: Key, v?: Record<string, string | number>) => translate("ar", k, v)

const view = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )

let scrolled: string[] = []
beforeEach(() => {
  scrolled = []
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this.id || this.textContent || "")
  }
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })))
  useDevice.setState({ locale: "ar", shareEvents: true })
  useLearning.setState({ completed: {}, unlockedUnits: [], mastery: {}, sessions: {}, placementDone: false, landingUnit: null })
  events.length = 0
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const done = (...titles: string[]): Progress["completed"] =>
  Object.fromEntries(titles.map((t) => [byTitle(t).id, { first: "2026-10-01T00:00:00Z", last: "2026-10-01T00:00:00Z", times: 1 }]))

// --- LRN-02 R2 ---------------------------------------------------------------------------
describe("lrn-02-r2 the next step after the placement test (issue #9 item 20)", () => {
  it("lrn-02-r2: the next step is the first lesson after the last passed unit, not «أشهد»", () => {
    const p: Progress = { completed: {}, unlockedUnits: ["u01", "u02", "u03", "u04"] }
    expect(nextLesson(lessons, p)?.title).toBe("الطهارة")
    expect(lessonStatus(byTitle("الطهارة"), lessons, p)).toBe("next")
    expect(lessonStatus(byTitle("النجاسة"), lessons, p)).toBe("locked")
    for (const t of ["أشهد", "ربي الله", "الإيمان بالملائكة"]) expect(lessonStatus(byTitle(t), lessons, p)).toBe("open")
  })

  it("lrn-02-r2: going back to a passed unit does not change the next step", () => {
    const p: Progress = { completed: done("أشهد"), unlockedUnits: ["u01"] }
    expect(nextLesson(lessons, p)?.title).toBe("ربي الله")
  })

  it("lrn-02-r2: with everything after the passed units completed, the next step is the first lesson not completed anywhere", () => {
    const after = UNITS.slice(1).flatMap(([, , titles]) => titles)
    const p: Progress = { completed: done(...after), unlockedUnits: ["u01"] }
    expect(nextLesson(lessons, p)?.title).toBe("أشهد")
    expect(lessonStatus(byTitle("أشهد"), lessons, p)).toBe("next")
  })

  it("lrn-02-r2: without placement the next step is the first lesson not completed", () => {
    expect(nextLesson(lessons, { completed: {}, unlockedUnits: [] })?.title).toBe("أشهد")
    expect(nextLesson(lessons, { completed: done("أشهد", "أغتسل"), unlockedUnits: [] })?.title).toBe("أتوضأ (1)")
  })

  it("lrn-02-r2: a passed unit reads as passed until all its lessons are completed", () => {
    const u1 = content.units[0]
    expect(unitPassed(u1, { completed: {}, unlockedUnits: ["u01"] })).toBe(true)
    expect(unitPassed(u1, { completed: {}, unlockedUnits: [] })).toBe(false)
    expect(unitPassed(u1, { completed: done(...UNITS[0][2]), unlockedUnits: ["u01"] })).toBe(false)
  })

  it("lrn-02-r2: the guide's next step (LRN-07) is the same lesson", () => {
    const s = buildSummary("ar", lessons, { completed: {}, unlockedUnits: ["u01"], mastery: {} })
    expect(s.next).toEqual({ lesson_id: byTitle("ربي الله").id })
  })

  describe("lrn-02-r2 example: Daniel passed «دليل اليوم الأول» in the placement test and opens the path", () => {
    beforeEach(() => useLearning.setState({ unlockedUnits: ["u01"], placementDone: true, landingUnit: "u02" }))

    it("lands on the second unit, once", () => {
      view(<Learn />)
      expect(scrolled[0]).toBe("unit-u02")
      expect(useLearning.getState().landingUnit).toBeNull()
      cleanup()
      scrolled = []
      view(<Learn />)
      expect(scrolled).not.toContain("unit-u02") // later visits go to the next lesson as before
      expect(scrolled[0]).toContain("ربي الله")
    })

    it("sees «اجتزتها في اختبار تحديد المستوى» on «دليل اليوم الأول» with its seven lessons open", () => {
      view(<Learn />)
      const header = document.getElementById("unit-u01")!
      expect(header.textContent).toContain("اجتزتها في اختبار تحديد المستوى")
      expect(header.textContent).not.toContain("0 من 7")
      for (const t of UNITS[0][2]) expect(screen.getByRole("button", { name: `${t}، ${ar("path.open")}` })).toBeTruthy()
    })

    it("sees «ابدأ» on «ربي الله» and the rest of the second unit locked", () => {
      view(<Learn />)
      const current = screen.getByRole("button", { name: `ربي الله، ${ar("path.current")}` })
      expect(current.getAttribute("aria-current")).toBe("step")
      expect(within(current.closest("li")!).getByText(ar("common.start"))).toBeTruthy()
      expect(screen.getAllByText(ar("common.start"))).toHaveLength(1)
      for (const t of ["نبيي محمد", "كتابي القرآن"]) expect(screen.getByRole("button", { name: `${t}، ${ar("path.locked")}` })).toBeTruthy()
      expect(document.getElementById("unit-u02")!.textContent).toContain("0 من 3")
    })

    it("home says the next lesson is «ربي الله», not «أشهد»", () => {
      view(<Home />)
      expect(screen.getByText("ربي الله")).toBeTruthy()
      expect(screen.queryByText("أشهد")).toBeNull()
      expect(screen.getByText(ar("home.lessonMeta", { i: "1", n: "3" }))).toBeTruthy()
    })

    it("after a lesson in a passed unit, the next step is still «ربي الله»", () => {
      useLearning.setState({ completed: done("أشهد") })
      view(<LessonDone lesson={byTitle("أشهد")} completion={{ isRepeat: false, badges: [], resumedAfterPause: false, unitCompleted: null }} />)
      expect(screen.getByRole("button", { name: ar("lesson.nextLesson", { name: "ربي الله" }) })).toBeTruthy()
    })
  })
})

// --- LRN-05 R2 / R3 on the placement screen ----------------------------------------------
const pick = (key: Key) => fireEvent.click(screen.getByRole("button", { name: ar(key) }))
function answerRight() {
  fireEvent.click(screen.getByRole("radio", { name: "الصواب" }))
  fireEvent.click(screen.getByRole("button", { name: ar("lesson.next") }))
}

describe("lrn-05 a shorter placement test", () => {
  it("lrn-05-r2: Joseph chose «هذا الأسبوع»: no question, he starts at «أشهد», no unit opens", () => {
    view(<Placement />)
    pick("placement.time.week")
    expect(screen.queryByRole("radio")).toBeNull()
    expect(screen.queryByText(/سؤال \d/)).toBeNull()
    expect(screen.getByText(ar("placement.result.none", { lesson: "أشهد" }))).toBeTruthy()
    expect(useLearning.getState().unlockedUnits).toEqual([])
    expect(useLearning.getState().placementDone).toBe(true)
    expect(events.map((e) => e.type)).toEqual(["placement_skipped"]) // as if skipped
  })

  it("lrn-05-r3: Daniel at the second question sees «سؤال 2 من 6 على الأكثر»", () => {
    view(<Placement />)
    pick("placement.time.month")
    expect(screen.getByText("سؤال 1 من 6 على الأكثر")).toBeTruthy()
    answerRight()
    expect(screen.getByText("سؤال 2 من 6 على الأكثر")).toBeTruthy()
    expect(translate("en", "placement.question", { i: "2", n: "6" })).toBe("Question 2 of at most 6")
    expect(translate("tl", "placement.question", { i: "2", n: "6" })).toBe("Tanong 2 sa hanggang 6")
  })

  it("lrn-05-r3: six right answers pass three units and offer «اختبر وحدات أخرى؟»; «لا» starts at «أركان الإيمان»", () => {
    view(<Placement />)
    pick("placement.time.month")
    for (let i = 0; i < 6; i++) answerRight()
    expect(screen.getByText("اختبر وحدات أخرى؟")).toBeTruthy()
    expect(screen.queryByRole("radio")).toBeNull()
    expect(screen.getByText(ar("placement.more.body", { n: "6", unit: "أركان الإيمان" }))).toBeTruthy()
    pick("placement.more.no")
    expect(screen.getByText(ar("placement.result.some", { unit: "أركان الإيمان" }))).toBeTruthy()
    expect(useLearning.getState().unlockedUnits).toEqual(["u01", "u02", "u03"])
    expect(useLearning.getState().landingUnit).toBe("u04")
    expect(events.filter((e) => e.type === "placement_done")).toEqual([expect.objectContaining({ value: 3 })])
  })

  it("lrn-05-r3: «نعم» goes on with the next unit, «سؤال 7 من 12 على الأكثر»", () => {
    view(<Placement />)
    pick("placement.time.month")
    for (let i = 0; i < 6; i++) answerRight()
    pick("placement.more.yes")
    expect(screen.getByText("سؤال عن الإيمان بالله")).toBeTruthy()
    expect(screen.getByText("سؤال 7 من 12 على الأكثر")).toBeTruthy()
  })

  it("lrn-05-r3: the offer reads naturally for each number in Arabic", () => {
    expect(ar("placement.more.body", { n: "6", unit: "س" })).toMatch(/^6 أسئلة أخرى/)
    expect(ar("placement.more.body", { n: "2", unit: "س" })).toMatch(/^سؤالان آخران/)
    expect(ar("placement.more.body", { n: "11", unit: "س" })).toMatch(/^11 سؤالًا آخر/)
    expect(translate("en", "placement.more.body", { n: "1", unit: "x" })).toMatch(/^Up to 1 more question,/)
  })
})
