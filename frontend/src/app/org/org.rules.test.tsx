/**
 * Client-side examples of ORG-01..03 (PR #32). The server side is in
 * backend/tests/test_org0*.py.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes, useLocation } from "react-router"

import { translate, type Key } from "@/app/i18n"
import { useAuth, type Me as MeUser } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { myData, wipeDevice } from "@/app/lib/privacy"
import { useOrgLink } from "@/app/org/store"
import type { Dashboard, Mentors } from "@/app/org/api"

vi.mock("@/app/learning/useContent", () => ({
  useContent: () => ({ content: undefined, isLoading: false, isError: false, refetch: () => undefined, lessons: [], preview: false }),
}))

const { default: Welcome, linkOrgCode } = await import("@/app/pages/Welcome")
const { default: AppLayout } = await import("@/app/AppLayout")
const { OrgSection } = await import("@/app/org/OrgSection")
const { MentorRulesGate } = await import("@/app/companion/mentor/MentorRulesGate")
const { OrgDashboard, OrgMentors, fullLink } = await import("@/app/pages/roles/Org")
const { default: MentorHub } = await import("@/app/companion/MentorHub")

const ar_ = (k: Key, v?: Record<string, string | number>) => translate("ar", k, v)
const tl_ = (k: Key, v?: Record<string, string | number>) => translate("tl", k, v)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const CODE = "K7M2QX9P"
const OFFICE = "مكتب الدعوة بالروضة"
const INSTALL = "device-install-id-0001"

type Call = { url: string; method: string; body: unknown }
let calls: Call[] = []
function stubFetch(handler: (url: string, method: string, body: unknown) => Response | undefined = () => undefined) {
  calls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      const method = init?.method ?? "GET"
      calls.push({ url, method, body })
      return handler(url, method, body) ?? json({ detail: "not found" }, 404)
    }),
  )
}

const orgApiStub = (url: string, method: string) => {
  if (url === `/api/org/codes/${CODE}`) return json({ name: OFFICE, lang: "tl" })
  if (url === "/api/org/link" && method === "POST") return json({ linked: true, name: OFFICE, lang: "tl", linked_at: "2026-10-06T10:00:00Z" }, 201)
  if (url === "/api/org/link/remove") return new Response(null, { status: 204 })
  if (url === "/api/org/link/status") return json({ linked: true, name: OFFICE, lang: "tl", linked_at: "2026-10-06T10:00:00Z" })
  return undefined
}

const Probe = () => {
  const l = useLocation()
  return <p data-testid="at">{l.pathname + l.search}</p>
}

const wrap = (ui: React.ReactNode, entry = "/screen", path = "*") =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="/learn/placement" element={<Probe />} />
          <Route path="/" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

const ME = (roles: string[]): MeUser => ({
  id: "u1",
  display_name: "أبو عبدالله",
  username: "abu-1",
  roles,
  locale: "ar",
  two_factor_enabled: false,
  email_hint: null,
  gender: "m",
  languages: ["ar"],
})

beforeEach(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
  useDevice.setState({ locale: "ar", onboarded: true, installId: INSTALL, quickExit: false })
  useAuth.getState().set({ token: null, me: null, ready: true })
  useOrgLink.setState({ link: null })
  stubFetch(orgApiStub)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

// --- ORG-01 -------------------------------------------------------------------

describe("org-01-r1 one code per organisation and language, never per person", () => {
  it("org01_r1_the_shared_link_holds_only_the_language_and_the_code", () => {
    const link = fullLink({ code: CODE, lang: "tl", path: `/welcome?lang=tl&org=${CODE}` }, "https://rafeeq.example")
    const u = new URL(link)
    expect(u.pathname).toBe("/welcome")
    expect([...u.searchParams.keys()].sort()).toEqual(["lang", "org"])
  })

  it("org01_r1_opening_the_link_passes_on_the_language_and_code_only", () => {
    useDevice.setState({ onboarded: false })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[`/learn?lang=tl&org=${CODE}&name=Joseph&phone=0500000000`]}>
          <Routes>
            <Route path="/welcome" element={<Probe />} />
            <Route path="/" element={<AppLayout />}>
              <Route path="learn" element={<p>learn</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByTestId("at").textContent).toBe(`/welcome?lang=tl&org=${CODE}`)
    expect(linkOrgCode(new URLSearchParams("org=../../x"))).toBeNull()
  })

  it("org01_r1_the_request_to_rafeeq_carries_the_code_and_nothing_about_the_person", async () => {
    useDevice.setState({ onboarded: false })
    wrap(<Welcome />, `/welcome?lang=tl&org=${CODE}`, "/welcome")
    await waitFor(() => expect(calls.length).toBe(1))
    expect(calls[0]).toEqual({ url: `/api/org/codes/${CODE}`, method: "GET", body: undefined })
    expect(JSON.stringify(calls)).not.toContain(INSTALL)
  })
})

describe("org-01-r2 starts in the link's language, then asks once", () => {
  it("org01_r2_yes_links_and_the_first_day_continues_in_tagalog", async () => {
    useDevice.setState({ onboarded: false })
    wrap(<Welcome />, `/welcome?lang=tl&org=${CODE}`, "/welcome")
    await waitFor(() => expect(calls.length).toBe(1))
    fireEvent.click(screen.getByRole("button", { name: tl_("onb.intro.cta") }))
    expect(screen.getByRole("heading", { name: new RegExp(OFFICE) })).toBeTruthy()
    expect(screen.getByText(tl_("org.ask.body"))).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: tl_("org.ask.yes") }))
    await waitFor(() => expect(screen.getByText(tl_("onb.placement.title"))).toBeTruthy())
    const post = calls.find((c) => c.url === "/api/org/link")
    expect(post?.body).toEqual({ code: CODE, install_id: INSTALL })
    expect(useDevice.getState().locale).toBe("tl")
    expect(useOrgLink.getState().link?.name).toBe(OFFICE)
  })

  it("org01_r2_no_keeps_nothing_about_the_office", async () => {
    useDevice.setState({ onboarded: false })
    wrap(<Welcome />, `/welcome?lang=tl&org=${CODE}`, "/welcome")
    await waitFor(() => expect(calls.length).toBe(1))
    fireEvent.click(screen.getByRole("button", { name: tl_("onb.intro.cta") }))
    fireEvent.click(screen.getByRole("button", { name: tl_("org.ask.no") }))
    expect(screen.getByText(tl_("onb.placement.title"))).toBeTruthy()
    expect(calls.map((c) => c.url)).toEqual([`/api/org/codes/${CODE}`])
    expect(useOrgLink.getState().link).toBeNull()
    expect(JSON.stringify(localStorage) + JSON.stringify(useDevice.getState())).not.toMatch(new RegExp(`${CODE}|${OFFICE}`))
  })
})

describe("org-01-r3 a code typed in «حسابي» asks the same question", () => {
  it("org01_r3_daniel_types_the_platforms_code_and_says_yes", async () => {
    wrap(<OrgSection />)
    fireEvent.change(screen.getByLabelText(ar_("org.me.codeLabel")), { target: { value: CODE.toLowerCase() } })
    fireEvent.click(screen.getByRole("button", { name: ar_("org.me.check") }))
    await screen.findByRole("heading", { name: new RegExp(OFFICE) })
    fireEvent.click(screen.getByRole("button", { name: ar_("org.ask.yes") }))
    await waitFor(() => expect(useOrgLink.getState().link?.name).toBe(OFFICE))
    expect(calls.find((c) => c.url === "/api/org/link")?.body).toEqual({ code: CODE, install_id: INSTALL })
  })

  it("org01_r3_a_mistyped_code_says_check_the_code_and_names_no_organisation", async () => {
    wrap(<OrgSection />)
    fireEvent.change(screen.getByLabelText(ar_("org.me.codeLabel")), { target: { value: "K7M2QX9Q" } })
    fireEvent.click(screen.getByRole("button", { name: ar_("org.me.check") }))
    expect(await screen.findByText(ar_("org.me.invalid"))).toBeTruthy()
    expect(document.body.textContent).not.toContain(OFFICE)
    expect(calls.some((c) => c.url === "/api/org/link")).toBe(false)
  })
})

describe("org-01-r4 one organisation at a time, unlinked any time, nobody told", () => {
  it("org01_r4_joseph_unlinks_from_me", async () => {
    useOrgLink.setState({ link: { name: OFFICE, lang: "tl", linkedAt: "2026-10-06T10:00:00Z" } })
    wrap(<OrgSection />)
    expect(screen.getByText(new RegExp(OFFICE))).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: ar_("org.me.unlink") }))
    await waitFor(() => expect(useOrgLink.getState().link).toBeNull())
    expect(calls).toEqual([{ url: "/api/org/link/remove", method: "POST", body: { install_id: INSTALL } }])
  })

  it("org01_r4_erasing_the_device_removes_the_link_and_the_data_copy_includes_it", async () => {
    useOrgLink.setState({ link: { name: OFFICE, lang: "tl", linkedAt: "2026-10-06T10:00:00Z" } })
    const data = await myData()
    expect(data.organization_link).toMatchObject({ linked: true, name: OFFICE })
    expect(JSON.stringify(data.device)).toContain(OFFICE)
    calls = []
    await wipeDevice(vi.fn())
    expect(calls.some((c) => c.url === "/api/org/link/remove" && (c.body as { install_id: string }).install_id === INSTALL)).toBe(true)
  })
})

describe("org-01-r5 the link gives the organisation nothing over the learner", () => {
  it("org01_r5_a_linked_learner_s_mentor_screen_sends_nothing_about_the_organisation", async () => {
    useOrgLink.setState({ link: { name: OFFICE, lang: "tl", linkedAt: "2026-10-06T10:00:00Z" } })
    useAuth.getState().set({ token: "t", me: { ...ME(["learner"]), id: "l1" }, ready: true })
    stubFetch((url) =>
      url === "/api/mentors/mine"
        ? json({ mentor: null, share_progress: false, chosen_at: null, thread_id: null, gender: "m", languages: ["ar"] })
        : url.startsWith("/api/")
          ? json([])
          : undefined,
    )
    wrap(<MentorHub />)
    await screen.findByText(ar_("mentor.none"))
    expect(calls.length).toBeGreaterThan(0)
    expect(JSON.stringify(calls)).not.toMatch(new RegExp(`/api/org|${OFFICE}|${INSTALL}`))
  })
})

// --- ORG-02 -------------------------------------------------------------------

describe("org-02-r2 the mentor rules before the inbox", () => {
  it("org02_r2_abu_abdullah_reads_and_accepts_before_any_request", async () => {
    useAuth.getState().set({ token: "t", me: ME(["mentor"]), ready: true })
    let accepted = false
    stubFetch((url, method) => {
      if (url === "/api/inbox/rules" && method === "GET") return json({ required: !accepted, accepted_at: null, suspended: false })
      if (url === "/api/inbox/rules" && method === "POST") {
        accepted = true
        return json({ required: false, accepted_at: "2026-10-06T10:00:00Z", suspended: false })
      }
      return undefined
    })
    wrap(
      <MentorRulesGate>
        <p>inbox requests</p>
      </MentorRulesGate>,
    )
    expect(await screen.findByText(ar_("cmp.rules.r1"))).toBeTruthy()
    for (const k of ["cmp.rules.r2", "cmp.rules.r3", "cmp.rules.r4"] as const) expect(screen.getByText(ar_(k))).toBeTruthy()
    expect(screen.queryByText("inbox requests")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: ar_("cmp.rules.accept") }))
    expect(await screen.findByText("inbox requests")).toBeTruthy()
  })
})

const MENTORS: Mentors = {
  mentors: [
    { id: "m1", display_name: "أبو عبدالله", languages: ["ar"], gender: "m", state: "receiving", mentees: 8, capacity: 10, group_members: 23, group_limit: 25 },
  ],
  missing: [{ lang: "tl", gender: "f" }],
}

describe("org-02-r3/r4 load and missing pairs, never mentees", () => {
  it("org02_r3_the_coordinator_sees_8_of_10_and_23_of_25", async () => {
    stubFetch((url) => (url === "/api/org/o1/mentors" ? json(MENTORS) : url === "/api/org/o1/invites" ? json([]) : undefined))
    wrap(<OrgMentors orgId="o1" />)
    expect(await screen.findByText(ar_("org.mentors.mentees", { n: 8, cap: 10 }))).toBeTruthy()
    expect(screen.getByText(ar_("org.mentors.groups", { n: 23, cap: 25 }))).toBeTruthy()
    expect(ar_("org.mentors.mentees", { n: 8, cap: 10 })).toBe("يتابع 8 من 10")
  })

  it("org02_r4_missing_a_sister_in_tagalog", async () => {
    stubFetch((url) => (url === "/api/org/o1/mentors" ? json(MENTORS) : url === "/api/org/o1/invites" ? json([]) : undefined))
    wrap(<OrgMentors orgId="o1" />)
    expect(await screen.findByText("ينقصكم: مرشدة بالتاغالوغية")).toBeTruthy()
  })
})

describe("org-02-r5 a neutral notice to choose another mentor", () => {
  it("org02_r5_the_learner_is_told_to_choose_again_without_a_reason", async () => {
    useAuth.getState().set({ token: "t", me: { ...ME(["learner"]), id: "l1" }, ready: true })
    stubFetch((url) =>
      url === "/api/mentors/mine"
        ? json({ mentor: null, share_progress: false, chosen_at: null, thread_id: null, gender: "m", languages: ["ar"], mentor_ended: true })
        : url.startsWith("/api/")
          ? json([])
          : undefined,
    )
    wrap(<MentorHub />)
    expect(await screen.findByText(ar_("org.ended.title"))).toBeTruthy()
    for (const l of ["ar", "en", "tl"] as const) {
      const text = translate(l, "org.ended.title") + translate(l, "org.ended.body")
      expect(text).not.toMatch(/\{name\}|suspend|reason|سبب|أوقف|جهة/i)
    }
  })
})

// --- ORG-03 -------------------------------------------------------------------

const hidden = { n: null, pct: null }
const DASH: Dashboard = {
  as_of: "2026-12-20T09:00:00Z",
  lang: null,
  empty: false,
  linked: { n: 38 },
  statuses: { new: hidden, active: { n: 22, pct: 0.5789 }, at_risk: { n: 12, pct: 0.3158 }, lapsed: hidden, returning: hidden, none: hidden },
  returned: hidden,
  cohorts: [
    { month: "2026-11", size: { n: 15 }, d30: { due: true, n: 11, pct: 0.7333 }, d90: { due: false, n: null, pct: null } },
    { month: "2026-10", size: { n: 40 }, d30: { due: true, n: 22, pct: 0.55 }, d90: { due: false, n: null, pct: null } },
  ],
  languages: [{ lang: "tl", n: 35 }, { lang: "other", n: null }],
}

describe("org-03 dashboard", () => {
  it("org03_r1_a_new_office_sees_no_figures_yet_and_its_codes", async () => {
    stubFetch((url) =>
      url === "/api/org/o1/dashboard" ? json({ ...DASH, empty: true, cohorts: [], languages: [], codes: [{ code: CODE, lang: "tl", path: `/welcome?lang=tl&org=${CODE}` }] }) : undefined,
    )
    wrap(<OrgDashboard orgId="o1" />)
    expect(await screen.findByText(ar_("org.empty.title"))).toBeTruthy()
    expect(screen.getByText(CODE)).toBeTruthy()
  })

  it("org03_r2_four_returns_show_less_than_ten_and_no_rate", async () => {
    stubFetch((url) => (url === "/api/org/o1/dashboard" ? json(DASH) : undefined))
    wrap(<OrgDashboard orgId="o1" />)
    const returned = await screen.findByText(ar_("org.dash.returned"))
    const box = returned.closest("[data-slot=returned]") as HTMLElement
    expect(box.textContent).toContain("أقل من 10")
    expect(box.textContent).not.toMatch(/%/)
  })

  it("org03_r3_october_55_percent_and_90_days_not_yet", async () => {
    stubFetch((url) => (url === "/api/org/o1/dashboard" ? json(DASH) : undefined))
    const { container } = wrap(<OrgDashboard orgId="o1" />)
    await screen.findByText(ar_("org.dash.cohorts"))
    const oct = container.querySelector("[data-month='2026-10']") as HTMLElement
    expect(oct.textContent).toContain("55%")
    expect(oct.textContent).toContain(ar_("org.notYet"))
  })

  it("org03_r4_counts_and_shares_per_status", async () => {
    stubFetch((url) => (url === "/api/org/o1/dashboard" ? json(DASH) : undefined))
    const { container } = wrap(<OrgDashboard orgId="o1" />)
    await screen.findByText(ar_("org.dash.statuses"))
    expect((container.querySelector("[data-status=active]") as HTMLElement).textContent).toMatch(/22.*58%/)
    expect((container.querySelector("[data-status=lapsed]") as HTMLElement).textContent).toContain("أقل من 10")
  })

  it("org03_r5_tagalog_35_and_other_languages_under_10", async () => {
    stubFetch((url) => (url === "/api/org/o1/dashboard" ? json(DASH) : undefined))
    wrap(<OrgDashboard orgId="o1" />)
    expect(await screen.findByText(/Tagalog · 35/)).toBeTruthy()
    expect(screen.getByText(`${ar_("org.lang.other")} · أقل من 10`)).toBeTruthy()
  })
})

describe("Security review B-H1: an organisation's mentor invite carries a gender", () => {
  it("sec_b_h1_the_coordinator_states_the_volunteers_gender", async () => {
    stubFetch((url, method) =>
      url === "/api/org/o1/mentors"
        ? json(MENTORS)
        : url === "/api/org/o1/invites"
          ? method === "POST"
            ? json({ code: "MEN-AAAA0001", expires_at: null, used: false, gender: "f" }, 201)
            : json([])
          : undefined,
    )
    wrap(<OrgMentors orgId="o1" />)
    await screen.findByText(ar_("org.mentors.mentees", { n: 8, cap: 10 }))
    const create = screen.getByRole("button", { name: ar_("org.mentors.invite") }) as HTMLButtonElement
    expect(create.disabled).toBe(true)
    fireEvent.click(screen.getByRole("radio", { name: ar_("acct.female") }))
    expect(create.disabled).toBe(false)
    fireEvent.click(create)
    await waitFor(() => expect(calls.find((c) => c.url === "/api/org/o1/invites" && c.method === "POST")?.body).toEqual({ gender: "f" }))
  })
})
