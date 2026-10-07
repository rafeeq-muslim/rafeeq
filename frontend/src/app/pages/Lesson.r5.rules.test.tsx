/**
 * LRN-03 R5, «العودة من المساعدة» (docs/domains/learning/features/
 * LRN-03-short-lesson-and-exercises.md, learning owner's decision 2026-10-07):
 * leaving a lesson for the assistant or for «أريد إنسانًا» (CMP-01) and coming
 * back lands on the same card or exercise, with the choice not yet checked
 * and the exercises still to do; «ارجع إلى الدرس» shows in the assistant and
 * in the human request whenever the learner came from a lesson.
 *
 * Which lesson to return to and the unchecked choice stay in the device's
 * memory (lesson/helpReturn.ts): never in the URL, the route state, the
 * assistant's question or the help request (CMP-01 R1).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router"

import { translate, type Key } from "@/app/i18n"
import { lessonHelpState } from "@/app/ask/lessonHelp"
import { useAsk } from "@/app/ask/store"
import { flushEvents } from "@/app/lib/api"
import type { AskResponse } from "@/app/ask/types"
import { useCompanion } from "@/app/companion/store"
import { dropLessonHelpReturn, heldDraft, lessonReturnPath } from "@/app/lesson/helpReturn"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { useLearning } from "@/app/stores/learning"
import type { Content } from "@/app/learning/types"

const WUDU = "أتوضأ (1)"
const LESSON = "u1-l3"
const QUESTION = "هل يجب الوضوء لكل صلاة؟"
const CARD_2 = "نص بطاقة غسل الكفين"
const PROMPT_2 = "سؤال التمرين الثاني"
const PROMPT_3 = "سؤال التمرين الثالث"
const CHOSEN = "اختيار جوزيف في التمرين الثاني"
const RIGHT_2 = "صواب التمرين الثاني"

const choose = (n: number, prompt: string, right: string, other: string) => ({
  id: `EXERCISE_${n}`,
  type: "choose",
  prompt,
  objectives: ["o1"],
  cards: ["c1"],
  options: [
    { id: "a", text: right },
    { id: "b", text: other },
  ],
  answer: "a",
})

const content = {
  lang: "ar",
  preview: false,
  units: [{ id: "u1", order: 1, title: "دليل اليوم الأول", lessons: [LESSON] }],
  lessons: {
    [LESSON]: {
      id: LESSON,
      unit: "u1",
      order: 3,
      title: WUDU,
      approved: true,
      cards: [
        { id: "c1", text: "نص بطاقة النية" },
        { id: "c2", text: CARD_2 },
      ],
      objectives: [{ id: "o1", text: "O1", cards: ["c1", "c2"] }],
      exercises: [
        choose(1, "سؤال التمرين الأول", "صواب التمرين الأول", "خطأ التمرين الأول"),
        choose(2, PROMPT_2, RIGHT_2, CHOSEN),
        choose(3, PROMPT_3, "صواب التمرين الثالث", "خطأ التمرين الثالث"),
      ],
    },
  },
} as unknown as Content

vi.mock("@/app/learning/useContent", () => ({
  useContent: () => ({ content, isLoading: false, isError: false, refetch: () => undefined, lessons: Object.values(content.lessons), preview: true }),
}))

const { default: LessonPage } = await import("./Lesson")
const { default: Review } = await import("./Review")
const { default: Ask } = await import("./Ask")
const { default: HelpScreen } = await import("@/app/companion/HelpScreen")

const ar = (k: Key, v?: Record<string, string | number>) => translate("ar", k, v)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const noSource: AskResponse = {
  ask_id: "a1",
  outcome: "no_source",
  reason_code: "retrieval_empty",
  retryable: false,
  route: "general",
  level: "A",
  answer: "",
  sources: [],
  notes: [],
  should_escalate: false,
  handoff: null,
  objective_id: null,
  lang: "ar",
}

const createdRequest = {
  request: {
    id: "r1",
    kind: "human",
    topic: null,
    source: "lesson",
    status: "open",
    created_at: "2026-10-07T10:00:00Z",
    last_activity_at: "2026-10-07T10:00:00Z",
    unread: 0,
    preview: null,
    responder_name: null,
    gender: "m",
    awaiting_same_gender: false,
  },
  guest_token: "g".repeat(43),
}

type Call = { url: string; method: string; body: Record<string, unknown> | undefined }
let calls: Call[] = []

function stubFetch() {
  calls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      const method = init?.method ?? "GET"
      calls.push({ url, method, body })
      if (url === "/api/ask") return json(noSource)
      if (url === "/api/events") return json({ ok: true })
      if (url === "/api/help/requests") return method === "POST" ? json(createdRequest, 201) : json([])
      return json({ detail: "not found" }, 404)
    }),
  )
}

/** Where the app is, with everything the route carries, and the browser's own back. */
function Where() {
  const l = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <output data-testid="where" data-path={l.pathname} data-search={l.search} data-state={JSON.stringify(l.state ?? null)} />
      <button type="button" data-testid="browser-back" onClick={() => navigate(-1)} />
    </>
  )
}
const where = () => {
  const el = screen.getByTestId("where")
  return { path: el.dataset.path, search: el.dataset.search, state: JSON.parse(el.dataset.state ?? "null") as unknown }
}

