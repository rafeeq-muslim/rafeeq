/**
 * LRN audit gaps on the lesson and the path (2026-10-06):
 * LRN-01 R3/R4/R6, LRN-09 R2, LRN-02 R1/R2/R3/R5, LRN-03 R6 (ordering).
 * The content is a dummy unit; the server's `outline` lists every lesson of
 * the unit, `lessons` the ones live in the learner's language.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { translate, type Key } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { useLearning } from "@/app/stores/learning"
import { useMotivation } from "@/app/stores/motivation"
import { lessonStatus, nextLesson, orderedLessons, unitDone, unitProgress, type Progress } from "@/app/learning/path"
import type { Content, Lesson, Unit } from "@/app/learning/types"

const ar = (k: Key, v?: Record<string, string | number>) => translate("ar", k, v)

function lesson(id: string, unit: string, order: number, title: string, extra: Partial<Lesson> = {}): Lesson {
  return {
    id,
    unit,
    order,
    title,
    approved: true,
    cards: [{ id: `${id}-c1`, kind: "text", text: `نص ${title}` }],
    objectives: [{ id: `${id}-o1`, text: title, label: title, cards: [`${id}-c1`] }],
    exercises: [
      {
        id: `${id}-e1`,
        type: "choose",
        objectives: [`${id}-o1`],
        cards: [`${id}-c1`],
        prompt: `سؤال ${title}`,
        options: [
          { id: "right", text: "الصواب" },
          { id: "wrong", text: "الخطأ" },
        ],
        answer: "right",
      },
    ],
    ...extra,
  }
}

const DAY_ONE = ["أشهد", "قبل الوضوء", "أتوضأ (1)", "أتوضأ (2)", "أتهيأ للصلاة", "أصلي (1)", "أصلي (2)"]

/** Unit 1 has seven lessons; in Tagalog «أصلي (2)» (u1-l7) is not live yet. */
function makeContent(pendingLast: boolean): Content {
  const ids = DAY_ONE.map((_, i) => `u1-l${i + 1}`)
  const lessons: Record<string, Lesson> = {}
  DAY_ONE.forEach((title, i) => (lessons[ids[i]] = lesson(ids[i], "u1", i + 1, title)))
  // «أتوضأ (1)»: a recitation card and an ordering exercise, with the book page kept for the reviewer.
  lessons["u1-l3"] = lesson("u1-l3", "u1", 3, "أتوضأ (1)", {
    source: { page: "63–66", page_ar: "63–66" },
    cards: [
      { id: "u1-l3-c1", kind: "step", text: "النية: محلها القلب" },
      { id: "u1-l3-c2", kind: "text", text: "استمع", audio: ["https://example.test/fatiha.mp3"] },
    ],
    exercises: [
      {
        id: "u1-l3-e1",
        type: "order",
        objectives: ["u1-l3-o1"],
        cards: ["u1-l3-c1"],
        prompt: "رتّب أول خطوات الوضوء",
        items: [
          { id: "niyya", text: "النية" },
          { id: "hands", text: "غسل الكفين" },
        ],
        answer: ["niyya", "hands"],
      },
    ],
  })
  if (pendingLast) delete lessons["u1-l7"]
  const live = ids.filter((id) => lessons[id])
  const units: Unit[] = [
    { id: "u1", order: 1, title: "دليل اليوم الأول", badge_name: "وسام اليوم الأول", source_credit: "من كتاب المختصر المفيد", lessons: live, outline: ids, approved: true },
  ]
  return { lang: "ar", preview: false, units, lessons }
}

let content = makeContent(false)
vi.mock("@/app/learning/useContent", () => ({
  useContent: () => ({ content, isLoading: false, isError: false, refetch: () => undefined, lessons: orderedLessons(content.units, content.lessons), preview: false }),
}))
const events: Record<string, unknown>[] = []
vi.mock("@/app/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/app/lib/api")>()),
  sendEvent: (e: Record<string, unknown>) => events.push(e),
}))
vi.mock("@/app/lib/sync", () => ({ scheduleSync: () => undefined }))
vi.mock("@/app/lib/push", async (orig) => ({ ...(await orig<typeof import("@/app/lib/push")>()), reportLearnedToday: async () => undefined }))
const why = vi.fn()
vi.mock("@/app/lesson/why", () => ({ askWhy: (...a: unknown[]) => why(...a) }))

const { default: LessonPage } = await import("./Lesson")
const { default: Learn } = await import("./Learn")
const { completeLesson } = await import("@/app/learning/complete")

