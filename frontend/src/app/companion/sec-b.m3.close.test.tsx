/** Security review B-M3: only the assignee or the team is offered «end the conversation». */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router"

import { translate, type Key } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"

const { default: InboxThread } = await import("./mentor/InboxThread")

const ar = (k: Key) => translate("ar", k)
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })

const thread = (can_close: boolean) => ({
  id: "r1",
  handle: "سالم",
  is_guest: false,
  lang: "ar",
  kind: "human",
  topic: null,
  source: null,
  status: "open",
  preview: null,
  unread: 0,
  created_at: "2026-10-06T10:00:00Z",
  last_activity_at: "2026-10-06T10:00:00Z",
  assigned_to_me: can_close,
  can_reply: true,
  can_close,
  messages: [],
  referred: [],
})

beforeEach(() => useDevice.setState({ locale: "ar" }))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function openMenu(can_close: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => (String(url).endsWith("/api/inbox/requests/r1") ? json(thread(can_close)) : json([]))),
  )
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/inbox/r/r1"]}>
        <Routes>
          <Route path="/inbox/r/:id" element={<InboxThread />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  fireEvent.pointerDown(await screen.findByRole("button", { name: ar("cmp.thread.more") }), { button: 0, pointerType: "mouse" })
  await screen.findByRole("menuitem", { name: ar("cmp.inbox.urgent") })
}

describe("Security review B-M3: ending a conversation", () => {
  it("sec_b_m3_a_responder_who_does_not_hold_the_request_is_not_offered_to_end_it", async () => {
    await openMenu(false)
    expect(screen.queryByRole("menuitem", { name: ar("cmp.inbox.close") })).toBeNull()
  })

  it("sec_b_m3_its_assignee_is_offered_to_end_it", async () => {
    await openMenu(true)
    expect(screen.getByRole("menuitem", { name: ar("cmp.inbox.close") })).toBeTruthy()
  })
})
