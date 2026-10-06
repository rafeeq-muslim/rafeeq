/**
 * PLT-17 R1/R2 (role screens at the top of «حسابي»): one test per example.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router"

import { translate, type Key } from "@/app/i18n"
import { useAuth, type Me as MeUser } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"

vi.mock("@/app/learning/useContent", () => ({
  useContent: () => ({ content: undefined, isLoading: false, isError: false, refetch: () => undefined, lessons: [], preview: false }),
}))

const { default: Me } = await import("@/app/pages/Me")

const ar = (k: Key) => translate("ar", k)

const user = (roles: string[]): MeUser => ({
  id: "u1",
  display_name: "أبو عبدالله",
  username: "abu-abdullah",
  roles,
  locale: "ar",
  two_factor_enabled: false,
  email_hint: null,
  gender: "m",
  languages: ["ar"],
})

const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/me"]}>
        <Routes>
          <Route path="*" element={<Me />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

/** Section headings in document order. */
const headings = () => screen.queryAllByRole("heading").map((h) => h.textContent ?? "")

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "not found" }), { status: 404, headers: { "Content-Type": "application/json" } })))
  useDevice.setState({ locale: "ar", onboarded: true, placementOffered: true })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useAuth.getState().set({ token: null, me: null, ready: true })
})

describe("PLT-17 R1: a staff member's screens come first in «حسابي»", () => {
  it("plt17_r1_mentor_sees_the_inbox_first_after_their_name", () => {
    useAuth.getState().set({ token: "t", me: user(["learner", "mentor"]), ready: true })
    wrap()
    const hs = headings()
    const work = hs.indexOf(ar("me.myWork"))
    expect(work).toBeGreaterThanOrEqual(0)
    // before every other section of «حسابي»
    for (const k of ["me.language", "me.theme", "me.notifications", "me.privacy"] as Key[]) {
      const i = hs.indexOf(ar(k))
      if (i >= 0) expect(work).toBeLessThan(i)
    }
    expect(screen.getByText(ar("role.mentorInbox"))).toBeTruthy()
  })

  it("plt17_r1_admin_with_several_roles_sees_all_their_links", () => {
    useAuth.getState().set({ token: "t", me: user(["learner", "admin", "org_coordinator"]), ready: true })
    wrap()
    for (const k of ["role.mentorInbox", "role.review", "role.referrals", "team.title", "role.admin", "org.role.link"] as Key[]) {
      expect(screen.getByText(ar(k))).toBeTruthy()
    }
  })

  it("plt17_r1_learner_sees_no_role_section", () => {
    useAuth.getState().set({ token: "t", me: user(["learner"]), ready: true })
    wrap()
    expect(screen.queryByText(ar("me.myWork"))).toBeNull()
    expect(screen.queryByText(ar("role.mentorInbox"))).toBeNull()
  })
})

describe("PLT-17 R2: the section and each link say what they open", () => {
  it("plt17_r2_reviewer_section_title_is_not_for_the_team", () => {
    useAuth.getState().set({ token: "t", me: user(["learner", "sharia_reviewer"]), ready: true })
    wrap()
    expect(screen.getByText(ar("me.myWork"))).toBeTruthy()
    expect(screen.queryByText(ar("me.team"))).toBeNull()
  })

  it("plt17_r2_team_link_is_named_like_the_team_screen", () => {
    useAuth.getState().set({ token: "t", me: user(["learner", "team"]), ready: true })
    wrap()
    expect(screen.getByText(ar("team.title"))).toBeTruthy()
    expect(screen.queryByText(ar("role.team"))).toBeNull()
    // a team member who isn't a mentor reaches urgent requests and reports by their own name
    expect(screen.getByText(ar("cmp.inbox.teamTitle"))).toBeTruthy()
    expect(screen.queryByText(ar("role.mentorInbox"))).toBeNull()
  })
})
