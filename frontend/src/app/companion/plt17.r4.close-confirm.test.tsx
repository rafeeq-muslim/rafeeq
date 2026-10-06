/** PLT-17 R4: ending a conversation from the mentor's inbox asks first. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router"

import { translate, type Key } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import type { InboxThread as Thread } from "./api"

const { default: InboxThread } = await import("./mentor/InboxThread")

const ar = (k: Key) => translate("ar", k)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const thread: Thread = {
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
  assigned_to_me: true,
  can_reply: true,
  messages: [],
  referred: [],
} as unknown as Thread

let closed: number
beforeEach(() => {
  closed = 0
  useDevice.setState({ locale: "ar" })
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/inbox/requests/r1/close") && init?.method === "POST") {
        closed += 1
        return json({ ...thread, status: "closed" })
      }
      if (String(url).endsWith("/api/inbox/requests/r1")) return json(thread)
      return json([])
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderThread() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/inbox/r/r1"]}>
        <Routes>
          <Route path="/inbox/r/:id" element={<InboxThread />} />
          <Route path="/inbox" element={<p>INBOX_LIST</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function openClose() {
  renderThread()
  const more = await screen.findByRole("button", { name: ar("cmp.thread.more") })
  fireEvent.pointerDown(more, { button: 0, pointerType: "mouse" })
  fireEvent.click(await screen.findByRole("menuitem", { name: ar("cmp.inbox.close") }))
}

describe("PLT-17 R4 ending a conversation asks first", () => {
  it("plt17_r4_closing_asks_before_anything_happens", async () => {
    await openClose()
    expect(await screen.findByRole("alertdialog")).toBeTruthy()
    expect(screen.getByText(ar("cmp.inbox.closeConfirmTitle"))).toBeTruthy()
    expect(closed).toBe(0)
  })

  it("plt17_r4_cancel_keeps_the_conversation_open", async () => {
    await openClose()
    fireEvent.click(await screen.findByRole("button", { name: ar("common.cancel") }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(closed).toBe(0)
    expect(screen.queryByText("INBOX_LIST")).toBeNull()
  })

  it("plt17_r4_confirm_ends_it_and_returns_to_the_inbox", async () => {
    await openClose()
    const dialog = await screen.findByRole("alertdialog")
    const confirm = Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === ar("cmp.inbox.close"))!
    fireEvent.click(confirm)
    await waitFor(() => expect(closed).toBe(1))
    expect(await screen.findByText("INBOX_LIST")).toBeTruthy()
  })
})
