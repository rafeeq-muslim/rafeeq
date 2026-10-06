/**
 * Client-side examples of CMP-08 «التقديم كمرشد»
 * (docs/domains/companion/features/CMP-08-mentor-application.md). The server
 * side is in backend/tests/test_cmp08_mentor_application.py. Contacts here
 * are made up (example.com).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes, useLocation } from "react-router"

import { LOCALES, translate, type Key } from "@/app/i18n"
import { appUrl } from "@/app/lib/base"
import { useAuth, type Me as MeUser } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { useOrgLink } from "@/app/org/store"
import type { Application } from "@/app/companion/MentorApplications"
import landingHtml from "../../../public/landing/index.html?raw"
import landingJs from "../../../public/landing/landing.js?raw"

vi.mock("@/app/learning/useContent", () => ({
  useContent: () => ({ content: undefined, isLoading: false, isError: false, refetch: () => undefined, lessons: [], preview: false }),
}))

const { default: MentorApply, validContact, ABOUT_MAX } = await import("@/app/companion/MentorApply")
const { ApplicationsList, TEAM_APPLICATIONS } = await import("@/app/companion/MentorApplications")
const { default: Welcome } = await import("@/app/pages/Welcome")
const { default: Me } = await import("@/app/pages/Me")
const { Create } = await import("@/app/pages/Account")
const { default: Privacy, POLICY_SECTIONS, POLICY_REVISED_APPLY } = await import("@/app/pages/Privacy")

const ar_ = (k: Key, v?: Record<string, string | number>) => translate("ar", k, v)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const EMAIL = "volunteer@example.com"
const ORG_BASE = "/api/org/o1/mentor-applications"

type Call = { url: string; method: string; body: Record<string, unknown> | undefined }
let calls: Call[] = []
function stubFetch(handler: (url: string, method: string) => Response | undefined = () => undefined) {
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
const received = (url: string, method: string) =>
  url === "/api/mentor-applications" && method === "POST" ? json({ received: true, keep_days: 90 }, 201) : undefined

const Probe = () => {
  const l = useLocation()
  return <p data-testid="at">{l.pathname + l.search}</p>
}
const at = () => screen.findByTestId("at").then((e) => e.textContent)

const wrap = (ui: React.ReactNode, entry = "/screen", path = "/screen") =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

const ME = (roles: string[], gender: string | null = "f"): MeUser => ({
  id: "u1",
  display_name: "أم يوسف",
  username: "um-1",
  roles,
  locale: "ar",
  two_factor_enabled: false,
  email_hint: null,
  gender,
  languages: ["ar"],
})

const APP = (over: Partial<Application> = {}): Application => ({
  id: "a1",
  display_name: "أم يوسف",
  gender: "f",
  languages: ["ar", "tl"],
  locale: "ar",
  place: "الرياض",
  about: "أتابع المسلمات الجديدات منذ ثلاث سنوات.",
  contact: EMAIL,
  has_account: false,
  organization: null,
  status: "pending",
  applied_at: "2026-10-06T10:00:00Z",
  decided_at: null,
  note: null,
  invite_code: null,
  invite_used: false,
  invite_expires_at: null,
  ...over,
})

beforeEach(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
  // Radix Checkbox measures itself; jsdom has no ResizeObserver.
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  useDevice.setState({ locale: "ar", onboarded: true, quickExit: false })
  useAuth.getState().set({ token: null, me: null, ready: true })
  useOrgLink.setState({ link: null })
  stubFetch(received)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

const submitButton = () => screen.getByRole("button", { name: ar_("cmp.apply.submit") }) as HTMLButtonElement

function fill({ contact = EMAIL as string | null, agree = true } = {}) {
  fireEvent.change(screen.getByLabelText(ar_("acct.displayName")), { target: { value: "أم يوسف" } })
  fireEvent.click(screen.getByRole("radio", { name: ar_("acct.female") }))
  fireEvent.change(screen.getByLabelText(ar_("cmp.apply.about")), { target: { value: "أتابع المسلمات الجديدات منذ ثلاث سنوات." } })
  if (contact !== null) fireEvent.change(screen.getByLabelText(ar_("cmp.apply.contact")), { target: { value: contact } })
  if (agree) fireEvent.click(screen.getByRole("checkbox", { name: ar_("cmp.apply.rulesAgree") }))
}

// --- R1 ---------------------------------------------------------------------------

describe("cmp-08-r1 the form needs no account and asks for the least", () => {
  it("cmp08_r1_a_visitor_fills_the_form_and_sends_it", async () => {
    useDevice.setState({ onboarded: false })
    wrap(<MentorApply />)
    expect(submitButton().disabled).toBe(true)
    fill()
    fireEvent.click(screen.getByRole("button", { name: "Tagalog" }))
    expect(submitButton().disabled).toBe(false)
    fireEvent.click(submitButton())
    expect(await screen.findByText(ar_("cmp.apply.done.title"))).toBeTruthy()
    const sent = calls.find((c) => c.url === "/api/mentor-applications")!
    expect(sent.body).toEqual({
      display_name: "أم يوسف",
      gender: "f",
      languages: ["ar", "tl"],
      locale: "ar",
      place: null,
      about: "أتابع المسلمات الجديدات منذ ثلاث سنوات.",
      contact: EMAIL,
      rules_accepted: true,
      org_code: null,
      website: "",
    })
  })

  it("cmp08_r1_the_privacy_policy_link_comes_before_every_field", () => {
    wrap(<MentorApply />)
    const link = screen.getByRole("link", { name: ar_("privacy.beforeYouWrite") })
    expect(link.getAttribute("href")).toBe("/privacy")
    for (const field of screen.getByRole("form").querySelectorAll("input, textarea, button")) {
      expect(link.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it("cmp08_r1_the_mentor_rules_are_shown_and_must_be_accepted", () => {
    wrap(<MentorApply />)
    for (const k of ["cmp.rules.r1", "cmp.rules.r2", "cmp.rules.r3", "cmp.rules.r4"] as const) expect(screen.getByText(ar_(k))).toBeTruthy()
    fill({ agree: false })
    expect(submitButton().disabled).toBe(true)
    expect(screen.getByText(ar_("cmp.apply.incomplete"))).toBeTruthy()
  })

  it("cmp08_r1_a_contact_is_an_email_or_a_phone_number", () => {
    expect(validContact(EMAIL)).toBe(true)
    expect(validContact("+1 (555) 555-0100")).toBe(true)
    expect(validContact("call me")).toBe(false)
    expect(validContact("12345")).toBe(false)
    wrap(<MentorApply />)
    fill({ contact: "call me" })
    expect(screen.getByText(ar_("cmp.apply.contactBad"))).toBeTruthy()
    expect(submitButton().disabled).toBe(true)
  })

  it("cmp08_r1_the_text_about_yourself_is_capped", () => {
    wrap(<MentorApply />)
    expect((screen.getByLabelText(ar_("cmp.apply.about")) as HTMLTextAreaElement).maxLength).toBe(ABOUT_MAX)
    expect(ABOUT_MAX).toBe(600)
  })

  it("cmp08_r1_a_signed_in_applicant_is_not_asked_for_a_contact", async () => {
    useAuth.getState().set({ token: "t", me: ME(["learner"]), ready: true })
    stubFetch((url, method) => (url === "/api/mentor-applications/mine" ? json(null) : received(url, method)))
    wrap(<MentorApply />)
    expect(await screen.findByText(ar_("cmp.apply.contactNotNeeded"))).toBeTruthy()
    expect(screen.queryByLabelText(ar_("cmp.apply.contact"))).toBeNull()
    fireEvent.change(screen.getByLabelText(ar_("cmp.apply.about")), { target: { value: "خبرتي" } })
    fireEvent.click(screen.getByRole("checkbox", { name: ar_("cmp.apply.rulesAgree") }))
    fireEvent.click(submitButton())
    expect(await screen.findByText(ar_("cmp.apply.done.bodyAccount"))).toBeTruthy()
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ contact: null, gender: "f", display_name: "أم يوسف" })
  })

  it("cmp08_r1_the_form_reads_in_english_and_tagalog", () => {
    for (const code of ["en", "tl"] as const) {
      useDevice.setState({ locale: code })
      const { unmount } = wrap(<MentorApply />)
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(translate(code, "cmp.apply.entry"))
      expect(screen.getByRole("button", { name: translate(code, "cmp.apply.submit") })).toBeTruthy()
      unmount()
    }
    for (const { code } of LOCALES) for (const k of ["cmp.apply.entry", "cmp.apply.done.keep", "cmp.apps.title"] as const) expect(translate(code, k)).not.toBe("")
  })
})

// --- R2 ---------------------------------------------------------------------------

describe("cmp-08-r2 one neutral answer; no third party against abuse", () => {
  it("cmp08_r2_the_confirmation_says_what_happens_next_and_how_long_the_contact_is_kept", async () => {
    wrap(<MentorApply />)
    fill()
    fireEvent.click(submitButton())
    expect(await screen.findByText(ar_("cmp.apply.done.body"))).toBeTruthy()
    expect(screen.getByText(ar_("cmp.apply.done.keep", { days: "90" }))).toBeTruthy()
    expect(ar_("cmp.apply.done.keep", { days: "90" })).toContain("90")
    expect(screen.queryByRole("form")).toBeNull()
  })

  it("cmp08_r2_the_hidden_field_is_out_of_sight_and_out_of_reach", () => {
    wrap(<MentorApply />)
    const trap = document.getElementById("ma-website") as HTMLInputElement
    expect(trap.tabIndex).toBe(-1)
    expect(trap.closest("[aria-hidden='true']")?.className).toContain("hidden")
    expect(screen.queryByRole("textbox", { name: "Website" })).toBeNull()
  })

  it("cmp08_r2_no_script_or_frame_from_another_site_guards_the_form", () => {
    wrap(<MentorApply />)
    expect(document.querySelectorAll("iframe, script[src]")).toHaveLength(0)
  })

  it("cmp08_r3_a_closed_form_says_applications_are_not_open_now", async () => {
    // The server answers 503 while the contact encryption keys are not set.
    stubFetch(() => json({ detail: "applications_closed" }, 503))
    wrap(<MentorApply />)
    fill()
    fireEvent.click(submitButton())
    expect(await screen.findByText(ar_("cmp.apply.closed"))).toBeTruthy()
    expect(screen.queryByText(ar_("cmp.apply.done.title"))).toBeNull()
  })

  it("cmp08_r2_too_many_attempts_and_a_wrong_organisation_code_say_so", async () => {
    stubFetch(() => json({ detail: "rate_limited" }, 429))
    wrap(<MentorApply />)
    fill()
    fireEvent.click(submitButton())
    expect(await screen.findByText(ar_("acct.rateLimited"))).toBeTruthy()
    stubFetch(() => json({ detail: "code_invalid" }, 404))
    fireEvent.change(screen.getByLabelText(ar_("cmp.apply.org")), { target: { value: "ZZZZ9999" } })
    fireEvent.click(submitButton())
    expect(await screen.findByText(ar_("welcome.code.invalid"))).toBeTruthy()
    expect(calls[0].body).toMatchObject({ org_code: "ZZZZ9999" })
  })
})

// --- R3, R5, R7: the applicant's own view --------------------------------------------

describe("cmp-08 the signed-in applicant sees the state only", () => {
  const mine = (status: string) => (url: string, method: string) => {
    if (url === "/api/mentor-applications/mine" && method === "GET") return json({ status, applied_at: "2026-10-06T10:00:00Z" })
    if (url === "/api/mentor-applications/mine" && method === "DELETE") return new Response(null, { status: 204 })
    return undefined
  }

  it("cmp08_r7_a_pending_application_can_be_withdrawn", async () => {
    useAuth.getState().set({ token: "t", me: ME(["learner"]), ready: true })
    stubFetch(mine("pending"))
    wrap(<MentorApply />)
    expect(await screen.findByText(ar_("cmp.apply.status.pending"))).toBeTruthy()
    expect(screen.queryByRole("form")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: ar_("cmp.apply.withdraw") }))
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.url === "/api/mentor-applications/mine")).toBe(true))
  })

  it("cmp08_r4_a_rejected_applicant_reads_no_reason_and_may_apply_again", async () => {
    useAuth.getState().set({ token: "t", me: ME(["learner"]), ready: true })
    stubFetch(mine("rejected"))
    wrap(<MentorApply />)
    expect(await screen.findByText(ar_("cmp.apply.status.rejected"))).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: ar_("cmp.apply.entry") }))
    expect(screen.getByRole("form")).toBeTruthy()
  })

  it("cmp08_r5_a_mentor_is_told_so_and_sees_no_form", () => {
    useAuth.getState().set({ token: "t", me: ME(["mentor"]), ready: true })
    stubFetch(mine("approved"))
    wrap(<MentorApply />)
    expect(screen.getByText(ar_("cmp.apply.alreadyMentor"))).toBeTruthy()
    expect(screen.queryByRole("form")).toBeNull()
  })
})

// --- entry points -----------------------------------------------------------------------

describe("cmp-08 «التقديم كمرشد» replaces «انضم مرشدًا»", () => {
  it("cmp08_r1_the_landing_page_links_to_the_form_in_every_language", () => {
    const doc = new DOMParser().parseFromString(landingHtml, "text/html")
    const a = doc.querySelector('[data-i18n="bloom.mentorLink"]')!
    expect(a.getAttribute("href")).toBe(appUrl("/mentor-apply"))
    expect(a.textContent).toBe(ar_("cmp.apply.entry"))
    expect(landingJs).toContain('"bloom.mentorLink": "Apply to be a mentor"')
    expect(landingJs).toContain('"bloom.mentorLink": "Mag-apply bilang mentor"')
    expect(landingHtml + landingJs).not.toMatch(/انضم مرشدًا|Join as a mentor|Sumali bilang mentor/)
    expect(doc.querySelector('[data-i18n="bloom.mentor"]')!.textContent).toContain("رمز دعوة") // a held code still works
  })

  it("cmp08_r1_the_welcome_screen_offers_the_form_and_keeps_the_invite_code", async () => {
    useDevice.setState({ onboarded: false })
    wrap(<Welcome />, "/welcome", "/welcome")
    fireEvent.click(screen.getByRole("button", { name: /العربية/ }))
    expect(screen.getByRole("button", { name: ar_("acct.haveInvite") })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: ar_("cmp.apply.entry") }))
    expect(await at()).toBe("/mentor-apply")
  })

  it("cmp08_r1_me_offers_the_form_to_everyone_but_mentors", async () => {
    const { unmount } = wrap(<Me />, "/me", "/me")
    fireEvent.click(screen.getByRole("button", { name: new RegExp(ar_("cmp.apply.entryHint")) }))
    expect(await at()).toBe("/mentor-apply")
    unmount()
    useAuth.getState().set({ token: "t", me: ME(["mentor"]), ready: true })
    wrap(<Me />, "/me", "/me")
    expect(screen.queryByRole("button", { name: new RegExp(ar_("cmp.apply.entryHint")) })).toBeNull()
  })

  it("cmp08_r3_me_links_the_team_and_admins_to_the_applications", async () => {
    for (const roles of [["team"], ["admin"]]) {
      useAuth.getState().set({ token: "t", me: ME(roles), ready: true })
      const { unmount } = wrap(<Me />, "/me", "/me")
      expect(screen.getByRole("button", { name: new RegExp(ar_("cmp.apps.title")) })).toBeTruthy()
      unmount()
    }
    useAuth.getState().set({ token: "t", me: ME(["learner"]), ready: true })
    wrap(<Me />, "/me", "/me")
    expect(screen.queryByRole("button", { name: new RegExp(ar_("cmp.apps.title")) })).toBeNull()
  })

  it("cmp08_r1_the_invite_field_points_people_without_a_code_to_the_form", () => {
    wrap(<Create inviteOpen onSignin={() => undefined} onCreated={() => undefined} />)
    expect(screen.getByLabelText(ar_("acct.invite"))).toBeTruthy()
    expect(screen.getByRole("link", { name: ar_("cmp.apply.noCode") }).getAttribute("href")).toBe("/mentor-apply")
  })
})

// --- R3, R4, R5, R8: the list ---------------------------------------------------------------

describe("cmp-08-r4 the team sees who applied and decides", () => {
  const list = (rows: Application[], base = TEAM_APPLICATIONS) => (url: string, method: string) => {
    if (url === base && method === "GET") return json(rows)
    if (url.startsWith(`${base}/`) && method === "POST") return json(rows[0])
    if (url.startsWith(`${base}/`) && method === "DELETE") return new Response(null, { status: 204 })
    return undefined
  }
  const card = async (id: string) => (await screen.findAllByRole("listitem")).find((li) => li.getAttribute("data-application") === id)!

  it("cmp08_r4_the_list_keeps_the_servers_order_pending_first_with_the_contact", async () => {
    stubFetch(list([APP(), APP({ id: "a2", display_name: "خالد", gender: "m", status: "rejected", contact: null, about: null, note: "لم نتمكن من التحقق" })]))
    wrap(<ApplicationsList base={TEAM_APPLICATIONS} />)
    const first = await card("a1")
    const items = screen.getAllByRole("listitem").filter((li) => li.hasAttribute("data-application"))
    expect(items.map((li) => li.getAttribute("data-status"))).toEqual(["pending", "rejected"])
    expect(within(first).getByText(EMAIL)).toBeTruthy()
    expect(within(first).getByText(ar_("cmp.apps.status.pending"))).toBeTruthy()
    expect(within(items[1]).getByText(ar_("cmp.apps.noteShown", { note: "لم نتمكن من التحقق" }))).toBeTruthy()
    expect(within(items[1]).queryByRole("button", { name: ar_("cmp.apps.approve") })).toBeNull()
    expect(screen.getByText(ar_("cmp.apps.hint"))).toBeTruthy()
  })

  it("cmp08_r4_accepting_calls_the_api_and_the_code_is_shown_to_send_by_hand", async () => {
    stubFetch(list([APP()]))
    wrap(<ApplicationsList base={TEAM_APPLICATIONS} />)
    fireEvent.click(within(await card("a1")).getByRole("button", { name: ar_("cmp.apps.approve") }))
    await waitFor(() => expect(calls.some((c) => c.url === `${TEAM_APPLICATIONS}/a1/approve` && c.method === "POST")).toBe(true))
    cleanup()
    stubFetch(list([APP({ status: "approved", invite_code: "MEN-1A2B3C4D", invite_expires_at: "2026-10-13T10:00:00Z" })]))
    wrap(<ApplicationsList base={TEAM_APPLICATIONS} />)
    const done = await card("a1")
    expect(within(done).getByText("MEN-1A2B3C4D")).toBeTruthy()
    expect(within(done).getByText(new RegExp(ar_("cmp.apps.codeHint")))).toBeTruthy()
    expect(within(done).getByText(EMAIL)).toBeTruthy()
  })

  it("cmp08_r4_rejecting_tells_what_is_deleted_and_sends_the_teams_note", async () => {
    stubFetch(list([APP()]))
    wrap(<ApplicationsList base={TEAM_APPLICATIONS} />)
    const li = await card("a1")
    fireEvent.click(within(li).getByRole("button", { name: ar_("cmp.apps.reject") }))
    expect(within(li).getByText(ar_("cmp.apps.rejectBody"))).toBeTruthy()
    fireEvent.change(within(li).getByLabelText(ar_("cmp.apps.note")), { target: { value: "ملاحظة" } })
    fireEvent.click(within(li).getByRole("button", { name: ar_("cmp.apps.reject") }))
    await waitFor(() => expect(calls.find((c) => c.url === `${TEAM_APPLICATIONS}/a1/reject`)?.body).toEqual({ note: "ملاحظة" }))
  })

  it("cmp08_r4_deleting_asks_first", async () => {
    stubFetch(list([APP()]))
    wrap(<ApplicationsList base={TEAM_APPLICATIONS} />)
    fireEvent.click(within(await card("a1")).getByRole("button", { name: ar_("cmp.apps.delete") }))
    expect(await screen.findByText(ar_("cmp.apps.deleteBody"))).toBeTruthy()
    expect(calls.some((c) => c.method === "DELETE")).toBe(false)
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: ar_("cmp.apps.delete") }))
    await waitFor(() => expect(calls.some((c) => c.url === `${TEAM_APPLICATIONS}/a1` && c.method === "DELETE")).toBe(true))
  })

  it("cmp08_r5_an_application_from_an_account_says_the_role_is_granted_directly", async () => {
    stubFetch(list([APP({ has_account: true, contact: null }), APP({ id: "a2", has_account: true, contact: null, status: "approved" })]))
    wrap(<ApplicationsList base={TEAM_APPLICATIONS} />)
    expect(within(await card("a1")).getByText(ar_("cmp.apps.hasAccount"))).toBeTruthy()
    const done = await card("a2")
    expect(within(done).getByText(ar_("cmp.apps.granted"))).toBeTruthy()
    expect(done.querySelector('[data-slot="invite"]')).toBeNull()
  })

  it("cmp08_r4_an_empty_list_says_where_applications_come_from", async () => {
    stubFetch(list([]))
    wrap(<ApplicationsList base={TEAM_APPLICATIONS} />)
    expect(await screen.findByText(ar_("cmp.apps.empty"))).toBeTruthy()
  })

  it("cmp08_r8_a_coordinator_decides_without_a_note_and_cannot_delete", async () => {
    stubFetch(list([APP({ organization: "مكتب الدعوة بالروضة" })], ORG_BASE))
    wrap(<ApplicationsList base={ORG_BASE} coordinator />)
    const li = await card("a1")
    expect(screen.getByText(ar_("cmp.apps.orgHint"))).toBeTruthy()
    expect(within(li).getByText(ar_("cmp.apps.org", { name: "مكتب الدعوة بالروضة" }))).toBeTruthy()
    expect(within(li).queryByRole("button", { name: ar_("cmp.apps.delete") })).toBeNull()
    fireEvent.click(within(li).getByRole("button", { name: ar_("cmp.apps.reject") }))
    expect(within(li).queryByLabelText(ar_("cmp.apps.note"))).toBeNull()
    fireEvent.click(within(li).getByRole("button", { name: ar_("cmp.apps.reject") }))
    await waitFor(() => expect(calls.find((c) => c.url === `${ORG_BASE}/a1/reject`)).toMatchObject({ method: "POST", body: undefined }))
  })
})

// --- R6: the policy matches the code (PLT-05 R1) ----------------------------------------------

describe("cmp-08-r6 the privacy policy says what an application keeps and for how long", () => {
  it("cmp08_r6_the_policy_section_exists_in_three_languages_with_the_90_days", () => {
    expect(POLICY_SECTIONS).toContain("apply")
    const words = { ar: ["بريدك", "منسّق", "فورًا"], en: ["email", "coordinator", "at once"], tl: ["email", "coordinator", "agad"] }
    for (const { code } of LOCALES) {
      const body = translate(code, "policy.apply.body")
      expect(body.match(/90/g), code).toHaveLength(2)
      for (const w of words[code as keyof typeof words]) expect(body, `${code} ${w}`).toContain(w)
    }
  })

  it("cmp08_r6_the_page_shows_the_section_and_its_dated_line", () => {
    wrap(<Privacy />, "/privacy", "/privacy")
    expect(screen.getByRole("heading", { name: ar_("policy.apply.title") })).toBeTruthy()
    expect(screen.getByText(ar_("policy.revisedApply", { date: `⁦${POLICY_REVISED_APPLY}⁩` }))).toBeTruthy()
  })
})