function app(entry: Parameters<typeof MemoryRouter>[0]["initialEntries"]) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={entry}>
        <Where />
        <Routes>
          <Route path="/learn/lesson/:lessonId" element={<LessonPage />} />
          <Route path="/learn/review" element={<Review />} />
          <Route path="/ask" element={<Ask />} />
          <Route path="/mentor/help" element={<HelpScreen />} />
          <Route path="*" element={<p>elsewhere</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const settle = () => act(async () => await new Promise((r) => setTimeout(r, 0)))
const helpButton = () => screen.getByRole("button", { name: ar("lesson.help") })
const backToLesson = () => screen.getByRole("button", { name: "ارجع إلى الدرس" })
const noBackToLesson = () => expect(screen.queryByRole("button", { name: "ارجع إلى الدرس" })).toBeNull()
const topBarHuman = () => within(document.querySelector("[data-slot=top-bar]") ?? document.body).getAllByRole("button", { name: ar("ask.human") })[0]
const checkButton = () => screen.getByRole("button", { name: ar("lesson.check") }) as HTMLButtonElement
const chosen = () => screen.getByRole("radio", { name: CHOSEN })
const session = () => useLearning.getState().sessions[LESSON]

const saveSession = (over: Record<string, unknown>) =>
  useLearning.setState({
    sessions: {
      [LESSON]: {
        lessonId: LESSON,
        step: 2,
        answered: [],
        firstTried: [],
        queue: ["EXERCISE_1", "EXERCISE_2", "EXERCISE_3"],
        lastAnswerAt: new Date().toISOString(),
        ...over,
      },
    },
  } as never)

/** بافتراض أن جوزيف قرأ البطاقات وحلّ تمرينًا واحدًا: he is on exercise 2, nothing chosen yet. */
function readCardsAndSolvedOne() {
  saveSession({})
  app([`/learn/lesson/${LESSON}`])
  fireEvent.click(screen.getByRole("radio", { name: "صواب التمرين الأول" }))
  fireEvent.click(checkButton())
  fireEvent.click(screen.getByRole("button", { name: ar("common.continue") }))
  expect(screen.getByText(PROMPT_2)).toBeTruthy()
}

/** Exercise 2 exactly as he left it: his choice still selected, not checked, and the rest still to do. */
function expectExercise2AsLeft() {
  expect(where().path).toBe(`/learn/lesson/${LESSON}`)
  expect(screen.getByText(PROMPT_2)).toBeTruthy()
  expect(screen.queryByText(PROMPT_3)).toBeNull()
  expect(screen.queryByText("نص بطاقة النية")).toBeNull() // not from the start of the lesson
  expect(chosen().getAttribute("aria-checked")).toBe("true") // the choice is kept
  expect(screen.getByRole("radio", { name: RIGHT_2 }).getAttribute("aria-checked")).toBe("false")
  // …and not yet checked: «تحقّق» is waiting, no result is on screen, nothing was recorded.
  expect(checkButton().disabled).toBe(false)
  expect(screen.queryByRole("button", { name: ar("common.continue") })).toBeNull()
  expect(session().firstTried).toEqual(["EXERCISE_1"])
  expect(session().answered).toEqual(["EXERCISE_1"])
  expect(session().queue).toEqual(["EXERCISE_2", "EXERCISE_3"]) // what is left of the exercises, unchanged
}

async function ask(question: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: question } })
  fireEvent.click(screen.getByRole("button", { name: ar("ask.send") }))
  await settle()
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  dropLessonHelpReturn()
  useAsk.getState().reset()
  useDevice.getState().set({ locale: "ar", askConsent: false })
  useAuth.getState().set({ token: null, me: null, ready: true })
  useCompanion.getState().set({ helpToken: null, helpGender: "m" })
  useLearning.setState({ completed: {}, unlockedUnits: [], mastery: {}, sessions: {}, placementDone: true, landingUnit: null } as never)
  stubFetch()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe("lrn-03 r5: back from help, at the very point the lesson was left", () => {
  it("lrn03_r5_ex1_help_on_exercise_2_then_back_to_the_lesson_resumes_exercise_2_with_the_choice_kept", async () => {
    // بافتراض أن جوزيف قرأ البطاقات وحلّ تمرينًا واحدًا، ثم ضغط زر المساعدة في التمرين الثاني فسأل المساعد
    readCardsAndSolvedOne()
    fireEvent.click(chosen())
    fireEvent.click(helpButton())
    expect(where().path).toBe("/ask")
    await ask(QUESTION)

    // عندما يضغط «ارجع إلى الدرس»
    fireEvent.click(backToLesson())

    // فإنه يكمل من التمرين الثاني نفسه، لا من أول الدرس
    expectExercise2AsLeft()

    // The lesson goes on from there: his answer is checked only now, and exercise 3 follows.
    fireEvent.click(checkButton())
    expect(session().firstTried).toEqual(["EXERCISE_1", "EXERCISE_2"])
    expect(session().queue).toEqual(["EXERCISE_3", "EXERCISE_2"]) // LRN-03 R3: the wrong one comes back before the end
    fireEvent.click(screen.getByRole("button", { name: ar("common.continue") }))
    expect(screen.getByText(PROMPT_3)).toBeTruthy()
    expect(screen.getAllByRole("radio").every((r) => r.getAttribute("aria-checked") === "false")).toBe(true) // a new exercise starts empty
  })

  it("lrn03_r5_ex1_help_on_exercise_2_then_back_from_the_human_request_resumes_exercise_2_with_the_choice_kept", async () => {
    // lesson → assistant → «أريد إنسانًا» → «ارجع إلى الدرس»
    readCardsAndSolvedOne()
    fireEvent.click(chosen())
    fireEvent.click(helpButton())
    await ask(QUESTION)
    fireEvent.click(topBarHuman())
    expect(where().path).toBe("/mentor/help")
    expect(where().search).toBe("?from=lesson") // the request's URL knows the origin only

    fireEvent.click(backToLesson())
    expectExercise2AsLeft()
  })

  it("lrn03_r5_ex1_the_browsers_own_back_from_the_assistant_resumes_exercise_2_with_the_choice_kept", () => {
    readCardsAndSolvedOne()
    fireEvent.click(chosen())
    fireEvent.click(helpButton())
    expect(where().path).toBe("/ask")
    fireEvent.click(screen.getByTestId("browser-back"))
    expectExercise2AsLeft()
  })

  it("lrn03_r5_ex1_back_after_three_hours_resumes_exercise_2_without_asking", () => {
    // (أو يعود بعد ثلاث ساعات من عمله): the saved session alone, no help involved
    saveSession({
      answered: ["EXERCISE_1"],
      firstTried: ["EXERCISE_1"],
      queue: ["EXERCISE_2", "EXERCISE_3"],
      lastAnswerAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    })
    app([`/learn/lesson/${LESSON}`])
    expect(screen.getByText(PROMPT_2)).toBeTruthy()
    expect(screen.queryByText(ar("lesson.resumeTitle"))).toBeNull()
    expect(session().queue).toEqual(["EXERCISE_2", "EXERCISE_3"])
  })

  it("lrn03_r5_help_on_a_card_then_back_lands_on_the_same_card", () => {
    saveSession({ step: 1 })
    app([`/learn/lesson/${LESSON}`])
    expect(screen.getByText(CARD_2)).toBeTruthy()
    fireEvent.click(helpButton())
    fireEvent.click(backToLesson())
    expect(where().path).toBe(`/learn/lesson/${LESSON}`)
    expect(screen.getByText(CARD_2)).toBeTruthy() // the second card, not the first
    expect(screen.queryByText("نص بطاقة النية")).toBeNull()
    expect(session().step).toBe(1)
  })

  it("lrn03_r5_help_after_a_checked_answer_then_back_shows_the_same_exercise_and_its_result", () => {
    readCardsAndSolvedOne()
    fireEvent.click(chosen())
    fireEvent.click(checkButton()) // wrong, checked: the result panel is up
    expect(screen.getByText(ar("lesson.incorrect"))).toBeTruthy()
    fireEvent.click(helpButton())
    fireEvent.click(backToLesson())

    expect(screen.getByText(PROMPT_2)).toBeTruthy() // the same exercise, not the next one
    expect(screen.getByText(ar("lesson.incorrect"))).toBeTruthy()
    expect(chosen().getAttribute("aria-checked")).toBe("true")
    expect(session().queue).toEqual(["EXERCISE_3", "EXERCISE_2"]) // recorded once, before he left
    fireEvent.click(screen.getByRole("button", { name: ar("common.continue") }))
    expect(screen.getByText(PROMPT_3)).toBeTruthy()
  })

  it("lrn03_r5_ex2_two_days_later_the_lesson_asks_and_an_old_choice_is_not_brought_back", () => {
    // مثال 2: مرّ يومان على آخر إجابة → يُسأل: يكمل أو يبدأ من أوله
    readCardsAndSolvedOne()
    fireEvent.click(chosen())
    fireEvent.click(helpButton())
    saveSession({
      answered: ["EXERCISE_1"],
      firstTried: ["EXERCISE_1"],
      queue: ["EXERCISE_2", "EXERCISE_3"],
      lastAnswerAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    })
    fireEvent.click(backToLesson())
    expect(screen.getByText(ar("lesson.resumeTitle"))).toBeTruthy()
    expect(screen.getByRole("button", { name: ar("lesson.resume") })).toBeTruthy()
    expect(screen.getByRole("button", { name: ar("lesson.restart") })).toBeTruthy()
    expect(heldDraft(LESSON)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: ar("lesson.resume") }))
    expect(screen.getByText(PROMPT_2)).toBeTruthy()
    expect(chosen().getAttribute("aria-checked")).toBe("false")
  })
})

