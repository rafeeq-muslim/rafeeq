/**
 * PLT-17 R6 (removing a member from the reports list asks first) and R7 (the
 * team dashboard says when it fails to load, has section navigation, and keeps
 * reports in one place: the inbox's «البلاغات» tab).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"

import { translate, type Key } from "@/app/i18n"
import { useAuth, type Me } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import type { QueueItem } from "@/app/companion/api"

vi.mock("@/app/learning/useContent", () => ({
  useContent: () => ({ content: { lang: "ar", units: [], lessons: {} }, isLoading: false, isError: false, refetch: () => undefined, lessons: [], preview: false }),
}))

const { ReportsQueue } = await import("@/app/companion/mentor/ReportsQueue")
const { default: Team } = await import("./Team")

const ar = (k: Key, v?: Record<string, string | number>) => translate("ar", k, v)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

type Call = { url: string; method: string; body: unknown }
let calls: Call[] = []
function stubFetch(handler: (url: string, method: string) => Response | undefined) {
  calls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET"
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      return handler(url, method) ?? json({ detail: "not found" }, 404)
    }),
  )
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

const TEAM: Me = {
  id: "t1",
  display_name: "فريق",
  username: "team-1",
  roles: ["team"],
  locale: "ar",
  two_factor_enabled: false,
  email_hint: null,
  gender: null,
  languages: ["ar"],
}

const sale: QueueItem = {
  id: "r1",
  target_type: "group_message",
  target_id: "m1",
  reason: "money",
  priority: "high",
  note: null,
  status: "open",
  created_at: new Date().toISOString(),
  body: "أبيع لكم",
  author_name: "سالم",
  author_id: "u9",
  hidden: true,
  place: null,
  group_id: "g1",
}

beforeEach(() => {
  useDevice.getState().set({ locale: "ar" })
  useAuth.getState().set({ token: "t", me: TEAM, ready: true })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("PLT-17 R6: removing a member from the reports list asks first", () => {
  const reports = () =>
    stubFetch((url, method) => {
      if (url === "/api/team/reports") return json([sale])
      if (url === "/api/team/reports/r1" && method === "POST") return json({ ...sale, status: "actioned" })
      return undefined
    })

  it("plt17_r6_remove_shows_a_confirm_naming_the_member_and_acts_only_after_it", async () => {
    reports()
    wrap(<ReportsQueue />)
    fireEvent.click(await screen.findByRole("button", { name: ar("cmp.reports.remove") }))
    expect(await screen.findByText(ar("plt17.reports.removeTitle", { name: "سالم" }))).toBeTruthy()
    expect(calls.some((c) => c.method === "POST")).toBe(false)
    const dialog = await screen.findByRole("alertdialog")
    fireEvent.click(Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === ar("cmp.reports.remove"))!)
    await waitFor(() => expect(calls.find((c) => c.url === "/api/team/reports/r1" && c.method === "POST")?.body).toEqual({ action: "remove_member" }))
  })

  it("plt17_r6_cancel_keeps_the_member", async () => {
    reports()
    wrap(<ReportsQueue />)
    fireEvent.click(await screen.findByRole("button", { name: ar("cmp.reports.remove") }))
    fireEvent.click(await screen.findByRole("button", { name: ar("plt17.reports.removeCancel") }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(calls.some((c) => c.method === "POST")).toBe(false)
  })
})

describe("PLT-17 R7: the team dashboard", () => {
  it("plt17_r7_server_down_shows_could_not_load_and_retry", async () => {
    let up = false
    stubFetch((url) => (url.startsWith("/api/team/indicators") ? (up ? undefined : json({ detail: "down" }, 503)) : undefined))
    wrap(<Team />)
    expect(await screen.findByText(ar("plt17.team.loadErrorTitle"))).toBeTruthy()
    const before = calls.filter((c) => c.url.startsWith("/api/team/indicators")).length
    up = true
    fireEvent.click(screen.getByRole("button", { name: ar("common.retry") }))
    await waitFor(() => expect(calls.filter((c) => c.url.startsWith("/api/team/indicators")).length).toBeGreaterThan(before))
  })

  it("plt17_r7_sections_are_reachable_without_scrolling_the_whole_page", () => {
    stubFetch(() => undefined)
    wrap(<Team />)
    const nav = screen.getByRole("navigation", { name: ar("plt17.team.sections") })
    const coverage = Array.from(nav.querySelectorAll("a")).find((a) => a.textContent === ar("plt17.team.nav.coverage"))
    expect(coverage?.getAttribute("href")).toBe("#coverage-title")
    expect(nav.querySelectorAll("a").length).toBe(6)
  })

  it("plt17_r7_reports_live_in_one_place_the_inbox_tab", () => {
    stubFetch(() => undefined)
    wrap(<Team />)
    expect(screen.queryByRole("radio", { name: ar("cmp.gaps.reports.history") })).toBeNull() // no second queue here
    expect(screen.getByRole("link", { name: ar("plt17.team.reportsOpen") }).getAttribute("href")).toBe("/inbox?tab=reports")
  })
})
