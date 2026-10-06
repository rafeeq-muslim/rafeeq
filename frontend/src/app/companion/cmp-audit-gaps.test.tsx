/**
 * Client side of the CMP audit gaps (cmp-audit-gaps): «أريد إنسانًا» on
 * narrow screens (CMP-01 R1), guest requests moving at sign-in and sign-up
 * (CMP-01 R2 ex3), the team's sister/brother-per-language reminder (CMP-01
 * open question), responders reporting a learner (CMP-04 R1), undoing a
 * mentor's hide (CMP-04 R4 ex3), the author seeing his hidden message
 * (CMP-04 R5), and gender in «حسابي» for mentors and team members.
 * The server side is in backend/tests/test_cmp_audit_gaps.py.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router"

import { translate, type Key } from "@/app/i18n"
import { useAuth, type Me } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { useLearning } from "@/app/stores/learning"
import type { Content } from "@/app/learning/types"
import type { InboxMessage, QueueItem, ThreadMessage } from "./api"
import { ChatList } from "./Chat"
import { useCompanion } from "./store"

const content = {
  lang: "ar",
  preview: false,
  units: [{ id: "u1", order: 1, title: "U", lessons: ["l1"] }],
  lessons: {
    l1: {
      id: "l1",
      unit: "u1",
      order: 1,
      title: "L1",
      approved: true,
      cards: [{ id: "c1", text: "CARD" }],
      objectives: [{ id: "o1", text: "O1", cards: ["c1"] }],
      exercises: [
        { id: "e1", type: "choose", prompt: "PROMPT_E1", objectives: ["o1"], cards: ["c1"], options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], answer: "a" },
      ],
    },
  },
} as unknown as Content

vi.mock("@/app/learning/useContent", () => ({
  useContent: () => ({ content, isLoading: false, isError: false, refetch: () => undefined, lessons: Object.values(content.lessons), preview: true }),
}))

const { default: LessonPage } = await import("@/app/pages/Lesson")
const { default: Review } = await import("@/app/pages/Review")
const { ResponderGender } = await import("@/app/pages/Account")
const { onSignedIn } = await import("@/app/lib/sync")
const { learnerChatItem } = await import("./HelpThread")
const { inboxChatItem } = await import("./mentor/InboxThread")
const { ReportsQueue } = await import("./mentor/ReportsQueue")
const { ResponderCoverage } = await import("./mentor/ResponderCoverage")

const ar = (k: Key, v?: Record<string, string | number>) => translate("ar", k, v)
const t = ar as Parameters<typeof learnerChatItem>[1]
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

type Call = { url: string; method: string; body: unknown; headers: Record<string, string> }
let calls: Call[] = []
function stubFetch(handler: (url: string, method: string, body: unknown) => Response | undefined = () => undefined) {
  calls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      const method = init?.method ?? "GET"
      calls.push({ url, method, body, headers: (init?.headers ?? {}) as Record<string, string> })
      return handler(url, method, body) ?? json({ detail: "not found" }, 404)
    }),
  )
}

const wrap = (ui: React.ReactNode, entry = "/", path = "*") =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path={path} element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

const ME: Me = {
  id: "u1",
  display_name: "نخلة الهادئ",
  username: "calm-palm-42",
  roles: ["learner"],
  locale: "ar",
  two_factor_enabled: false,
  email_hint: null,
  gender: null,
  languages: ["ar"],
}
const GUEST_TOKEN = "g".repeat(43)

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  useDevice.getState().set({ locale: "ar" })
  useAuth.getState().set({ token: null, me: null, ready: true })
  useCompanion.getState().set({ helpToken: null, helpGender: null })
  stubFetch()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

// --- CMP-01 R1: «أريد إنسانًا» at 320–379px ------------------------------------

/** jsdom has no layout, so the check is on what decides visibility: the button
 * is never `display: none` at any width (no `hidden` class), it keeps its name,
 * and below 380px it becomes a 44px icon whose label is kept for screen readers. */
function expectReachableAtNarrowWidths() {
  const button = screen.getByRole("button", { name: ar("lesson.help") })
  const classes = button.className.split(/\s+/)
  expect(classes).not.toContain("hidden")
  expect(classes.some((c) => c.startsWith("min-[380px]:"))).toBe(false)
  expect(classes).toContain("max-[380px]:size-11")
  const label = within(button).getByText(ar("lesson.help"))
  expect(label.className).toBe("max-[380px]:sr-only")
  return button
}