describe("lrn-03 r5: the lesson works without a connection once started", () => {
  it("lrn03_r5_ex3_offline_the_lesson_completes_and_its_completion_is_sent_when_the_connection_returns", async () => {
    // بافتراض أن الاتصال انقطع وجوزيف في منتصف «أتوضأ (1)»
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    useDevice.getState().set({ shareEvents: true })
    saveSession({ answered: ["EXERCISE_1", "EXERCISE_2"], firstTried: ["EXERCISE_1", "EXERCISE_2"], queue: ["EXERCISE_3"] })
    app([`/learn/lesson/${LESSON}`])

    // عندما يكمل التمارين
    fireEvent.click(screen.getByRole("radio", { name: "صواب التمرين الثالث" }))
    fireEvent.click(checkButton())
    fireEvent.click(screen.getByRole("button", { name: ar("common.continue") }))
    await settle()

    // فإنه يتمّ الدرس كاملًا
    expect(useLearning.getState().completed[LESSON]).toBeTruthy()
    expect(session()).toBeUndefined()
    expect(calls.filter((c) => c.url === "/api/events")).toHaveLength(0) // nothing could be sent yet

    // ويُرسل إتمامه متى عاد الاتصال
    online.mockReturnValue(true)
    await flushEvents()
    const events = calls.filter((c) => c.url === "/api/events").flatMap((c) => (c.body as { events: { type: string; lesson_id?: string }[] }).events)
    expect(events.filter((e) => e.type === "lesson_completed").map((e) => e.lesson_id)).toEqual([LESSON])
    online.mockRestore()
  })
})

