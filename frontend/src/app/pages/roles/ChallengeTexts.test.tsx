/**
 * MOT-06 R3 in the review desk: the Sharia reviewer lists mentors' pending
 * free-text goals (text, language, date), approves or returns them with a
 * reason; team members and admins without the role get no list and no
 * buttons (the server refuses them too).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router"

import { translate } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import ReviewDesk from "./ReviewDesk"
import type { PendingText } from "./ChallengeTexts"

const ar = (k: Parameters<typeof translate>[1], v?: Record<string, string>) => translate("ar", k, v)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const MOSQUE = "تعرّف على مسجد قريب من سكنك"
const FAJR = "Pray fajr in the mosque every day"
let pending: PendingText[] = []
let calls: { url: string; method: string; body?: unknown }[] = []

function stub() {
  pending = [
    { id: "c1", text: MOSQUE, text_lang: "ar", created_at: "2026-10-06T10:00:00Z" },
    { id: "c2", text: FAJR, text_lang: "en", created_at: "2026-10-06T11:00:00Z" },
  ]
  calls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ url, method: init?.method ?? "GET", body })
      if (url === "/api/challenges/pending") return json(pending)
      const m = url.match(/^\/api\/challenges\/(\w+)\/review$/)
      if (m) {
        const item = pending.find((p) => p.id === m[1])
        pending = pending.filter((p) => p.id !== m[1])
        return json(item)
      }
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
const as = (roles: string[]) => useAuth.setState({ token: "t", me: { id: "u", display_name: "م", username: "m", roles } as never })

beforeEach(() => {
  stub()
  useDevice.setState({ locale: "ar" })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useAuth.setState({ token: null, me: null } as never)
})

describe("mot-06-r3 challenge texts in the review desk", () => {
  it("mot-06-r3: the reviewer sees the count on the desk and opens the pending texts with language and date", async () => {
    as(["sharia_reviewer"])
    desk("/review-desk")
    await settle()
    const entry = screen.getByRole("button", { name: new RegExp(ar("desk.ch.open")) })
    expect((await screen.findByLabelText(ar("desk.ch.waiting", { n: "2" }))).textContent).toBe("2")
    fireEvent.click(entry)
    await settle()
    expect((await screen.findByText(MOSQUE)).getAttribute("lang")).toBe("ar")
    const fajr = screen.getByText(FAJR)
    expect(fajr.getAttribute("lang")).toBe("en")
    expect(fajr.getAttribute("dir")).toBe("ltr")
    expect(screen.getByText("English", { exact: false })).toBeTruthy()
    expect(screen.getAllByRole("button", { name: ar("desk.ch.approve") })).toHaveLength(2)
  })

  it("mot-06-r3 ex1: approving sends the decision and the text leaves the list", async () => {
    as(["sharia_reviewer"])
    desk("/review-desk/challenges")
    await settle()
    fireEvent.click((await screen.findAllByRole("button", { name: ar("desk.ch.approve") }))[0])
    await settle()
    expect(calls).toContainEqual({ url: "/api/challenges/c1/review", method: "POST", body: { approve: true } })
    await waitFor(() => expect(screen.queryByText(MOSQUE)).toBeNull())
    expect(screen.getByText(FAJR)).toBeTruthy()
  })

  it("mot-06-r3 ex2: returning needs a reason, sends it, and the text leaves the list", async () => {
    as(["sharia_reviewer"])
    desk("/review-desk/challenges")
    await settle()
    fireEvent.click((await screen.findAllByRole("button", { name: ar("desk.ch.return") }))[1])
    const send = screen.getByRole("button", { name: ar("desk.sendReturn") }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(ar("desk.ch.reason")), { target: { value: " عبادة؛ اختر هدفًا تعليميًا " } })
    fireEvent.click(send)
    await settle()
    expect(calls).toContainEqual({ url: "/api/challenges/c2/review", method: "POST", body: { approve: false, reason: "عبادة؛ اختر هدفًا تعليميًا" } })
    await waitFor(() => expect(screen.queryByText(FAJR)).toBeNull())
    expect(screen.getByText(MOSQUE)).toBeTruthy()
  })

  it("mot-06-r3: a team member (or an admin without the role) gets no entry, no list and no buttons", async () => {
    for (const roles of [["team"], ["admin"]]) {
      as(roles)
      desk("/review-desk")
      await settle()
      expect(screen.queryByRole("button", { name: new RegExp(ar("desk.ch.open")) })).toBeNull()
      cleanup()
      desk("/review-desk/challenges")
      await settle()
      expect(screen.getByText(ar("desk.readOnly"))).toBeTruthy()
      expect(screen.queryByRole("button", { name: ar("desk.ch.approve") })).toBeNull()
      cleanup()
    }
    expect(calls.some((c) => c.url.startsWith("/api/challenges"))).toBe(false)
  })
})