describe("CMP-01 R1: the human is one tap away on narrow screens", () => {
  it("cmp01_r1_lesson_human_button_visible_below_380px", () => {
    wrap(<LessonPage />, "/learn/lesson/l1", "/learn/lesson/:lessonId")
    expectReachableAtNarrowWidths()
  })

  it("cmp01_r1_review_human_button_visible_below_380px", () => {
    const hourAgo = new Date(Date.now() - 2 * 3_600_000).toISOString()
    useLearning.setState({
      completed: { l1: { first: hourAgo, last: hourAgo, times: 1 } },
      mastery: { o1: { p: 0.4, seen: true, answered: true, lastAnswerAt: hourAgo, checksDone: 0 } },
    } as never)
    wrap(<Review />, "/review")
    expect(screen.getByText("PROMPT_E1")).toBeTruthy()
    expectReachableAtNarrowWidths()
  })
})

// --- CMP-01 R2 ex3: guest requests move at sign-in and sign-up -------------------

describe("CMP-01 R2 ex3: guest conversations move to the account when signing in", () => {
  it("cmp01_r2_ex3_sign_in_moves_guest_requests_without_opening_mentor_hub", async () => {
    stubFetch((url) => (url === "/api/help/claim" ? json({ moved: 1 }) : json({})))
    useCompanion.getState().set({ helpToken: GUEST_TOKEN })
    useAuth.getState().set({ token: "t", me: ME })
    await onSignedIn() // what sign-in and sign-up both call (Account.tsx)
    const claim = calls.find((c) => c.url === "/api/help/claim")
    expect(claim?.method).toBe("POST")
    expect(claim?.headers["X-Help-Token"]).toBe(GUEST_TOKEN)
    expect(useCompanion.getState().helpToken).toBeNull()
  })

  it("cmp01_r2_ex3_no_guest_token_means_no_claim", async () => {
    stubFetch(() => json({}))
    useAuth.getState().set({ token: "t", me: ME })
    await onSignedIn()
    expect(calls.some((c) => c.url === "/api/help/claim")).toBe(false)
  })
})

// --- CMP-01 open question: a sister and a brother per language --------------------

describe("CMP-01 open question: the team sees languages without a sister or a brother", () => {
  it("cmp01_open_question_uncovered_pairs_are_marked_for_the_team", async () => {
    const cells = [
      { lang: "ar", gender: "f", responders: 1, available: 1, covered: true },
      { lang: "ar", gender: "m", responders: 2, available: 2, covered: true },
      { lang: "en", gender: "f", responders: 0, available: 0, covered: false },
      { lang: "en", gender: "m", responders: 1, available: 1, covered: true },
      { lang: "tl", gender: "f", responders: 1, available: 0, covered: false },
      { lang: "tl", gender: "m", responders: 0, available: 0, covered: false },
    ]
    stubFetch((url) => (url === "/api/team/coverage" ? json({ cells, uncovered: 3, without_gender: 1 }) : undefined))
    useAuth.getState().set({ token: "t", me: { ...ME, roles: ["team"] } })
    wrap(<ResponderCoverage />)
    await screen.findByText(ar("cmp.gaps.coverage.missing", { count: "3" }))
    expect(screen.getAllByText(ar("cmp.gaps.coverage.nobody"))).toHaveLength(3)
    expect(screen.getByText(ar("cmp.gaps.coverage.paused", { count: "1" }))).toBeTruthy()
    expect(screen.getByText(ar("cmp.gaps.coverage.noGender", { count: "1" }))).toBeTruthy()
  })

  it("cmp01_open_question_hidden_from_learners", () => {
    useAuth.getState().set({ token: "t", me: ME })
    const { container } = wrap(<ResponderCoverage />)
    expect(container.textContent).toBe("")
    expect(calls.some((c) => c.url === "/api/team/coverage")).toBe(false)
  })
})

// --- CMP-04 R1 and R5 in the conversation views -----------------------------------

const msg = (over: Partial<InboxMessage>): InboxMessage => ({
  id: "m1",
  author: "learner",
  name: null,
  mine: false,
  body: "Lend me money",
  created_at: "2026-10-06T10:00:00Z",
  ...over,
})

describe("CMP-04 R1: the person answering can report the learner's message", () => {
  it("cmp04_r1_learner_message_has_report_action_for_responder", () => {
    const onReport = vi.fn()
    const item = inboxChatItem(msg({}), t, { name: "زائر 4821", canRefer: true, onRefer: vi.fn(), onReport })
    expect(item.actions?.map((a) => a.label)).toEqual([ar("cmp.referral.action"), ar("cmp.thread.report")])
    item.actions?.[1].onSelect()
    expect(onReport).toHaveBeenCalled()
  })

  it("cmp04_r1_report_stays_after_the_question_was_referred", () => {
    const item = inboxChatItem(msg({}), t, { name: "زائر 4821", canRefer: false, onRefer: vi.fn(), onReport: vi.fn() })
    expect(item.actions?.map((a) => a.label)).toEqual([ar("cmp.thread.report")])
  })

  it("cmp04_r1_responder_does_not_report_his_own_message", () => {
    const item = inboxChatItem(msg({ author: "mentor", mine: true }), t, { name: "", canRefer: true, onRefer: vi.fn(), onReport: vi.fn() })
    expect(item.actions).toBeUndefined()
  })
})

