/**
 * CMP-01 R1, owner's decision 2026-10-07
 * (docs/domains/companion/features/CMP-01-human-help-and-danger.md): the
 * assistant opened from a lesson or a review knows what the learner is
 * looking at. The app sends IDS ONLY (lesson id + card id or exercise id)
 * with the question while the context chip is shown; the server loads the
 * approved text. Never the learner's answer, its correctness or progress.
 * Once the chip is dismissed, nothing of the lesson is sent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes, useLocation } from "react-router"

import { translate, type Key } from "@/app/i18n"
import { describeContext, lessonHelpState } from "@/app/ask/lessonHelp"
import { useAsk } from "@/app/ask/store"
import type { AskResponse } from "@/app/ask/types"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { useLearning } from "@/app/stores/learning"
import { dropLessonHelpReturn } from "@/app/lesson/helpReturn"
import type { Content } from "@/app/learning/types"

const LESSON = "u1-l3"
const WUDU = "أتوضأ (1)"
const QUESTION = "ما معنى هذا؟"
const CARD_2 = "نص البطاقة الثانية"
const PROMPT_1 = "سؤال التمرين الأول"
const PROMPT_2 = "سؤال التمرين الثاني"
const CHOSEN = "اختيار جوزيف في التمرين الثاني"
const RIGHT_2 = "صواب التمرين الثاني"

const choose = (n: number, prompt: string, right: string, wrong: string) => ({
  id: `EXERCISE_${n}`,
  type: "choose",
  prompt,
  objectives: ["o1"],
  cards: ["c1"],
  options: [
    { id: "a", text: right },
    { id: "b", text: wrong },
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
        { id: "c1", text: "نص البطاقة الأولى" },
        { id: "c2", text: CARD_2 },
      ],
      objectives: [{ id: "o1", text: "O1", cards: ["c1", "c2"] }],
      exercises: [choose(1, PROMPT_1, "صواب التمرين الأول", "خطأ التمرين الأول"), choose(2, PROMPT_2, RIGHT_2, CHOSEN)],
    },
  },
} as unknown as Content

vi.mock("@/app/learning/useContent", () => ({
  useContent: () => ({ content, isLoading: false, isError: false, refetch: () => undefined, lessons: Object.values(content.lessons), preview: true }),
}))

const { default: LessonPage } = await import("@/app/pages/Lesson")
const { default: Review } = await import("@/app/pages/Review")
const { default: Ask } = await import("@/app/pages/Ask")

const ar = (k: Key, v?: Record<string, string | number>) => translate("ar", k, v)
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })

const answered: AskResponse = {
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

let bodies: Record<string, unknown>[] = []
function stubFetch() {
  bodies = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/ask") {
        bodies.push(JSON.parse(String(init?.body)))
        return json({ ...answered, ask_id: `a${bodies.length}` })
      }
      return new Response(JSON.stringify({ detail: "not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
    }),
  )
}

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
          <Route path="*" element={<p>elsewhere</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const settle = () => act(async () => await new Promise((r) => setTimeout(r, 0)))
const helpButton = () => screen.getByRole("button", { name: ar("lesson.help") })
const chip = () => document.querySelector<HTMLElement>("[data-slot=ask-context]")
const dismiss = () => screen.getByRole("button", { name: ar("ask.context.dismiss") })

async function ask(question: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: question } })
  fireEvent.click(screen.getByRole("button", { name: ar("ask.send") }))
  await settle()
}

/** The lesson's session: cards read up to `step`, with these exercises still to do. */
const sessionAt = (step: number, queue: string[], done: string[] = []) =>
  useLearning.setState({
    sessions: { [LESSON]: { lessonId: LESSON, step, answered: done, firstTried: done, queue, lastAnswerAt: new Date().toISOString() } },
  } as never)
