/**
 * PLT-10 R4 and R5 (docs/domains/platform/features/PLT-10-app-path-and-welcome.md):
 * sign-in and codes on the welcome screen, and no repeated start.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes, useLocation } from "react-router"

import { translate, type Key } from "@/app/i18n"
import { useAuth, type Me } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { useOrgLink } from "@/app/org/store"

const { default: Welcome } = await import("@/app/pages/Welcome")

const ar_ = (k: Key, v?: Record<string, string | number>) => translate("ar", k, v)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const CODE = "K7M2QX9P"
const OFFICE = "مكتب الدعوة بالروضة"
const INVITE = "MEN-1A2B3C4D"

const MENTOR: Me = {
  id: "u1",
  display_name: "أبو عبدالله",
  username: "abu-1",
  roles: ["mentor"],
  locale: "en",
  two_factor_enabled: false,
  email_hint: null,
  gender: "m",
  languages: ["en"],
}

type Call = { url: string; method: string; body: unknown }
let calls: Call[] = []
function stubFetch(handler: (url: string, method: string) => Response | undefined = () => undefined) {
  calls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      const method = init?.method ?? "GET"
      calls.push({ url, method, body })
      return handler(url, method) ?? json({ detail: "not found" }, 404)
    }),
  )
}

const api = (url: string, method: string) => {
  if (url === `/api/org/codes/${CODE}`) return json({ name: OFFICE, lang: "ar" })
  if (url === "/api/org/link" && method === "POST") return json({ linked: true, name: OFFICE, lang: "ar", linked_at: "2026-10-06T10:00:00Z" }, 201)
  if (url === "/api/auth/login") return json({ access_token: "t", user: MENTOR, two_factor_required: false })
  return undefined
}

const Probe = () => {
  const l = useLocation()
  return <p data-testid="at">{l.pathname + l.search}</p>
}

const open = (entry = "/welcome") =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/learn/placement" element={<Probe />} />
          <Route path="/" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

const at = () => screen.findByTestId("at").then((e) => e.textContent)

beforeEach(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
  useDevice.setState({ locale: "ar", onboarded: false, placementOffered: false, installId: "device-install-id-0001", quickExit: false })
  useAuth.getState().set({ token: null, me: null, ready: true })
  useOrgLink.setState({ link: null })
  stubFetch(api)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

const signIn = async () => {
  fireEvent.change(screen.getByLabelText(ar_("acct.username")), { target: { value: "abu-1" } })
  fireEvent.change(screen.getByLabelText(ar_("acct.password")), { target: { value: "a-long-password" } })
  fireEvent.click(screen.getByRole("button", { name: ar_("acct.signin") }))
}

describe("plt-10-r4 sign-in and codes on the welcome screen", () => {
  it("plt10_r4_a_mentor_on_a_new_device_signs_in_without_the_promises_or_placement", async () => {
    open()
    fireEvent.click(screen.getByRole("button", { name: ar_("welcome.signin.entry") }))
    expect(screen.queryByText(ar_("onb.intro.p1"))).toBeNull()
    await signIn()
    expect(await at()).toBe("/")
    expect(calls.find((c) => c.url === "/api/auth/login")?.body).toEqual({ username: "abu-1", password: "a-long-password" })
    expect(useDevice.getState()).toMatchObject({ onboarded: true, placementOffered: true })
  })

  it("plt10_r4_a_typed_organisation_code_asks_the_same_question_as_its_link", async () => {
    open()
    fireEvent.click(screen.getByRole("button", { name: /العربية/ }))
    fireEvent.click(screen.getByRole("button", { name: ar_("welcome.code.org") }))
    fireEvent.change(screen.getByLabelText(ar_("org.me.codeLabel")), { target: { value: "k7m2-qx9p" } })
    fireEvent.click(screen.getByRole("button", { name: ar_("org.me.check") }))
    await screen.findByRole("heading", { name: new RegExp(OFFICE) })
    fireEvent.click(screen.getByRole("button", { name: ar_("org.ask.yes") }))
    await screen.findByText(ar_("onb.placement.title"))
    expect(calls.find((c) => c.url === "/api/org/link")?.body).toMatchObject({ code: CODE })
  })

  it("plt10_r4_a_wrong_code_says_so_names_no_organisation_and_the_start_goes_on", async () => {
    open()
    fireEvent.click(screen.getByRole("button", { name: /العربية/ }))
    fireEvent.click(screen.getByRole("button", { name: ar_("welcome.code.org") }))
    fireEvent.change(screen.getByLabelText(ar_("org.me.codeLabel")), { target: { value: "K7M2QX9Q" } })
    fireEvent.click(screen.getByRole("button", { name: ar_("org.me.check") }))
    expect(await screen.findByText(ar_("welcome.code.invalid"))).toBeTruthy()
    expect(document.body.textContent).not.toContain(OFFICE)
    fireEvent.click(screen.getByRole("button", { name: ar_("onb.intro.cta") }))
    expect(screen.getByText(ar_("onb.placement.title"))).toBeTruthy()
    expect(calls.some((c) => c.url === "/api/org/link")).toBe(false)
  })

  it("plt10_r4_a_team_invite_opens_account_creation_and_never_goes_to_the_organisation_check", async () => {
    open()
    fireEvent.click(screen.getByRole("button", { name: /العربية/ }))
    fireEvent.click(screen.getByRole("button", { name: ar_("acct.haveInvite") }))
    const field = screen.getByLabelText(ar_("acct.invite"))
    fireEvent.change(field, { target: { value: INVITE } })
    expect((field as HTMLInputElement).value).toBe(INVITE)
    expect(calls.some((c) => c.url.startsWith("/api/org/"))).toBe(false)
  })

  it("plt10_r4_a_guest_starts_without_being_asked_to_sign_in_or_enter_a_code", async () => {
    open()
    fireEvent.click(screen.getByRole("button", { name: /العربية/ }))
    fireEvent.click(screen.getByRole("button", { name: ar_("onb.intro.cta") }))
    fireEvent.click(screen.getByRole("button", { name: ar_("onb.placement.skip") }))
    expect(await at()).toBe("/")
    expect(calls).toEqual([])
  })
})

describe("plt-10-r5 no repeated start", () => {
  it("plt10_r5_signing_in_before_choosing_a_language_takes_the_accounts", async () => {
    open()
    fireEvent.click(screen.getByRole("button", { name: ar_("welcome.signin.entry") }))
    await signIn()
    expect(await at()).toBe("/")
    expect(useDevice.getState().locale).toBe("en")
  })

  it("plt10_r5_a_device_that_started_before_opening_welcome_goes_home", async () => {
    useDevice.setState({ onboarded: true })
    open()
    expect(await at()).toBe("/")
    expect(calls).toEqual([])
  })

  it("plt10_r5_a_signed_in_person_opening_welcome_goes_home_without_the_start", async () => {
    useAuth.getState().set({ token: "t", me: MENTOR, ready: true })
    open()
    expect(await at()).toBe("/")
    expect(useDevice.getState()).toMatchObject({ onboarded: true, placementOffered: true })
  })

  it("plt10_r5_an_organisation_link_after_starting_asks_once_then_home", async () => {
    useDevice.setState({ onboarded: true })
    open(`/welcome?org=${CODE}`)
    await screen.findByRole("heading", { name: new RegExp(OFFICE) })
    expect(screen.queryByText(ar_("onb.lang.title"))).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: ar_("org.ask.no") }))
    expect(await at()).toBe("/")
    expect(calls.map((c) => c.url)).toEqual([`/api/org/codes/${CODE}`])
  })

  it("plt10_r5_already_linked_and_started_goes_home_without_asking", async () => {
    useDevice.setState({ onboarded: true })
    useOrgLink.setState({ link: { name: OFFICE, lang: "ar", linkedAt: "2026-10-01T10:00:00Z" } })
    open(`/welcome?org=${CODE}`)
    expect(await at()).toBe("/")
    expect(calls).toEqual([])
  })

  it("plt10_r5_a_retired_code_after_starting_goes_home_and_names_nothing", async () => {
    useDevice.setState({ onboarded: true })
    open("/welcome?org=ZZZZ9999")
    expect(await at()).toBe("/")
    expect(document.body.textContent).not.toContain(OFFICE)
  })
})