describe("CMP-04 R5: the author sees his hidden help message, marked for review", () => {
  it("cmp04_r5_learner_sees_own_hidden_message_marked", () => {
    const m: ThreadMessage = { id: "m1", author: "me", name: null, body: "Marry my sister", created_at: "2026-10-06T10:00:00Z", hidden: true }
    const item = learnerChatItem(m, t, vi.fn())
    expect(item.hidden).toBe(true)
    wrap(<ChatList items={[item]} />)
    expect(screen.getByText("Marry my sister")).toBeTruthy()
    expect(screen.getByText(`· ${ar("cmp.thread.hidden")}`)).toBeTruthy()
  })

  it("cmp04_r5_mentor_sees_own_hidden_message_marked", () => {
    const item = inboxChatItem(msg({ author: "mentor", mine: true, hidden: true, body: "Send me 100 riyals" }), t, {
      name: "",
      canRefer: true,
      onRefer: vi.fn(),
      onReport: vi.fn(),
    })
    wrap(<ChatList items={[item]} />)
    expect(screen.getByText(`· ${ar("cmp.thread.hidden")}`)).toBeTruthy()
  })
})

// --- CMP-04 R4 ex3: the team sees a mentor's hide and can undo it ------------------

const hiddenByMentor: QueueItem = {
  id: "r1",
  target_type: "group_message",
  target_id: "m1",
  reason: "mentor_hidden",
  priority: "normal",
  note: null,
  status: "actioned",
  created_at: "2026-10-06T10:00:00Z",
  body: "a fair question the mentor misread",
  author_name: "Joseph",
  author_id: "u2",
  hidden: true,
  place: "Riyadh Brothers",
  group_id: "g1",
}

describe("CMP-04 R4 ex3: a mentor's hide stays on record for the team", () => {
  it("cmp04_r4_ex3_team_sees_mentor_hidden_record_in_history_and_undoes_it", async () => {
    stubFetch((url, method) => {
      if (url === "/api/team/reports") return json([])
      if (url === "/api/team/reports?include_closed=true") return json([hiddenByMentor])
      if (url === "/api/team/reports/r1" && method === "POST") return json({ ...hiddenByMentor, hidden: false, status: "dismissed" })
      return undefined
    })
    useAuth.getState().set({ token: "t", me: { ...ME, roles: ["team"] } })
    wrap(<ReportsQueue />)
    await screen.findByText(ar("cmp.reports.empty"))
    fireEvent.click(screen.getByRole("radio", { name: ar("cmp.gaps.reports.history") }))
    await screen.findByText("a fair question the mentor misread")
    expect(screen.getByText(ar("cmp.reason.mentor_hidden"))).toBeTruthy()
    expect(screen.queryByRole("button", { name: ar("cmp.reports.keep") })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: ar("cmp.gaps.reports.undo") }))
    await waitFor(() => expect(calls.some((c) => c.url === "/api/team/reports/r1" && c.method === "POST")).toBe(true))
    expect(calls.find((c) => c.url === "/api/team/reports/r1")?.body).toEqual({ action: "restore" })
  })
})

// --- Gender in «حسابي» for mentors and team members -----------------------------

describe("CMP gaps: mentors and team members set their gender in «حسابي»", () => {
  it("cmp_team_member_sets_gender_once_in_account", async () => {
    const team = { ...ME, roles: ["team"] }
    stubFetch((url, method, body) => (url === "/api/me" && method === "PATCH" ? json({ ...team, ...(body as object) }) : undefined))
    useAuth.getState().set({ token: "t", me: team })
    wrap(<ResponderGender me={team} />)
    fireEvent.click(screen.getByRole("radio", { name: ar("acct.female") }))
    fireEvent.click(screen.getByRole("button", { name: ar("cmp.gaps.gender.save") }))
    await waitFor(() => expect(useAuth.getState().me?.gender).toBe("f"))
    expect(calls.find((c) => c.url === "/api/me")?.body).toEqual({ gender: "f" })
  })

  it("cmp_mentor_gender_once_set_shows_how_to_change_it", () => {
    const mentor = { ...ME, roles: ["mentor"], gender: "m" }
    wrap(<ResponderGender me={mentor} />)
    expect(screen.getByText(ar("cmp.gaps.gender.locked"))).toBeTruthy()
    expect(screen.queryByRole("radio")).toBeNull()
  })

  it("cmp_learner_account_has_no_responder_gender_field", () => {
    const { container } = wrap(<ResponderGender me={ME} />)
    expect(container.textContent).toBe("")
  })
})
