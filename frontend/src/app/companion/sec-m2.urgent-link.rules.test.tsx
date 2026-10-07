/**
 * Security review 2026-10-07, B-M2: opening a link never creates an urgent
 * request. The urgent screen sends at once only after the tap on the
 * assistant's danger panel (router state); a bare `?kind=urgent` link shows
 * the same guidance and helplines with the button, and waits for the tap.
 * Danger still reaches a human in one tap (rules.md §2.8).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes, useLocation } from "react-router"

import { translate } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import HelpScreen from "./HelpScreen"
import { URGENT_START, tappedInApp } from "./urgentStart"

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const created = {
  request: {
    id: "r1",
    kind: "urgent",
    topic: null,
    source: "ask",
    status: "open",
    created_at: "2026-10-07T10:00:00Z",
    last_activity_at: "2026-10-07T10:00:00Z",
    unread: 0,
    preview: null,
    responder_name: null,
    gender: null,
    awaiting_same_gender: false,
  },
  guest_token: "g".repeat(43),
}

let posts: Record<string, unknown>[] = []

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>
}

function open(entry: Parameters<typeof MemoryRouter>[0]["initialEntries"]) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={entry}>
        <Where />
        <Routes>
          <Route path="/mentor/help" element={<HelpScreen />} />
          <Route path="/mentor/help/:id" element={<p>thread</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const LINK = "/mentor/help?kind=urgent&from=ask&ask=a1"
const cta = () => screen.getByRole("button", { name: translate("ar", "human.danger.cta") })

beforeEach(() => {
  useDevice.getState().set({ locale: "ar" })
  posts = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/help/requests" && init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)))
        return json(created, 201)
      }
      return json([])
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("sec b-m2: an urgent request needs a tap", () => {
  it("sec_m2_a_bare_urgent_link_shows_the_button_and_sends_nothing", async () => {
    open([LINK])
    // the guidance and the verified helplines are there at once, as before
    expect(screen.getByRole("alert").textContent).toContain("اتصل بالطوارئ في بلدك")
    expect(document.querySelector("[data-slot=helplines]")).not.toBeNull()
    expect(cta()).toBeTruthy()
    await new Promise((r) => setTimeout(r, 30))
    expect(posts).toEqual([])
    expect(screen.getByTestId("where").textContent).toBe("/mentor/help")
  })

  it("sec_m2_one_tap_on_the_link_screen_reaches_a_human", async () => {
    open([LINK])
    fireEvent.click(cta())
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/mentor/help/r1"))
    expect(posts).toEqual([{ kind: "urgent", source: "ask", lang: "ar", ask_id: "a1" }]) // no question text (rules.md §2.9)
  })

  it("sec_m2_the_tap_on_the_danger_panel_still_opens_the_conversation_at_once", async () => {
    open([{ pathname: "/mentor/help", search: "?kind=urgent&from=ask&ask=a1", state: URGENT_START }])
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/mentor/help/r1"))
    expect(posts).toHaveLength(1)
  })

  it("sec_m2_only_the_exact_in_app_state_counts", () => {
    expect(tappedInApp(URGENT_START)).toBe(true)
    for (const s of [null, undefined, "urgentStart", { urgentStart: "true" }, { urgentStart: 1 }, {}]) expect(tappedInApp(s)).toBe(false)
  })
})
