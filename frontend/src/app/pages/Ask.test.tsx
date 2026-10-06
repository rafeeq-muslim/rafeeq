/**
 * KNW-01 reliability (docs/domains/knowledge/features/KNW-01-chatbot-reliability-prd.md)
 * on the Ask screen: every suggestion sends exactly its shown text, typed and
 * clicked questions share one contract, failures are told apart, a retry keeps
 * the draft, and one card is shown per reference (T01–T03, T17, T18, T20, T31;
 * KNW-02 SC5 for the islamqa name).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"

import { translate, type Locale } from "@/app/i18n"
import { useAsk } from "@/app/ask/store"
import type { AskResponse, SourceCard } from "@/app/ask/types"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { SUGGESTIONS } from "@/app/ask/suggestions"
import Ask from "./Ask"

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

const card = (id: string, source_id: string, ref_key: string, over: Partial<SourceCard> = {}): SourceCard => ({
  id,
  source_id,
  source_name: source_id === "islamqa" ? "الإسلام سؤال وجواب" : source_id,
  kind: "fatwa",
  lang: "ar",
  ref: { question_id: Number(ref_key) },
  ref_key,
  quote_text: `TEST_QUOTE ${id}`,
  arabic_text: null,
  translation: null,
  grade: null,
  attribution: null,
  title: `TITLE_${ref_key}`,
  origin_url: source_id === "islamqa" ? `https://islamqa.info/ar/answers/${ref_key}` : `https://binbaz.org.sa/fatwas/${ref_key}`,
  version: "v1",
  ...over,
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

type Body = Record<string, unknown>
let askBodies: Body[] = []
let replies: (() => Promise<Response>)[] = []

function stubFetch(defaultReply: () => Promise<Response> = async () => json(base)) {
  askBodies = []
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/ask") {
        askBodies.push(JSON.parse(String(init?.body)))
        return (replies.shift() ?? defaultReply)()
      }
      if (url === "/api/learning/guide") return Promise.resolve(json({ detail: "down" }, 500))
      return Promise.resolve(json({ detail: "not found" }, 404)) // /api/content: no lessons in this test
    }),
  )
}

function renderAsk() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Ask />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const t = (locale: Locale, key: Parameters<typeof translate>[1]) => translate(locale, key)
const semantic = (b: Body) => ({ question: b.question, lang: b.lang, consent_objectives: b.consent_objectives })
const textarea = () => screen.getByRole("textbox") as HTMLTextAreaElement
const settle = () => act(async () => await new Promise((r) => setTimeout(r, 0)))

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})
beforeEach(() => {
  useAsk.getState().reset()
  useDevice.getState().set({ locale: "ar", askConsent: false })
  useAuth.getState().set({ token: null })
  replies = []
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("knw-01 r1 suggestions and typing share one contract", () => {
  it("t01: clicking «ما معنى الشهادتين؟» and typing it send the same question once each", async () => {
    stubFetch()
    renderAsk()
    fireEvent.click(screen.getByRole("button", { name: "ما معنى الشهادتين؟" }))
    await settle()
    cleanup()
    useAsk.getState().reset()
    renderAsk()
    fireEvent.change(textarea(), { target: { value: "ما معنى الشهادتين؟" } })
    fireEvent.click(screen.getByRole("button", { name: t("ar", "ask.send") }))
    await settle()
    expect(askBodies).toHaveLength(2)
    expect(semantic(askBodies[0])).toEqual(semantic(askBodies[1]))
    expect(askBodies[0]).toMatchObject({ entrypoint: "suggestion", suggestion_id: "shahada_meaning" })
    expect(askBodies[1]).toMatchObject({ entrypoint: "typed" })
  })

  for (const locale of ["ar", "en", "tl"] as const) {
    it(`t02: every suggestion sends its shown text in ${locale}`, async () => {
      useDevice.getState().set({ locale })
      for (const sg of SUGGESTIONS.slice(1)) {
        stubFetch()
        useAsk.getState().reset()
        cleanup()
        renderAsk()
        fireEvent.click(screen.getByRole("button", { name: t(locale, sg.key) }))
        await settle()
        expect(askBodies).toEqual([expect.objectContaining({ question: t(locale, sg.key), lang: locale, suggestion_id: sg.id })])
      }
    })
  }

  it("t03: «ماذا أتعلّم الآن؟» ends in the learning guide's fixed message when the guide is down", async () => {
    stubFetch(async () => json({ ...base, outcome: "learning_guide", answer: "" }))
    renderAsk()
    fireEvent.click(screen.getByRole("button", { name: t("ar", "ask.whatNext") }))
    await waitFor(() => expect(screen.getByText(t("ar", "ask.guide.title"))).toBeTruthy())
    expect(screen.getByText(t("ar", "ask.guide.start"))).toBeTruthy()
    expect(screen.queryByText(t("ar", "ask.waiting"))).toBeNull() // no endless spinner
    expect(askBodies[0]).toMatchObject({ suggestion_id: "learning_next" })
  })

  it("t17: a double click on a suggestion sends one request", async () => {
    stubFetch()
    renderAsk()
    const btn = screen.getByRole("button", { name: "ما فضل الوضوء؟" })
    fireEvent.click(btn)
    fireEvent.click(btn)
    await settle()
    expect(askBodies).toHaveLength(1)
  })

  it("keeps Enter, Shift+Enter and IME composition behaviour", async () => {
    stubFetch()
    renderAsk()
    fireEvent.change(textarea(), { target: { value: "ما فضل الوضوء؟" } })
    fireEvent.keyDown(textarea(), { key: "Enter", isComposing: true })
    fireEvent.keyDown(textarea(), { key: "Enter", shiftKey: true })
    await settle()
    expect(askBodies).toHaveLength(0)
    fireEvent.keyDown(textarea(), { key: "Enter" })
    await settle()
    expect(askBodies).toHaveLength(1)
    expect(textarea().value).toBe("") // cleared only after the store accepted it
  })

  it("a question over 600 characters is kept in the box with a clear message", async () => {
    stubFetch()
    renderAsk()
    const long = "س".repeat(601)
    fireEvent.change(textarea(), { target: { value: long } })
    fireEvent.click(screen.getByRole("button", { name: t("ar", "ask.send") }))
    await settle()
    expect(askBodies).toHaveLength(0)
    expect(screen.getByRole("alert").textContent).toBe(t("ar", "ask.tooLong"))
    expect(textarea().value).toBe(long)
  })
})

describe("knw-01 r4/r6 outcomes and errors", () => {
  it("t18: retry updates the same message and keeps a new draft", async () => {
    stubFetch()
    replies = [async () => Promise.reject(new TypeError("offline"))]
    renderAsk()
    fireEvent.click(screen.getByRole("button", { name: "ما معنى الشهادتين؟" }))
    await waitFor(() => expect(screen.getByText(t("ar", "ask.error.network"))).toBeTruthy())
    fireEvent.change(textarea(), { target: { value: "سؤال جديد أكتبه الآن" } })
    fireEvent.click(screen.getByRole("button", { name: t("ar", "common.retry") }))
    await waitFor(() => expect(screen.getByText("TEST_ANSWER_TEXT")).toBeTruthy())
    expect(textarea().value).toBe("سؤال جديد أكتبه الآن")
    expect(screen.getAllByText("ما معنى الشهادتين؟")).toHaveLength(1) // one user bubble (suggestions are gone)
    expect(askBodies.map((b) => b.question)).toEqual(["ما معنى الشهادتين؟", "ما معنى الشهادتين؟"])
  })

  it("no_source, verification_failed and unavailable read differently; only a retryable failure offers retry", async () => {
    const cases: [Partial<AskResponse>, string, boolean][] = [
      [{ outcome: "no_source", reason_code: "retrieval_empty" }, "ask.noSource.title", false],
      [{ outcome: "verification_failed", reason_code: "verification_rejected" }, "ask.verificationFailed.title", false],
      [{ outcome: "unavailable", reason_code: "temporarily_unavailable", retryable: true }, "ask.unavailable.title", true],
      [{ outcome: "unavailable", reason_code: "service_limit", retryable: false }, "ask.unavailable.title", false],
    ]
    for (const [over, title, retry] of cases) {
      cleanup()
      useAsk.getState().reset()
      stubFetch(async () => json({ ...base, ...over, answer: "FIXED_REPLY" }))
      renderAsk()
      fireEvent.click(screen.getByRole("button", { name: "ما معنى الشهادتين؟" }))
      await waitFor(() => expect(screen.getByText(t("ar", title as never))).toBeTruthy())
      expect(!!screen.queryByRole("button", { name: t("ar", "common.retry") })).toBe(retry)
      expect(screen.getAllByRole("button", { name: t("ar", "ask.human") })).toHaveLength(2) // top bar + the card
    }
  })

  it("t31: an unknown outcome is a safe failure, never its text", async () => {
    stubFetch(async () => json({ ...base, outcome: "something_new", answer: "UNVERIFIED_TEXT" }))
    renderAsk()
    fireEvent.click(screen.getByRole("button", { name: "ما معنى الشهادتين؟" }))
    await waitFor(() => expect(screen.getByText(t("ar", "ask.unavailable.title"))).toBeTruthy())
    expect(screen.queryByText("UNVERIFIED_TEXT")).toBeNull()
  })

  it("t31: a 502 HTML page and a 200 that breaks the contract both end in a clear message", async () => {
    stubFetch()
    replies = [async () => new Response("<html>Bad gateway</html>", { status: 502 }), async () => json({ unexpected: true })]
    renderAsk()
    fireEvent.click(screen.getByRole("button", { name: "ما معنى الشهادتين؟" }))
    await waitFor(() => expect(screen.getByText(t("ar", "ask.error.server"))).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: t("ar", "common.retry") }))
    await waitFor(() => expect(screen.getByText(t("ar", "ask.error.invalidResponse"))).toBeTruthy())
    expect(useAsk.getState().busy).toBe(false)
  })
})

describe("knw-01 r8 / knw-02 sc5 source cards", () => {
  const sources = [
    card("islamqa:ar:6940", "islamqa", "6940"),
    card("islamqa:ar:6940:p2", "islamqa", "6940"),
    card("binbaz:ar:12", "binbaz", "12"),
  ]

  it("t20: two passages of one reference make one card; different references stay apart", async () => {
    stubFetch(async () => json({ ...base, answer: "نص تجريبي {{q:islamqa:ar:6940}} ثم {{q:islamqa:ar:6940:p2}}", sources }))
    renderAsk()
    fireEvent.click(screen.getByRole("button", { name: "ما معنى الشهادتين؟" }))
    await waitFor(() => expect(screen.getAllByText(/TEST_QUOTE islamqa:ar:6940/).length).toBeGreaterThan(0))
    const strips = Array.from(document.querySelectorAll("[data-slot=source-strip]"))
    expect(strips).toHaveLength(2)
    expect(strips.map((s) => s.getAttribute("href"))).toEqual(["https://islamqa.info/ar/answers/6940", "https://binbaz.org.sa/fatwas/12"])
    // both passages are still shown where their markers are
    expect(screen.getByText("TEST_QUOTE islamqa:ar:6940:p2")).toBeTruthy()
  })

  it("names islamqa by the site it came from in each language", async () => {
    for (const [locale, name] of [
      ["ar", "الإسلام سؤال وجواب"],
      ["en", "IslamQA"],
      ["tl", "IslamQA"],
    ] as const) {
      cleanup()
      useAsk.getState().reset()
      useDevice.getState().set({ locale })
      stubFetch(async () => json({ ...base, lang: locale, answer: "TEST {{q:islamqa:ar:6940}}", sources: [sources[0]] }))
      renderAsk()
      fireEvent.click(screen.getByRole("button", { name: t(locale, "ask.suggest.1") }))
      await waitFor(() => expect(document.querySelector("[data-slot=source-strip]")).toBeTruthy())
      const strip = document.querySelector("[data-slot=source-strip]")!
      expect(strip.textContent).toContain(name)
      expect(strip.getAttribute("href")).toBe("https://islamqa.info/ar/answers/6940")
    }
  })
})