const at = (path: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/learn/lesson/:lessonId" element={<LessonPage />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="*" element={<p>elsewhere</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

const stamp = { first: "2026-10-01T08:00:00Z", last: "2026-10-01T08:00:00Z", times: 1 }
const done = (...n: number[]): Progress["completed"] => Object.fromEntries(n.map((i) => [`u1-l${i}`, stamp]))
const atStep = (lessonId: string, step: number) => ({
  [lessonId]: { lessonId, step, answered: [], firstTried: [], queue: content.lessons[lessonId].exercises.map((e) => e.id), lastAnswerAt: new Date().toISOString() },
})

beforeEach(() => {
  content = makeContent(false)
  events.length = 0
  why.mockReset()
  Element.prototype.scrollIntoView = () => undefined
  useDevice.setState({ locale: "ar", shareEvents: true })
  useLearning.setState({ completed: {}, unlockedUnits: [], mastery: {}, sessions: {}, placementDone: true, landingUnit: null })
  useMotivation.setState({ days: [], badges: {}, pending: [] })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// --- LRN-01 ----------------------------------------------------------------------------
describe("lrn-01-r4 the recitation file did not load", () => {
  it("lrn-01-r4: Joseph sees the card and a message that the audio is unavailable now, never a Latin-letter substitute", () => {
    useLearning.setState({ completed: done(1, 2), sessions: atStep("u1-l3", 1) })
    at("/learn/lesson/u1-l3")
    expect(screen.queryByText(ar("lesson.audioUnavailable"))).toBeNull()
    const audio = document.querySelector("audio")!
    fireEvent.error(audio)
    expect(screen.getByRole("status").textContent).toBe(ar("lesson.audioUnavailable"))
    expect(screen.getByText("استمع", { selector: "p" })).toBeTruthy() // the card text stays
  })

  it("lrn-01-r4: offline from the start, the message shows at once", () => {
    vi.stubGlobal("navigator", { ...navigator, onLine: false })
    useLearning.setState({ completed: done(1, 2), sessions: atStep("u1-l3", 1) })
    at("/learn/lesson/u1-l3")
    expect(screen.getByText(ar("lesson.audioUnavailable"))).toBeTruthy()
  })
})

describe("lrn-01-r3 / lrn-09-r2 no source on the card", () => {
  it("lrn-01-r3: the last card of a lesson shows the book text without the book's name or page", () => {
    useLearning.setState({ completed: done(1, 2), sessions: atStep("u1-l3", 1) })
    at("/learn/lesson/u1-l3")
    expect(document.body.textContent).not.toContain("المختصر المفيد")
    expect(document.body.textContent).not.toContain("63–66")
  })

  it("lrn-01-r3: the unit's source is on the path, once for the unit", () => {
    at("/learn")
    expect(screen.getAllByText("من كتاب المختصر المفيد")).toHaveLength(1)
  })
})

describe("lrn-01-r6 a lesson not yet reviewed in the learner's language", () => {
  beforeEach(() => (content = makeContent(true)))

  it("lrn-01-r6: «أصلي (2)» shows on the path as being prepared in his language, not dropped", () => {
    useLearning.setState({ completed: done(1, 2, 3, 4, 5, 6) })
    at("/learn")
    const node = screen.getByRole("button", { name: `${ar("path.inReview")}، ${ar("path.locked")}` })
    expect((node as HTMLButtonElement).disabled).toBe(true)
    expect(document.getElementById("unit-u1")!.textContent).toContain("6 من 7")
  })

  it("lrn-01-r6: opening it by its link says it is being prepared, with no machine translation", () => {
    at("/learn/lesson/u1-l7")
    expect(screen.getByText(ar("path.inReview"))).toBeTruthy()
    expect(screen.queryByText(ar("lesson.notFound"))).toBeNull()
  })
})

// --- LRN-02 ----------------------------------------------------------------------------
describe("lrn-02-r1 every lesson is done, next or locked", () => {
  it("lrn-02-r1: two lessons done → both done, «أتوضأ (1)» next, four to seven locked, «2 من 7»", () => {
    const p: Progress = { completed: done(1, 2), unlockedUnits: [] }
    const all = orderedLessons(content.units, content.lessons)
    expect(all.slice(0, 2).map((l) => lessonStatus(l, all, p))).toEqual(["done", "done"])
    expect(lessonStatus(all[2], all, p)).toBe("next")
    expect(all.slice(3).map((l) => lessonStatus(l, all, p))).toEqual(["locked", "locked", "locked", "locked"])
    expect(unitProgress(content.units[0], p)).toEqual({ done: 2, total: 7 })
    useLearning.setState({ completed: done(1, 2) })
    at("/learn")
    expect(document.getElementById("unit-u1")!.textContent).toContain("2 من 7")
    expect(screen.getByRole("button", { name: `أتوضأ (1)، ${ar("path.current")}` })).toBeTruthy()
    expect(screen.getByRole("button", { name: `أصلي (2)، ${ar("path.locked")}` })).toBeTruthy()
  })

  it("lrn-02-r1: with only the day-one unit approved, the path names no other unit and says more will come", () => {
    at("/learn")
    expect(screen.getByText(ar("path.more"))).toBeTruthy()
    expect(document.querySelectorAll("[id^='unit-']")).toHaveLength(1)
  })
})

describe("lrn-02-r2 locked lessons and repeats", () => {
  it("lrn-02-r2: «أصلي (1)» opened by its link while the next lesson is «أتوضأ (1)» stays closed and invites to the next lesson", () => {
    useLearning.setState({ completed: done(1, 2) })
    at("/learn/lesson/u1-l6")
    expect(screen.getByText(ar("lesson.locked", { name: "أتوضأ (1)" }))).toBeTruthy()
    expect(screen.queryByText("سؤال أصلي (1)")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: ar("lesson.nextLesson", { name: "أتوضأ (1)" }) }))
    expect(screen.getByRole("heading", { name: "أتوضأ (1)" })).toBeTruthy()
  })

  it("lrn-02-r2: repeating «أشهد» opens it fully, keeps the next step, and the completion is marked as a repeat", () => {
    useLearning.setState({ completed: done(1, 2, 3) })
    const all = orderedLessons(content.units, content.lessons)
    expect(lessonStatus(all[0], all, useLearning.getState())).toBe("done")
    const c = completeLesson(content.lessons["u1-l1"], content)
    expect(c.isRepeat).toBe(true)
    expect(events).toContainEqual({ type: "lesson_completed", lesson_id: "u1-l1", unit_id: "u1", is_repeat: true })
    expect(nextLesson(orderedLessons(content.units, content.lessons), useLearning.getState())?.title).toBe("أتوضأ (2)")
  })
})

describe("lrn-02-r3 / lrn-02-r5 the unit is complete only with all its lessons", () => {
  it("lrn-02-r3: «أصلي (2)» not live in Tagalog: completing «أصلي (1)» does not complete the unit, sends no unit event, gives no badge", () => {
    content = makeContent(true)
    useLearning.setState({ completed: done(1, 2, 3, 4, 5) })
    const c = completeLesson(content.lessons["u1-l6"], content)
    expect(unitDone(content.units[0], useLearning.getState())).toBe(false)
    expect(c.unitCompleted).toBeNull()
    expect(events.filter((e) => e.type === "unit_completed")).toEqual([])
    expect(useMotivation.getState().badges["unit-u1"]).toBeUndefined()
  })

  it("lrn-02-r5: completing «أصلي (2)» after six lessons completes the unit and sends «أتمّ وحدة» once", () => {
    useLearning.setState({ completed: done(1, 2, 3, 4, 5, 6) })
    const first = completeLesson(content.lessons["u1-l7"], content)
    expect(first.unitCompleted).toBe("u1")
    expect(events.filter((e) => e.type === "unit_completed")).toEqual([{ type: "unit_completed", unit_id: "u1" }])
  })

  it("lrn-02-r5: repeating «أصلي (2)» after the unit is complete does not send «أتمّ وحدة» again", () => {
    useLearning.setState({ completed: done(1, 2, 3, 4, 5, 6) })
    completeLesson(content.lessons["u1-l7"], content)
    events.length = 0
    const again = completeLesson(content.lessons["u1-l7"], content)
    expect(again.unitCompleted).toBeNull()
    expect(events.filter((e) => e.type === "unit_completed")).toEqual([])
    expect(events).toContainEqual(expect.objectContaining({ type: "lesson_completed", is_repeat: true }))
  })
})

// --- LRN-03 R6 on an ordering exercise ---------------------------------------------------
describe("lrn-03-r6 «لماذا؟» after a wrong ordering", () => {
  const wrongOrder = () => {
    useLearning.setState({ completed: done(1, 2), sessions: atStep("u1-l3", 2) })
    at("/learn/lesson/u1-l3")
    fireEvent.click(screen.getByRole("button", { name: "غسل الكفين" }))
    fireEvent.click(screen.getByRole("button", { name: "النية" }))
    fireEvent.click(screen.getByRole("button", { name: ar("lesson.check") }))
  }

  it("lrn-03-r3: ordering quotes no card until «لماذا؟» is asked", () => {
    wrongOrder()
    expect(screen.getByText(ar("lesson.incorrectOrder"))).toBeTruthy()
    expect(screen.queryByText(`${ar("lesson.cardText")}:`)).toBeNull()
  })

  it("lrn-03-r6: when «لماذا؟» answers with the card text only (one in five, offline, refused), the card text is shown", async () => {
    why.mockResolvedValue({ text: null, ai: false })
    wrongOrder()
    fireEvent.click(screen.getByRole("button", { name: ar("lesson.why") }))
    const quote = await screen.findByText(`${ar("lesson.cardText")}:`)
    expect(quote.parentElement!.textContent).toContain("النية: محلها القلب")
    expect(within(quote.parentElement!).queryByText(/استمع/)).toBeNull() // only the exercise's card
  })

  it("lrn-03-r6: with an explanation, it sits above and the card text is not repeated for ordering", async () => {
    why.mockResolvedValue({ text: "النية في القلب.", ai: true })
    wrongOrder()
    fireEvent.click(screen.getByRole("button", { name: ar("lesson.why") }))
    expect(await screen.findByText("النية في القلب.")).toBeTruthy()
    expect(screen.queryByText(`${ar("lesson.cardText")}:`)).toBeNull()
  })
})
