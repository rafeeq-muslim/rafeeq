/**
 * CMP-03 R4 (cmp-03-r4-ended-link): a former mentor's thread stays readable,
 * says where new words go (never «اكتب لتفتحها من جديد»), and the screen
 * follows the message to the thread it reached. Server side:
 * backend/tests/test_cmp03_r4_ended_link.py.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router"

import { translate } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import HelpThread from "./HelpThread"

const ar = (k: Parameters<typeof translate>[1]) => translate("ar", k)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const summary = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "mentor",
  topic: null,
  source: "mentor",
  status: "closed",
  created_at: "2026-10-01T10:00:00Z",
  last_activity_at: "2026-10-01T10:00:00Z",
  unread: 0,
  preview: null,
  responder_name: "Abu Abdullah",
  gender: "m",
  awaiting_same_gender: false,
  ...extra,
})

const thread = (id: string, extra: Record<string, unknown> = {}) => ({
  ...summary(id, extra),
  messages: [{ id: "m1", author: "mentor", name: "Abu Abdullah", body: "Wa alaykum salam", created_at: "2026-10-01T10:00:00Z" }],
  can_block: true,
})

function stub(old: Record<string, unknown>, wentTo: Record<string, unknown>) {
  const posted: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/help/requests/old" && init?.method === "POST") return json({}, 404)
      if (url === "/api/help/requests/old/messages") {
        posted.push(url)
        return json(wentTo, 201)
      }
      if (url === "/api/help/requests/old") return json(old)
      if (url.startsWith("/api/help/requests/")) return json(thread(url.split("/").pop()!, { kind: "human", status: "open", link_ended: false }))
      return json({ detail: "x" }, 404)
    }),
  )
  return posted
}

function open() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/mentor/help/old"]}>
        <Routes>
          <Route path="/mentor/help/:id" element={<HelpThread />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function send(text: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } })
  fireEvent.click(screen.getByRole("button", { name: ar("cmp.help.sendAria") }))
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  useDevice.getState().set({ locale: "ar" })
  useAuth.getState().set({ token: null, me: null, ready: true })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe("CMP-03 R4: a former mentor's thread", () => {
  it("cmp03_r4_ended_thread_is_readable_and_never_promises_reopening", async () => {
    stub(thread("old", { link_ended: true }), summary("new"))
    open()
    await screen.findByText("Wa alaykum salam")
    expect(screen.getByText(ar("cmp.thread.endedNote"))).toBeTruthy()
    expect(screen.queryByText(ar("cmp.thread.closedNote"))).toBeNull()
  })

  it("cmp03_r4_writing_follows_the_message_to_where_it_went", async () => {
    const posted = stub(thread("old", { link_ended: true }), summary("new", { kind: "human", status: "open", source: null }))
    open()
    await screen.findByText("Wa alaykum salam")
    await send("Back again")
    await waitFor(() => expect(posted).toHaveLength(1))
    // The new conversation opens in place of the old one.
    expect(await screen.findByText(ar("cmp.help.waiting"))).toBeTruthy()
    expect(screen.queryByText(ar("cmp.thread.endedNote"))).toBeNull()
  })

  it("cmp03_r4_a_live_closed_thread_keeps_the_reopen_note", async () => {
    stub(thread("old", { link_ended: false }), summary("old", { status: "open" }))
    open()
    await screen.findByText("Wa alaykum salam")
    expect(screen.getByText(ar("cmp.thread.closedNote"))).toBeTruthy()
    expect(screen.queryByText(ar("cmp.thread.endedNote"))).toBeNull()
  })
})
