/**
 * KNW-01 R7 on the Ask screen: the messages of this visit stay when the
 * learner goes to another screen and comes back, changes language or theme,
 * opens Ask from a lesson's help button or from the notebook, signs in, or
 * loses the connection. (Reload and the clearing cases: ask/session.rules.test.ts.)
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Link, MemoryRouter, Route, Routes } from "react-router"

import { translate } from "@/app/i18n"
import { useAsk } from "@/app/ask/store"
import { lessonHelpState } from "@/app/ask/lessonHelp"
import type { AskResponse } from "@/app/ask/types"
import { useAuth, type Me } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import Ask from "./Ask"

const ANSWER: AskResponse = {
  ask_id: "a1",
  outcome: "answered",
  reason_code: null,
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
const Q1 = "TEST_QUESTION_ONE"
const Q2 = "TEST_QUESTION_TWO"
const A1 = `ANSWER_TO ${Q1}`
const A2 = `ANSWER_TO ${Q2}`

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
let asked: string[] = []
let failNext = false

function stubFetch() {
  asked = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url !== "/api/ask") return json({ detail: "not found" }, 404)
      const { question } = JSON.parse(String(init?.body)) as { question: string }
      asked.push(question)
      if (failNext) {
        failNext = false
        return json({ detail: "down" }, 500)
      }
      return json({ ...ANSWER, ask_id: `a${asked.length}`, answer: `ANSWER_TO ${question}` })
    }),
  )
}

const ar = (k: Parameters<typeof translate>[1]) => translate("ar", k)
const settle = () => act(async () => await new Promise((r) => setTimeout(r, 0)))
const textarea = () => screen.getByRole("textbox") as HTMLTextAreaElement

function renderApp(initial: Parameters<typeof MemoryRouter>[0]["initialEntries"] = ["/ask"]) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={initial}>
        <Routes>
          <Route path="/ask" element={<><Ask /><Link to="/">TEST_GO_HOME</Link></>} />
          <Route
            path="/"
            element={
              <>
                <Link to="/ask">TEST_GO_ASK</Link>
                <Link to="/ask" state={lessonHelpState("lesson", "TEST_LESSON_TOPIC")}>TEST_LESSON_HELP</Link>
                <Link to="/ask" state={{ notebookQuestion: "TEST_NOTEBOOK_QUESTION" }}>TEST_NOTEBOOK</Link>
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function send(text: string) {
  fireEvent.change(textarea(), { target: { value: text } })
  fireEvent.click(screen.getByRole("button", { name: translate(useDevice.getState().locale, "ask.send") }))
  await settle()
}

function expectBoth() {
  for (const text of [Q1, A1, Q2, A2]) expect(screen.getByText(text)).toBeTruthy()
}

async function conversation() {
  renderApp()
  await send(Q1)
  await send(Q2)
  expectBoth()
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})
beforeEach(() => {
  useAsk.getState().reset()
  useDevice.getState().set({ locale: "ar", theme: "light", askConsent: false, discreet: false, quickExit: false })
  useAuth.getState().set({ token: null, me: null })
  failNext = false
  stubFetch()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true })
})

describe("knw-01 r7: the messages stay on the Ask screen", () => {
  it("knw01_r7_going_to_another_screen_and_back_keeps_the_messages", async () => {
    await conversation()
    fireEvent.click(screen.getByText("TEST_GO_HOME"))
    expect(screen.queryByText(Q1)).toBeNull()
    fireEvent.click(screen.getByText("TEST_GO_ASK"))
    expectBoth()
  })

  it("knw01_r7_opening_ask_from_a_lesson_help_button_keeps_the_messages (CMP-01 R1)", async () => {
    await conversation()
    fireEvent.click(screen.getByText("TEST_GO_HOME"))
    fireEvent.click(screen.getByText("TEST_LESSON_HELP"))
    expect(screen.getByText(ar("ask.lesson.from").replace("{name}", "TEST_LESSON_TOPIC"))).toBeTruthy()
    expectBoth()
  })

  it("knw01_r7_a_question_from_the_notebook_is_added_after_the_messages (CMP-06 R2)", async () => {
    await conversation()
    fireEvent.click(screen.getByText("TEST_GO_HOME"))
    fireEvent.click(screen.getByText("TEST_NOTEBOOK"))
    await settle()
    expectBoth()
    expect(screen.getByText("ANSWER_TO TEST_NOTEBOOK_QUESTION")).toBeTruthy()
    expect(asked).toEqual([Q1, Q2, "TEST_NOTEBOOK_QUESTION"])
    expect(useAsk.getState().turns).toHaveLength(6)
  })

  it("knw01_r7_changing_language_or_theme_keeps_the_messages", async () => {
    await conversation()
    act(() => useDevice.getState().set({ locale: "en" }))
    expectBoth()
    act(() => useDevice.getState().set({ theme: "dark" }))
    expectBoth()
    act(() => useDevice.getState().set({ locale: "tl", theme: "system" }))
    expectBoth()
  })

  it("knw01_r7_turning_discreet_mode_on_or_off_keeps_the_messages_on_the_screen", async () => {
    await conversation()
    act(() => useDevice.getState().set({ discreet: true }))
    expectBoth()
    act(() => useDevice.getState().set({ discreet: false }))
    expectBoth()
  })

  it("knw01_r7_signing_in_keeps_the_messages", async () => {
    await conversation()
    const me: Me = { id: "u1", display_name: "TEST_NAME", username: "test-1", roles: ["learner"], locale: "ar", two_factor_enabled: false, email_hint: null, gender: null, languages: ["ar"] }
    act(() => useAuth.getState().set({ token: "TEST_TOKEN", me, ready: true }))
    expectBoth()
  })

  it("knw01_r7_a_failed_answer_and_its_retry_keep_the_earlier_messages", async () => {
    renderApp()
    await send(Q1)
    failNext = true
    await send(Q2)
    expect(screen.getByText(ar("ask.error.server"))).toBeTruthy()
    expect(screen.getByText(Q1)).toBeTruthy()
    expect(screen.getByText(A1)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: ar("common.retry") }))
    await settle()
    expectBoth()
    expect(asked).toEqual([Q1, Q2, Q2])
    expect(useAsk.getState().turns).toHaveLength(4)
  })

  it("knw01_r7_losing_the_connection_and_getting_it_back_keeps_the_messages (PLT-15 R5)", async () => {
    await conversation()
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false })
    act(() => void window.dispatchEvent(new Event("offline")))
    expect(screen.getByText(ar("ask.offline"))).toBeTruthy()
    expectBoth()
    fireEvent.change(textarea(), { target: { value: "TEST_DRAFT_TEXT" } })
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true })
    act(() => void window.dispatchEvent(new Event("online")))
    expectBoth()
    expect(textarea().value).toBe("TEST_DRAFT_TEXT")
    expect(asked).toEqual([Q1, Q2]) // nothing was sent by itself
  })
})
