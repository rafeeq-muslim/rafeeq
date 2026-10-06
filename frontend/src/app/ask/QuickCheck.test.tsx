/**
 * LRN-10 R5 on the Ask screen (audit 2026-10-06): with the learner's
 * consent, an answer tagged to an objective raises it to «اطّلع» and shows
 * one quick approved exercise on it; its first answer updates mastery like
 * any first answer (R3) and is recorded as "quick_check". Without a tag
 * (no consent, or a sensitive question) nothing appears.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"

import { translate } from "@/app/i18n"
import { useAsk } from "@/app/ask/store"
import type { AskResponse } from "@/app/ask/types"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { useLearning } from "@/app/stores/learning"
import { levelOf, P_L0, update } from "@/app/learning/bkt"
import type { Content } from "@/app/learning/types"
import { pickQuickCheck } from "./quick"

const events: Record<string, unknown>[] = []
vi.mock("@/app/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/app/lib/api")>()),
  sendEvent: (e: Record<string, unknown>) => events.push(e),
}))
const { default: Ask } = await import("@/app/pages/Ask")

const exercise = (id: string) => ({
  id,
  type: "choose" as const,
  objectives: ["u5-l3-o1"],
  cards: ["u5-l3-c1"],
  prompt: `PROMPT_${id}`,
  options: [
    { id: "right", text: "الصواب" },
    { id: "wrong", text: "الخطأ" },
  ],
  answer: "right",
})
const CONTENT: Content = {
  lang: "ar",
  preview: false,
  units: [{ id: "u5", order: 5, title: "أتطهّر", badge_name: "", source_credit: "", lessons: ["u5-l3"], approved: true }],
  lessons: {
    "u5-l3": {
      id: "u5-l3",
      unit: "u5",
      order: 3,
      title: "التيمم",
      approved: true,
      cards: [{ id: "u5-l3-c1", kind: "text", text: "CARD_TAYAMMUM" }],
      objectives: [{ id: "u5-l3-o1", text: "يعرف صفة التيمم", label: "صفة التيمم", cards: ["u5-l3-c1"] }],
      exercises: [exercise("u5-l3-e1"), exercise("u5-l3-e2")],
    },
  },
}

const answer = (objective_id: string | null): AskResponse => ({
  ask_id: `a-${objective_id}`,
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
  objective_id,
  lang: "ar",
})
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
function stub(reply: AskResponse) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => (url === "/api/ask" ? json(reply) : url.startsWith("/api/content") ? json(CONTENT) : json({}))),
  )
}
const settle = () => act(async () => await new Promise((r) => setTimeout(r, 0)))
const ar = (k: Parameters<typeof translate>[1]) => translate("ar", k)

async function askAbout(reply: AskResponse) {
  stub(reply)
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Ask />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await settle()
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "كيف أتيمم؟" } })
  fireEvent.click(screen.getByRole("button", { name: ar("ask.send") }))
  await settle()
  await settle()
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})
beforeEach(() => {
  events.length = 0
  useAsk.getState().reset()
  useDevice.getState().set({ locale: "ar", askConsent: true })
  useAuth.getState().set({ token: null })
  useLearning.setState({ completed: {}, unlockedUnits: [], mastery: {}, sessions: {} })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("lrn-10-r5 a quick exercise after an answer about an objective", () => {
  it("lrn-10-r5: Daniel asked about tayammum with consent: the objective becomes «اطّلع» and one quick exercise appears", async () => {
    await askAbout(answer("u5-l3-o1"))
    expect(levelOf(useLearning.getState().mastery["u5-l3-o1"])).toBe("exposed")
    expect(screen.getByText(ar("ask.quickCheck"))).toBeTruthy()
    expect(screen.getAllByText(/^PROMPT_u5-l3-e/)).toHaveLength(1)
  })

  it("lrn-10-r5: a right quick answer raises mastery like any first answer, recorded as quick_check, once", async () => {
    await askAbout(answer("u5-l3-o1"))
    fireEvent.click(screen.getByRole("radio", { name: "الصواب" }))
    fireEvent.click(screen.getByRole("button", { name: ar("lesson.check") }))
    expect(useLearning.getState().mastery["u5-l3-o1"].p).toBeCloseTo(update(P_L0, true, "choose"))
    expect(screen.getByText(ar("lesson.correct"))).toBeTruthy()
    const firsts = events.filter((e) => e.type === "first_answer")
    expect(firsts).toEqual([{ type: "first_answer", objective_id: "u5-l3-o1", exercise_id: expect.stringMatching(/^u5-l3-e/), correct: true, context: "quick_check" }])
  })

  it("lrn-10-r5: a wrong quick answer is safe: the card text shows and nothing is locked", async () => {
    await askAbout(answer("u5-l3-o1"))
    fireEvent.click(screen.getByRole("radio", { name: "الخطأ" }))
    fireEvent.click(screen.getByRole("button", { name: ar("lesson.check") }))
    expect(screen.getByText(/CARD_TAYAMMUM/)).toBeTruthy()
    expect(screen.getByRole("textbox")).toBeTruthy()
  })

  it("lrn-10-r5 (permissions): no tag (no consent, or a sensitive question) → no exercise and no change", async () => {
    await askAbout(answer(null))
    expect(screen.getByText("TEST_ANSWER_TEXT")).toBeTruthy()
    expect(screen.queryByText(ar("ask.quickCheck"))).toBeNull()
    expect(useLearning.getState().mastery).toEqual({})
  })

  it("lrn-10-r5: the quick exercise prefers one the learner has not answered", () => {
    const picked = pickQuickCheck(CONTENT, "u5-l3-o1", { p: 0.3, seen: true, answered: true, checksDone: 0, seenExercises: ["u5-l3-e1"] })
    expect(picked?.id).toBe("u5-l3-e2")
    expect(pickQuickCheck(CONTENT, "unknown", undefined)).toBeNull()
  })
})
