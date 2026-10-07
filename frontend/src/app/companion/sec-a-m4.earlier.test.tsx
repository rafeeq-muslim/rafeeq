/**
 * Security review 2026-10-07 (A-M4): a long conversation opens with its last
 * 200 messages and loads earlier ones on demand, in both the learner's
 * screen and the responder's. Server side: backend/tests/test_sec_a_m4_threads.py.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router"

import { translate } from "@/app/i18n"
import { useAuth, type Me } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import HelpThread from "./HelpThread"
import InboxThread from "./mentor/InboxThread"

const KEYS = ["ar", "en", "tl"] as const
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
const at = (i: number) => new Date(Date.UTC(2026, 9, 1, 10, 0, i)).toISOString()

const learnerMsg = (i: number) => ({ id: `m${i}`, author: "mentor", name: "Abu Abdullah", body: `message ${i}`, created_at: at(i) })
const inboxMsg = (i: number) => ({ id: `m${i}`, author: "learner", name: null, mine: false, body: `message ${i}`, created_at: at(i) })

const base = {
  id: "t1",
  kind: "human",
  topic: null,
  source: null,
  status: "answered",
  created_at: at(0),
  last_activity_at: at(5),
  unread: 0,
  preview: null,
  responder_name: "Abu Abdullah",
  gender: "m",
  awaiting_same_gender: false,
  can_block: false,
  // responder's row
  handle: "Quiet Palm",
  is_guest: true,
  lang: "en",
  can_reply: true,
  referred: [],
}

let urls: string[] = []

/** Six messages on the server, served three at a time like the real pages of 200. */
function stub(msg: (i: number) => unknown) {
  urls = []
  const all = [1, 2, 3, 4, 5, 6]
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url)
      const before = new URL(url, "http://x").searchParams.get("before")
      const upTo = before ? Number(before.slice(1)) - 1 : 6
      const page = all.filter((i) => i <= upTo).slice(-3)
      if (/\/api\/(help|inbox)\/requests\/t1(\?|$)/.test(url)) return json({ ...base, messages: page.map(msg), has_earlier: page[0] > 1 })
      return json([])
    }),
  )
}

function open(path: string, element: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path.replace(":id", "t1")]}>
        <Routes>
          <Route path={path} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const shown = () => screen.queryAllByText(/^message \d$/).map((e) => e.textContent)

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  useDevice.getState().set({ locale: "en" })
  useAuth.getState().set({ token: null, me: null, ready: true })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe("A-M4: earlier messages on demand", () => {
  it("sec_a_m4_the_control_has_a_string_in_every_language", () => {
    for (const l of KEYS) expect(translate(l, "cmp.thread.earlier").length).toBeGreaterThan(3)
    expect(translate("ar", "cmp.thread.earlier")).not.toBe(translate("en", "cmp.thread.earlier"))
  })

  it("sec_a_m4_the_learner_loads_earlier_messages_until_none_are_left", async () => {
    stub(learnerMsg)
    open("/mentor/help/:id", <HelpThread />)
    await screen.findByText("message 6")
    expect(shown()).toEqual(["message 4", "message 5", "message 6"])

    fireEvent.click(screen.getByRole("button", { name: translate("en", "cmp.thread.earlier") }))
    await screen.findByText("message 1")
    expect(shown()).toEqual(["message 1", "message 2", "message 3", "message 4", "message 5", "message 6"])
    expect(urls).toContain("/api/help/requests/t1?before=m4")
    await waitFor(() => expect(screen.queryByRole("button", { name: translate("en", "cmp.thread.earlier") })).toBeNull())
  })

  it("sec_a_m4_a_short_conversation_shows_no_control", async () => {
    stub(learnerMsg)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ ...base, messages: [learnerMsg(1)], has_earlier: false })),
    )
    open("/mentor/help/:id", <HelpThread />)
    await screen.findByText("message 1")
    expect(screen.queryByRole("button", { name: translate("en", "cmp.thread.earlier") })).toBeNull()
  })

  it("sec_a_m4_the_responder_loads_earlier_messages_too", async () => {
    stub(inboxMsg)
    useAuth.getState().set({ token: "t", me: { id: "u1", display_name: "Abu Abdullah", roles: ["mentor"], gender: "m" } as unknown as Me, ready: true })
    open("/inbox/r/:id", <InboxThread />)
    await screen.findByText("message 6")
    expect(shown()).toHaveLength(3)
    fireEvent.click(screen.getByRole("button", { name: translate("en", "cmp.thread.earlier") }))
    await screen.findByText("message 1")
    expect(shown()).toHaveLength(6)
    expect(urls).toContain("/api/inbox/requests/t1?before=m4")
  })
})
