/**
 * LRN-03 R6 in the review desk (audit 2026-10-06): the Sharia reviewer
 * reads samples of shown «لماذا؟» explanations and blocks the explanation for
 * one exercise; team members do not get the screen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router"

import { translate } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import ReviewDesk from "./ReviewDesk"
import type { Samples } from "./ExplanationSamples"

const ar = (k: Parameters<typeof translate>[1]) => translate("ar", k)
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
const SAMPLES: Samples = {
  items: [
    {
      id: "1",
      at: "2026-10-06T10:00:00Z",
      exercise_id: "u01-l3-e1",
      lang: "ar",
      text: "النية محلها القلب، فلا تُقال باللسان.",
      blocked: false,
      lesson_id: "u01-l3",
      lesson_title: "أتوضأ (1)",
      prompt: "أين محل النية؟",
    },
  ],
  blocks: [],
}
let calls: { url: string; method: string }[] = []

function stub() {
  calls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET" })
      if (url.startsWith("/api/learning/explanations/blocks/")) return json({ blocked: init?.method === "PUT" })
      if (url.startsWith("/api/learning/explanations")) return json(SAMPLES)
      if (url === "/api/review/queue") return json({ items: [], counts: { in_review: 0, returned: 0, approved: 0 } })
      return json({})
    }),
  )
}
const settle = () => act(async () => await new Promise((r) => setTimeout(r, 0)))
const desk = (path: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/review-desk/*" element={<ReviewDesk />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
const as = (roles: string[]) =>
  useAuth.setState({ token: "t", me: { id: "u", display_name: "م", username: "m", roles } as never })

beforeEach(() => {
  stub()
  useDevice.setState({ locale: "ar" })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useAuth.setState({ token: null, me: null } as never)
})

describe("lrn-03-r6 the reviewer's explanation samples", () => {
  it("lrn-03-r6: the reviewer opens the samples from the desk and reads each with its exercise", async () => {
    as(["sharia_reviewer"])
    desk("/review-desk")
    await settle()
    fireEvent.click(screen.getByRole("button", { name: ar("desk.explain.open") }))
    await settle()
    expect(await screen.findByText("النية محلها القلب، فلا تُقال باللسان.")).toBeTruthy()
    expect(screen.getByText(`${ar("desk.explain.exercise")}: أين محل النية؟`)).toBeTruthy()
    expect(calls.some((c) => c.url === "/api/learning/explanations?lang=ar&limit=50")).toBe(true)
  })

  it("lrn-03-r6: blocking one exercise sends the block for that exercise and language", async () => {
    as(["sharia_reviewer"])
    desk("/review-desk/explanations")
    await settle()
    fireEvent.click(await screen.findByRole("button", { name: ar("desk.explain.block") }))
    await settle()
    expect(calls).toContainEqual({ url: "/api/learning/explanations/blocks/u01-l3-e1/ar", method: "PUT" })
  })

  it("lrn-03-r6: a team member reading the desk has no link to the samples", async () => {
    as(["team"])
    desk("/review-desk")
    await settle()
    expect(screen.queryByRole("button", { name: ar("desk.explain.open") })).toBeNull()
  })
})