describe("lrn-03 r5: «ارجع إلى الدرس» shows whenever the learner came from a lesson", () => {
  it("lrn03_r5_back_to_the_lesson_is_shown_in_the_assistant_when_coming_from_a_lesson", async () => {
    readCardsAndSolvedOne()
    fireEvent.click(helpButton())
    expect(within(document.querySelector("[data-slot=lesson-topic]") as HTMLElement).getByRole("button", { name: "ارجع إلى الدرس" })).toBeTruthy()
    await ask(QUESTION)
    expect(backToLesson()).toBeTruthy() // still there with an answer on screen
  })

  it("lrn03_r5_back_to_the_lesson_is_shown_in_the_human_request_when_coming_from_a_lesson", () => {
    readCardsAndSolvedOne()
    fireEvent.click(helpButton())
    fireEvent.click(topBarHuman())
    expect(where().path).toBe("/mentor/help")
    expect(backToLesson()).toBeTruthy()
    expect(screen.getByLabelText(ar("cmp.help.message"))).toBeTruthy() // beside the request form, which stays as it was
  })

  it("lrn03_r5_back_to_the_lesson_is_absent_when_the_assistant_is_opened_from_its_tab", async () => {
    app(["/ask"])
    noBackToLesson()
    await ask(QUESTION)
    noBackToLesson()
    fireEvent.click(topBarHuman())
    expect(where().search).toBe("?from=ask")
    noBackToLesson()
  })

  it("lrn03_r5_back_to_the_lesson_is_absent_in_a_human_request_not_made_from_a_lesson", () => {
    for (const from of ["ask", "home", "mentor", "review"]) {
      app([`/mentor/help?from=${from}`])
      expect(screen.getByLabelText(ar("cmp.help.message"))).toBeTruthy()
      noBackToLesson()
      cleanup()
    }
  })

  it("lrn03_r5_a_review_keeps_its_own_way_back_and_never_says_lesson", () => {
    app([{ pathname: "/ask", state: lessonHelpState("review", WUDU) }])
    expect(screen.getByRole("button", { name: ar("ask.review.back") })).toBeTruthy()
    noBackToLesson()
  })

  it("lrn03_r5_back_to_the_lesson_still_leads_somewhere_when_the_device_forgot_which_lesson", () => {
    // After a reload the memory is empty: the request opens the path, where the lesson is the next step.
    app(["/learn", "/mentor/help?from=lesson"])
    fireEvent.click(backToLesson())
    expect(where().path).toBe("/learn")
  })
})

