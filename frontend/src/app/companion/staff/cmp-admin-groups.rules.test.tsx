/**
 * CMP-05 R8/R9 and CMP-02 R8 (owner decisions 2026-10-10): the team's group
 * list puts groups needing a mentor first and flags them; assigning offers the
 * server's candidates and sends the chosen one; a member of a group waiting
 * for a mentor reads but has no composer; the team sees an escalated thread
 * whole, told so, and «end the conversation» becomes «end the escalation».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router"

import { translate, type Key } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"

const { default: StaffGroups, StaffGroupsSection } = await import("./StaffGroups")
const { default: InboxThread } = await import("../mentor/InboxThread")
const { default: GroupPage } = await import("../GroupPage")

const ar = (k: Key, v?: Record<string, string | number>) => translate("ar", k, v)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const group = (over: Record<string, unknown>) => ({
  id: "g1",
  name: "إخوة الرياض",
  lang: "en",
  gender: "m",
  capacity: 10,
  members_count: 6,
  mentor_id: "m1",
  mentor_name: "أبو عبدالله",
  state: "active",
  created_at: "2026-10-01T10:00:00Z",
  can_read: true,
  ...over,
})

function wrap(ui: React.ReactNode, path: string, route: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useDevice.setState({ locale: "ar" })
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("CMP-05 R8/R9: the team's group list", () => {
  it("cmp05_r9_groups_needing_a_mentor_are_flagged_at_the_top", async () => {
    const rows = [group({ id: "g1", state: "needs_mentor" }), group({ id: "g2", name: "أخوات جدة", gender: "f", state: "active" })]
    vi.stubGlobal("fetch", vi.fn(async () => json(rows)))
    wrap(<StaffGroupsSection />, "/admin", "/admin")
    const links = await screen.findAllByRole("link")
    expect(links[0].getAttribute("data-group-state")).toBe("needs_mentor")
    expect(within(links[0]).getByText(ar("cmp.mod.state.needs_mentor"))).toBeTruthy()
    expect(within(screen.getByRole("status")).getByText(ar("cmp.mod.needsBody"))).toBeTruthy() // the alert above the list
    expect(screen.queryByText(/join/i)).toBeNull()
  })
})

describe("CMP-05 R8: assigning a mentor", () => {
  it("cmp05_r8_the_chosen_candidate_is_sent_and_only_server_candidates_are_offered", async () => {
    const calls: { url: string; method: string; body?: string }[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url)
        calls.push({ url: u, method: init?.method ?? "GET", body: init?.body as string | undefined })
        if (u.endsWith("/candidates")) return json([{ id: "y1", display_name: "يوسف", places_used: 10, places_left: 15 }])
        if (u.endsWith("/mentor")) return json(group({ state: "active", mentor_name: "يوسف" }))
        if (u.endsWith("/messages")) return json([])
        return json(group({ state: "needs_mentor" }))
      }),
    )
    wrap(<StaffGroups />, "/staff-groups/g1", "/staff-groups/*")
    fireEvent.click(await screen.findByRole("button", { name: ar("cmp.mod.assign") }))
    fireEvent.click(await screen.findByRole("button", { name: /يوسف/ }))
    fireEvent.click(await screen.findByRole("button", { name: ar("cmp.mod.assignOk") }))
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.url.endsWith("/api/staff/groups/g1/mentor"))).toBe(true))
    const put = calls.find((c) => c.method === "PUT")!
    expect(JSON.parse(put.body!)).toEqual({ mentor_id: "y1" })
  })

  it("cmp05_r8_staff_of_the_other_gender_manage_without_reading_the_chat", async () => {
    const fetcher = vi.fn(async (url: string) => (String(url).endsWith("/messages") ? json([]) : json(group({ can_read: false }))))
    vi.stubGlobal("fetch", fetcher)
    wrap(<StaffGroups />, "/staff-groups/g1", "/staff-groups/*")
    expect(await screen.findByText(ar("cmp.mod.cannotRead"))).toBeTruthy()
    expect(fetcher.mock.calls.some(([u]) => String(u).endsWith("/messages"))).toBe(false)
  })
})

describe("CMP-05 R9: a member of a group waiting for a mentor", () => {
  it("cmp05_r9_reads_and_is_told_a_mentor_is_being_arranged_with_no_composer", async () => {
    useAuth.setState({ token: "t", me: { id: "u1", roles: ["learner"], gender: "m" } as never })
    const g = { ...group({ state: "needs_mentor" }), role: "member", join_code: null, members: [] }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url)
        if (u.endsWith("/api/groups/mine")) return json([g])
        if (u.endsWith("/messages")) return json([{ id: "m1", author_id: "x", author_name: "دانيال", from_mentor: false, mine: false, hidden: false, body: "السلام عليكم", created_at: "2026-10-01T10:00:00Z" }])
        if (u.endsWith("/challenge")) return json(null)
        if (u.endsWith("/api/groups/g1")) return json(g)
        return json({})
      }),
    )
    wrap(<GroupPage />, "/mentor/group", "/mentor/group")
    expect(await screen.findByText(ar("cmp.mod.memberNotice.needs_mentor"))).toBeTruthy()
    expect(await screen.findByText("السلام عليكم")).toBeTruthy()
    expect(screen.queryByPlaceholderText(ar("cmp.group.placeholder"))).toBeNull()
  })
})

describe("CMP-02 R8: an escalated private thread for the team", () => {
  const thread = {
    id: "r1",
    handle: "جوزيف",
    is_guest: false,
    lang: "en",
    kind: "urgent",
    topic: null,
    source: "mentor",
    status: "open",
    preview: null,
    unread: 0,
    created_at: "2026-10-06T10:00:00Z",
    last_activity_at: "2026-10-06T10:00:00Z",
    assigned_to_me: false,
    can_reply: true,
    can_close: true,
    escalated: true,
    messages: [
      { id: "a", author: "learner", name: null, mine: false, body: "قبل التحويل", created_at: "2026-10-06T10:00:00Z", hidden: false },
      { id: "b", author: "learner", name: null, mine: false, body: "بعد التحويل", created_at: "2026-10-06T11:00:00Z", hidden: false },
    ],
    referred: [],
  }

  it("cmp02_r8_the_team_sees_the_whole_thread_is_told_so_and_ends_the_escalation", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).endsWith("/api/inbox/requests/r1") ? json(thread) : json([]))))
    wrap(<InboxThread />, "/inbox/r/r1", "/inbox/r/:id")
    expect(await screen.findByText(ar("cmp.mod.escalatedHint"))).toBeTruthy()
    expect(screen.getByText("قبل التحويل")).toBeTruthy()
    expect(screen.getByText("بعد التحويل")).toBeTruthy()
    fireEvent.pointerDown(screen.getAllByRole("button", { name: ar("cmp.thread.more") })[0], { button: 0, pointerType: "mouse" })
    expect(await screen.findByRole("menuitem", { name: ar("cmp.mod.endEscalation") })).toBeTruthy()
    expect(screen.queryByRole("menuitem", { name: ar("cmp.inbox.close") })).toBeNull()
  })
})
