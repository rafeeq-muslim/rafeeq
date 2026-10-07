/**
 * CMP-01 R1 (docs/domains/companion/features/CMP-01-human-help-and-danger.md,
 * owner's decision 2026-10-07): in a lesson and a review the help button
 * opens the sourced assistant with the lesson's topic alone; with no sourced
 * answer or a personal matter the assistant asks «تحتاج إنسانًا؟» and one tap
 * opens the request; «أريد إنسانًا» is always visible in the assistant; danger
 * goes to a human at once. The request says only where the learner came from.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes, useLocation } from "react-router"

import { translate, type Key } from "@/app/i18n"
import { lessonHelpState, readLessonHelp } from "@/app/ask/lessonHelp"
import { useAsk } from "@/app/ask/store"
import type { AskResponse } from "@/app/ask/types"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { useLearning } from "@/app/stores/learning"
import type { Content } from "@/app/learning/types"
import { useCompanion } from "./store"

const WUDU = "أتوضأ (1)"
const QUESTION = "هل يجب الوضوء لكل صلاة؟"
const CHOSEN = "اختيار جوزيف في التمرين"

const content = {
  lang: "ar",
  preview: false,
  units: [{ id: "u1", order: 1, title: "دليل اليوم الأول", lessons: ["u1-l3"] }],
  lessons: {
    "u1-l3": {
      id: "u1-l3",
      unit: "u1",
      order: 3,
      title: WUDU,
      approved: true,
      cards: [{ id: "c1", text: "نص بطاقة الوضوء" }],
      objectives: [{ id: "o1", text: "O1", cards: ["c1"] }],
      exercises: [
        {
          id: "EXERCISE_1",
          type: "choose",
          prompt: "سؤال تمرين الوضوء",
          objectives: ["o1"],
          cards: ["c1"],
          options: [
            { id: "a", text: "الجواب الصحيح" },
            { id: "b", text: CHOSEN },
          ],
          answer: "a",
        },
      ],
    },
  },
} as unknown as Content

vi.mock("@/app/learning/useContent", () => ({
  useContent: () => ({ content, isLoading: false, isError: false, refetch: () => undefined, lessons: Object.values(content.lessons), preview: true }),
}))

const { default: LessonPage } = await import("@/app/pages/Lesson")
const { default: Review } = await import("@/app/pages/Review")
const { default: Ask } = await import("@/app/pages/Ask")
const { default: HelpScreen } = await import("./HelpScreen")

const ar = (k: Key, v?: Record<string, string | number>) => translate("ar", k, v)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const base: AskResponse = {
  ask_id: "a1",
  outcome: "answered",
  reason_code: null,
  retryable: false,
  route: "general",
  level: "A",
  answer: "TEST_ANSWER_TEXT",
  sources: [],
  notes: [],
  should_escalate: false,
  handoff: null,
  objective_id: null,
  lang: "ar",
}
const noSource: AskResponse = { ...base, outcome: "no_source", reason_code: "retrieval_empty", answer: "" }

const createdRequest = {
  request: {
    id: "r1",
    kind: "escalation",
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
let askReply: () => Response | Promise<Response> = () => json(base)

function stubFetch() {
  calls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      const method = init?.method ?? "GET"
      calls.push({ url, method, body })
      if (url === "/api/ask") return askReply()
      if (url === "/api/help/requests") return method === "POST" ? json(createdRequest, 201) : json([])
      return json({ detail: "not found" }, 404)
    }),
  )
}
const sent = (url: string) => calls.filter((c) => c.url === url && c.method === "POST").map((c) => c.body!)

/** Where the app is, with everything the route carries (path, query and state). */
function Where() {
  const l = useLocation()
  return <output data-testid="where" data-path={l.pathname} data-search={l.search} data-state={JSON.stringify(l.state ?? null)} />
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
const topBarHuman = () => within(document.querySelector("[data-slot=top-bar]") ?? document.body).getAllByRole("button", { name: ar("ask.human") })[0]
const fromLesson = { pathname: "/ask", state: lessonHelpState("lesson", WUDU) }

async function ask(question: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: question } })
  fireEvent.click(screen.getByRole("button", { name: ar("ask.send") }))
  await settle()
}