describe("lrn-03 r5: what is kept for the return stays on the device, and only as long as needed", () => {
  it("lrn03_r5_the_route_and_the_assistant_carry_ids_of_the_screen_only_never_the_choice_or_progress", async () => {
    readCardsAndSolvedOne()
    fireEvent.click(chosen())
    fireEvent.click(helpButton())
    const at = where()
    expect(at.search).toBe("")
    // CMP-01 R1 (owner's decision 2026-10-07): origin, topic and the ids of what is on screen; exactly this.
    expect(at.state).toEqual({ lessonHelp: { from: "lesson", topic: WUDU, context: { lesson_id: LESSON, exercise_id: "EXERCISE_2" } } })
    await ask(QUESTION)
    const bodies = calls.filter((c) => c.url === "/api/ask").map((c) => c.body)
    expect(bodies[0]?.context).toEqual({ lesson_id: LESSON, exercise_id: "EXERCISE_2" }) // ids only
    const sent = JSON.stringify(bodies)
    // What is held for the return (the choice, its result, the progress) and every text of the lesson stay on the device.
    for (const secret of [CHOSEN, RIGHT_2, PROMPT_2, WUDU, "EXERCISE_1", "firstTried", "answered"]) expect(sent).not.toContain(secret)
  })

  it("lrn03_r5_cmp01_r1_ex2_the_help_request_still_carries_no_lesson_name_or_answer", async () => {
    readCardsAndSolvedOne()
    fireEvent.click(chosen())
    fireEvent.click(helpButton())
    await ask(QUESTION)
    fireEvent.click(topBarHuman())
    expect(where().search).toBe("?from=lesson")
    expect(where().state).toBeNull()
    fireEvent.change(screen.getByLabelText(ar("cmp.help.message")), { target: { value: "أحتاج من يشرح لي" } })
    fireEvent.click(screen.getByRole("button", { name: ar("human.send") }))
    await waitFor(() => expect(calls.filter((c) => c.url === "/api/help/requests" && c.method === "POST")).toHaveLength(1))

    const post = calls.find((c) => c.url === "/api/help/requests" && c.method === "POST")!
    expect(post.body!.source).toBe("lesson")
    expect(post.body!.body).toBe("أحتاج من يشرح لي")
    const wire = JSON.stringify(calls) // every URL and body sent while he was away from the lesson
    for (const secret of [CHOSEN, RIGHT_2, PROMPT_2, WUDU]) expect(wire).not.toContain(secret)
    // CMP-01 R1 (2026-10-07): the ids of the screen go to the assistant only; the human request has none of them.
    const toHuman = JSON.stringify(calls.filter((c) => c.url !== "/api/ask" && c.url !== "/api/events"))
    for (const id of ["EXERCISE_2", LESSON]) expect(toHuman).not.toContain(id)
  })

  it("lrn03_r5_nothing_is_written_to_storage_for_the_return", () => {
    readCardsAndSolvedOne()
    fireEvent.click(chosen())
    fireEvent.click(helpButton())
    expect(heldDraft(LESSON)).toEqual({ exerciseId: "EXERCISE_2", value: "b", round: 1, result: null }) // in memory
    const stored = (s: Storage) => Array.from({ length: s.length }, (_, i) => s.getItem(s.key(i)!) ?? "").join("\n")
    // The saved lesson session (which exercise he is on) is the only trace; the choice is in neither storage.
    for (const store of [localStorage, sessionStorage]) {
      expect(stored(store)).not.toContain(CHOSEN)
      expect(stored(store)).not.toContain('"value"')
      expect(stored(store)).not.toContain("exerciseId")
    }
  })

  it("lrn03_r5_the_kept_choice_is_dropped_once_the_lesson_is_open_again", () => {
    readCardsAndSolvedOne()
    fireEvent.click(chosen())
    fireEvent.click(helpButton())
    expect(lessonReturnPath()).toBe(`/learn/lesson/${LESSON}`)
    fireEvent.click(backToLesson())
    expectExercise2AsLeft()
    expect(lessonReturnPath()).toBeNull()
    expect(heldDraft(LESSON)).toBeNull()
  })

  it("lrn03_r5_the_kept_choice_is_dropped_when_the_assistant_is_opened_from_its_tab", () => {
    readCardsAndSolvedOne()
    fireEvent.click(chosen())
    fireEvent.click(helpButton())
    expect(heldDraft(LESSON)).not.toBeNull()
    cleanup()
    app(["/ask"]) // later, from the tab bar: no lesson behind it
    expect(heldDraft(LESSON)).toBeNull()
    expect(lessonReturnPath()).toBeNull()
  })
})