const atExercise2 = () => sessionAt(2, ["EXERCISE_2"], ["EXERCISE_1"])

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  useAsk.getState().reset()
  dropLessonHelpReturn() // LRN-03 R5: nothing held from another test's lesson
  useDevice.getState().set({ locale: "ar", askConsent: false })
  useAuth.getState().set({ token: null, me: null, ready: true })
  useLearning.setState({ completed: {}, unlockedUnits: [], mastery: {}, sessions: {}, placementDone: true, landingUnit: null } as never)
  stubFetch()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe("cmp-01 r1: the assistant knows what the learner is looking at (ids only)", () => {
  it("cmp01_r1_help_on_exercise_2_and_asking_what_does_this_mean_sends_the_context_ids", async () => {
    // بافتراض أن جوزيف في التمرين الثاني من درس «أتوضأ (1)» وضغط زر المساعدة
    atExercise2()
    app([`/learn/lesson/${LESSON}`])
    expect(screen.getByText(PROMPT_2)).toBeTruthy()
    fireEvent.click(helpButton())
    expect(where().path).toBe("/ask")
    expect(where().search).toBe("") // nothing in the URL

    // عندما يسأل «ما معنى هذا؟»
    await ask(QUESTION)

    // فإن سؤاله يُرسل ومعه معرّف الدرس ومعرّف التمرين الذي أمامه، لا غير
    expect(bodies).toHaveLength(1)
    expect(bodies[0].question).toBe(QUESTION)
    expect(bodies[0].lang).toBe("ar")
    expect(bodies[0].context).toEqual({ lesson_id: LESSON, exercise_id: "EXERCISE_2" })
  })

  it("cmp01_r1_context_chip_shows_the_lesson_title_and_the_current_question_above_the_input", () => {
    atExercise2()
    app([`/learn/lesson/${LESSON}`])
    fireEvent.click(helpButton())
    const shown = chip()
    expect(shown?.textContent).toContain(ar("ask.context.about", { lesson: WUDU, item: PROMPT_2 })) // «عن: أتوضأ (1) · سؤال التمرين الثاني»
    expect(shown?.textContent).toContain("عن:")
    // above the input: the chip comes before the composer in the same bar
    const input = screen.getByRole("textbox")
    expect(shown!.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(shown!.parentElement?.contains(input)).toBe(true)
    expect(dismiss()).toBeTruthy()
  })

  it("cmp01_r1_with_the_chip_dismissed_no_context_is_sent", async () => {
    atExercise2()
    app([`/learn/lesson/${LESSON}`])
    fireEvent.click(helpButton())
    await ask(QUESTION)
    expect(bodies[0].context).toEqual({ lesson_id: LESSON, exercise_id: "EXERCISE_2" }) // shown → sent

    fireEvent.click(dismiss())
    expect(chip()).toBeNull()
    await ask("سؤال آخر عن شيء مختلف")
    expect(bodies).toHaveLength(2)
    expect("context" in bodies[1]).toBe(false) // dismissed → nothing of the lesson
    expect(JSON.stringify(bodies[1])).not.toContain("EXERCISE_2")
    expect(JSON.stringify(bodies[1])).not.toContain(LESSON)
  })

  it("cmp01_r1_the_learners_answer_is_never_in_the_request", async () => {
    atExercise2()
    app([`/learn/lesson/${LESSON}`])
    // Joseph picks an option and checks it (wrongly) before asking for help.
    fireEvent.click(screen.getByRole("radio", { name: CHOSEN }))
    fireEvent.click(screen.getByRole("button", { name: ar("lesson.check") }))
    expect(useLearning.getState().sessions[LESSON].firstTried).toContain("EXERCISE_2") // the answer exists on the device
    fireEvent.click(helpButton())
    expect(where().state).toEqual({ lessonHelp: { from: "lesson", topic: WUDU, context: { lesson_id: LESSON, exercise_id: "EXERCISE_2" } } })

    await ask(QUESTION)
    expect(bodies[0].context).toEqual({ lesson_id: LESSON, exercise_id: "EXERCISE_2" })
    expect(Object.keys(bodies[0].context as object).sort()).toEqual(["exercise_id", "lesson_id"])
    const sent = JSON.stringify(bodies)
    // Not his choice, not whether it was right, not his progress, and no text of the lesson (the server loads it).
    for (const secret of [CHOSEN, RIGHT_2, PROMPT_2, WUDU, "EXERCISE_1", "firstTried", "answered", "incorrect", '"b"']) expect(sent).not.toContain(secret)
  })

  it("cmp01_r1_help_on_a_card_sends_the_card_id", async () => {
    sessionAt(1, ["EXERCISE_1", "EXERCISE_2"])
    app([`/learn/lesson/${LESSON}`])
    expect(screen.getByText(CARD_2)).toBeTruthy()
    fireEvent.click(helpButton())
    expect(chip()?.textContent).toContain(ar("ask.context.about", { lesson: WUDU, item: CARD_2 }))
    await ask(QUESTION)
    expect(bodies[0].context).toEqual({ lesson_id: LESSON, card_id: "c2" })
  })

  it("cmp01_r1_review_help_sends_the_lesson_and_exercise_ids_of_the_exercise_on_screen", async () => {
    const hourAgo = new Date(Date.now() - 2 * 3_600_000).toISOString()
    useLearning.setState({
      completed: { [LESSON]: { first: hourAgo, last: hourAgo, times: 1 } },
      mastery: { o1: { p: 0.4, seen: true, answered: true, lastAnswerAt: hourAgo, checksDone: 0 } },
    } as never)
    app(["/learn/review"])
    const onScreen = content.lessons[LESSON].exercises.find((e) => screen.queryByText(e.prompt))!
    fireEvent.click(helpButton())
    expect(chip()?.textContent).toContain(onScreen.prompt)
    await ask(QUESTION)
    expect(bodies[0].context).toEqual({ lesson_id: LESSON, exercise_id: onScreen.id })
  })

  it("cmp01_r1_a_suggested_question_carries_the_context_too_while_the_chip_is_shown", async () => {
    app([{ pathname: "/ask", state: lessonHelpState("lesson", WUDU, { lesson_id: LESSON, exercise_id: "EXERCISE_2" }) }])
    fireEvent.click(document.querySelector<HTMLElement>("[data-suggestion-id]")!)
    await settle()
    expect(bodies[0].entrypoint).toBe("suggestion")
    expect(bodies[0].context).toEqual({ lesson_id: LESSON, exercise_id: "EXERCISE_2" })
  })

  it("cmp01_r1_opened_from_its_own_tab_there_is_no_chip_and_no_context", async () => {
    app(["/ask"])
    expect(chip()).toBeNull()
    await ask(QUESTION)
    expect("context" in bodies[0]).toBe(false)
  })

  it("cmp01_r1_ids_this_device_has_no_content_for_show_no_chip_and_send_nothing", async () => {
    app([{ pathname: "/ask", state: lessonHelpState("lesson", WUDU, { lesson_id: "u9-l9", exercise_id: "EXERCISE_2" }) }])
    expect(chip()).toBeNull()
    await ask(QUESTION)
    expect("context" in bodies[0]).toBe(false)
    expect(describeContext(content.lessons, { lesson_id: LESSON, exercise_id: "nope" })).toBeNull()
  })

  it("cmp01_r1_the_visits_copy_of_the_conversation_keeps_ids_only_never_lesson_text", async () => {
    app([{ pathname: "/ask", state: lessonHelpState("lesson", WUDU, { lesson_id: LESSON, exercise_id: "EXERCISE_2" }) }])
    await ask(QUESTION)
    const turn = useAsk.getState().turns.find((x) => x.role === "assistant")!
    expect("snapshot" in turn && turn.snapshot.context).toEqual({ lesson_id: LESSON, exercise_id: "EXERCISE_2" })
    expect(JSON.stringify(useAsk.getState().turns)).not.toContain(PROMPT_2) // what the visit keeps holds ids, not lesson text
  })
})