/** The card that asks «تحتاج إنسانًا؟»; its single button opens the request. */
async function needHumanCard() {
  const asked = await screen.findByText(ar("ask.needHuman"))
  return asked.closest("[data-slot=referral-card]") as HTMLElement
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  useAsk.getState().reset()
  useDevice.getState().set({ locale: "ar", askConsent: false })
  useAuth.getState().set({ token: null, me: null, ready: true })
  useCompanion.getState().set({ helpToken: null, helpGender: "m" })
  useLearning.setState({ completed: {}, unlockedUnits: [], mastery: {}, sessions: {}, placementDone: true, landingUnit: null } as never)
  askReply = () => json(base)
  stubFetch()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

const atExercise = () =>
  useLearning.setState({
    sessions: { "u1-l3": { lessonId: "u1-l3", step: 1, answered: [], firstTried: [], queue: ["EXERCISE_1"], lastAnswerAt: new Date().toISOString() } },
  } as never)

const reviewDue = () => {
  const hourAgo = new Date(Date.now() - 2 * 3_600_000).toISOString()
  useLearning.setState({
    completed: { "u1-l3": { first: hourAgo, last: hourAgo, times: 1 } },
    mastery: { o1: { p: 0.4, seen: true, answered: true, lastAnswerAt: hourAgo, checksDone: 0 } },
  } as never)
}

describe("cmp-01 r1: the lesson's help opens the assistant first", () => {
  it("cmp01_r1_ex1_wudu_1_no_sourced_answer_asks_need_human_and_opens_the_request_in_one_tap", async () => {
    // بافتراض أن جوزيف في درس «أتوضأ (1)» وضغط زر المساعدة
    app(["/learn/lesson/u1-l3"])
    fireEvent.click(helpButton())
    expect(where().path).toBe("/ask")
    expect(screen.getByText(ar("ask.disclosure"))).toBeTruthy() // the assistant, not the request form
    expect(document.querySelector("[data-slot=lesson-topic]")?.textContent).toContain(WUDU)

    // عندما يسأل «هل يجب الوضوء لكل صلاة؟» ولا يجد المساعد جوابًا بمصدر
    askReply = () => json(noSource)
    await ask(QUESTION)

    // فإنه يرى «تحتاج إنسانًا؟» ويفتح الطلب بضغطة
    const card = await needHumanCard()
    const buttons = within(card).getAllByRole("button")
    expect(buttons).toHaveLength(1)
    fireEvent.click(buttons[0])
    expect(where().path).toBe("/mentor/help")
    expect(where().search).toBe("?kind=escalation&from=lesson&ask=a1")
    expect(screen.getByLabelText(ar("cmp.help.message"))).toBeTruthy() // the request is open
  })

  it("cmp01_r1_lesson_help_carries_the_topic_and_ids_only_never_the_learners_answers", async () => {
    atExercise()
    app(["/learn/lesson/u1-l3"])
    // Joseph answers the exercise (wrongly) before asking for help.
    fireEvent.click(screen.getByRole("radio", { name: CHOSEN }))
    fireEvent.click(screen.getByRole("button", { name: ar("lesson.check") }))
    expect(useLearning.getState().sessions["u1-l3"].firstTried).toContain("EXERCISE_1") // the answer exists on the device

    fireEvent.click(helpButton())
    const at = where()
    expect(at.path).toBe("/ask")
    expect(at.search).toBe("") // nothing in the URL
    // exactly this, nothing else: origin, topic, and (2026-10-07) the ids of what is on screen
    expect(at.state).toEqual({ lessonHelp: { from: "lesson", topic: WUDU, context: { lesson_id: "u1-l3", exercise_id: "EXERCISE_1" } } })

    askReply = () => json(noSource)
    await ask(QUESTION)
    const bodies = sent("/api/ask")
    expect(bodies).toHaveLength(1)
    expect(bodies[0].question).toBe(QUESTION)
    // The assistant receives the typed question and the ids of the screen; the server loads the approved text itself.
    expect(Object.keys(bodies[0]).sort()).toEqual(["client_request_id", "consent_objectives", "context", "entrypoint", "lang", "question"])
    expect(bodies[0].context).toEqual({ lesson_id: "u1-l3", exercise_id: "EXERCISE_1" })
    const toAssistant = JSON.stringify(bodies)
    // Never his answer, whether it was right, his progress, or any text of the lesson.
    for (const secret of [CHOSEN, "الجواب الصحيح", "سؤال تمرين الوضوء", WUDU, "firstTried", "answered", "incorrect"]) expect(toAssistant).not.toContain(secret)
  })

  it("cmp01_r1_hand_over_keeps_only_origin_topic_and_ids", () => {
    const dirty = { lessonHelp: { from: "lesson", topic: WUDU, answers: ["b"], exerciseId: "EXERCISE_1" }, other: 1 }
    expect(readLessonHelp(dirty)).toEqual({ from: "lesson", topic: WUDU })
    const withContext = { lessonHelp: { from: "lesson", topic: WUDU, context: { lesson_id: "u1-l3", exercise_id: "EXERCISE_1", answer: "b", correct: false } } }
    expect(readLessonHelp(withContext)).toEqual({ from: "lesson", topic: WUDU, context: { lesson_id: "u1-l3", exercise_id: "EXERCISE_1" } })
    expect(readLessonHelp({ lessonHelp: { from: "lesson", topic: WUDU, context: { lesson_id: "نص يكتبه العميل" } } })).toEqual({ from: "lesson", topic: WUDU })
    expect(readLessonHelp({ lessonHelp: { from: "home", topic: WUDU } })).toBeNull()
    expect(readLessonHelp({ lessonHelp: { from: "lesson", topic: 7 } })).toBeNull()
    expect(readLessonHelp(null)).toBeNull()
  })

  it("cmp01_r1_review_help_opens_the_assistant_with_the_lesson_topic_and_ids_only", () => {
    reviewDue()
    app(["/learn/review"])
    expect(screen.getByText("سؤال تمرين الوضوء")).toBeTruthy()
    fireEvent.click(screen.getByRole("radio", { name: CHOSEN }))
    fireEvent.click(helpButton())
    expect(where().path).toBe("/ask")
    expect(where().state).toEqual({ lessonHelp: { from: "review", topic: WUDU, context: { lesson_id: "u1-l3", exercise_id: "EXERCISE_1" } } })
    expect(document.querySelector("[data-slot=lesson-topic]")?.textContent).toContain(WUDU)
    fireEvent.click(topBarHuman())
    expect(where().search).toBe("?from=review")
  })

  it("cmp01_r1_help_button_stays_reachable_and_named_below_380px", () => {
    app(["/learn/lesson/u1-l3"])
    const button = helpButton()
    const classes = button.className.split(/\s+/)
    expect(classes).not.toContain("hidden")
    expect(classes).toContain("max-[380px]:size-11") // a 44px icon target
    expect(within(button).getByText(ar("lesson.help")).className).toBe("max-[380px]:sr-only") // the name stays for screen readers
  })
})

describe("cmp-01 r1: the assistant offers a human", () => {
  it("cmp01_r1_personal_matter_asks_need_human_and_opens_the_request_in_one_tap", async () => {
    app([fromLesson])
    askReply = () => json({ ...base, route: "personal", level: "D", sources: [] })
    await ask("هل تصح صلاتي في حالتي؟")
    const card = await needHumanCard()
    expect(card.textContent).toContain(ar("ask.personal.title"))
    fireEvent.click(within(card).getByRole("button"))
    expect(where().search).toBe("?kind=escalation&from=lesson&ask=a1")
  })

  it("cmp01_r1_sourced_general_answer_does_not_ask_need_human", async () => {
    app([fromLesson])
    await ask(QUESTION)
    await screen.findByText("TEST_ANSWER_TEXT")
    expect(screen.queryByText(ar("ask.needHuman"))).toBeNull()
  })

  it("cmp01_r1_i_want_a_person_is_visible_in_the_assistant_at_every_moment", async () => {
    app([fromLesson])
    expect(topBarHuman()).toBeTruthy() // before any question

    let release: (r: Response) => void = () => undefined
    askReply = () => new Promise<Response>((r) => (release = r))
    await ask(QUESTION)
    expect(screen.getByText(ar("ask.waiting"))).toBeTruthy()
    expect(topBarHuman()).toBeTruthy() // while waiting

    await act(async () => release(json(base)))
    await screen.findByText("TEST_ANSWER_TEXT")
    expect(topBarHuman()).toBeTruthy() // with an answer on screen

    askReply = () => json(noSource)
    await ask("سؤال آخر عن الوضوء")
    await needHumanCard()
    fireEvent.click(topBarHuman())
    expect(where().search).toBe("?from=lesson") // one tap, and the request knows only where he came from
  })

  it("cmp01_r1_opened_from_the_tab_the_request_still_says_ask", async () => {
    app(["/ask"])
    expect(document.querySelector("[data-slot=lesson-topic]")).toBeNull()
    askReply = () => json(noSource)
    await ask(QUESTION)
    fireEvent.click(within(await needHumanCard()).getByRole("button"))
    expect(where().search).toBe("?kind=escalation&from=ask&ask=a1")
  })

  it("cmp01_r1_danger_goes_to_a_human_at_once_without_an_answer", async () => {
    app([fromLesson])
    askReply = () => json({ ...base, outcome: "danger", route: "danger", answer: "MUST_NOT_SHOW", handoff: { kind: "urgent", lang: "ar" } })
    await ask("أنا في خطر")
    const panel = (await screen.findByText(ar("ask.danger.title"))).closest("[data-slot=danger-help-panel]") as HTMLElement
    expect(screen.queryByText("MUST_NOT_SHOW")).toBeNull()
    expect(screen.queryByText(ar("ask.needHuman"))).toBeNull() // no question first: a person now
    fireEvent.click(within(panel).getByRole("button", { name: ar("ask.danger.primary") }))
    expect(where().search).toBe("?kind=urgent&from=lesson&ask=a1")
  })
})

describe("cmp-01 r1: what reaches the human", () => {
  it("cmp01_r1_ex2_request_from_a_lesson_says_lesson_without_its_name_or_any_answer", async () => {
    // بافتراض أن جوزيف في درس عن الوضوء (وأجاب عن تمرينه)
    atExercise()
    app(["/learn/lesson/u1-l3"])
    fireEvent.click(screen.getByRole("radio", { name: CHOSEN }))
    fireEvent.click(screen.getByRole("button", { name: ar("lesson.check") }))
    fireEvent.click(helpButton())
    askReply = () => json(noSource)
    await ask(QUESTION)

    // عندما يطلب إنسانًا ويكتب رسالته
    fireEvent.click(within(await needHumanCard()).getByRole("button"))
    fireEvent.change(screen.getByLabelText(ar("cmp.help.message")), { target: { value: "أحتاج من يشرح لي" } })
    fireEvent.click(screen.getByRole("button", { name: ar("human.send") }))
    await waitFor(() => expect(sent("/api/help/requests")).toHaveLength(1))

    // فإنها تصل ومعها أنه جاء من «درس»، دون اسم الدرس ولا شيء من إجاباته
    const request = sent("/api/help/requests")[0]
    expect(request.source).toBe("lesson")
    expect(request.body).toBe("أحتاج من يشرح لي")
    expect(request.ask_id ?? null).toBeNull()
    const wire = JSON.stringify(request)
    for (const secret of [WUDU, CHOSEN, "الجواب الصحيح", "سؤال تمرين الوضوء", "u1-l3", "EXERCISE_1", QUESTION]) expect(wire).not.toContain(secret)
  })

  it("cmp01_r1_ex3_assistant_question_is_attached_only_if_the_learner_chooses", async () => {
    // بافتراض أن دانيال سأل المساعد ثم طلب إنسانًا
    app([fromLesson])
    askReply = () => json(noSource)
    await ask(QUESTION)
    fireEvent.click(within(await needHumanCard()).getByRole("button"))

    // عندما يُفتح الطلب، فإن سؤاله للمساعد لا يُرفق إلا إذا اختار إرفاقه
    const box = screen.getByRole("checkbox", { name: ar("cmp.help.attach") })
    expect(box.getAttribute("aria-checked")).toBe("false")
    fireEvent.change(screen.getByLabelText(ar("cmp.help.message")), { target: { value: "أحتاج من يفهمني" } })
    fireEvent.click(screen.getByRole("button", { name: ar("human.send") }))
    await waitFor(() => expect(sent("/api/help/requests")).toHaveLength(1))
    expect(JSON.stringify(sent("/api/help/requests")[0])).not.toContain(QUESTION)
  })

  it("cmp01_r1_ex3_assistant_question_travels_when_chosen", async () => {
    app([fromLesson])
    askReply = () => json(noSource)
    await ask(QUESTION)
    fireEvent.click(within(await needHumanCard()).getByRole("button"))
    fireEvent.click(screen.getByRole("checkbox", { name: ar("cmp.help.attach") }))
    fireEvent.click(screen.getByRole("button", { name: ar("human.send") }))
    await waitFor(() => expect(sent("/api/help/requests")).toHaveLength(1))
    expect(String(sent("/api/help/requests")[0].body)).toContain(QUESTION)
    expect(sent("/api/help/requests")[0].source).toBe("lesson")
  })
})
