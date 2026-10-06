/**
 * Client-side examples of the platform documents (PR #25): PLT-01 start and
 * language, PLT-02 optional account, PLT-03 languages and direction, PLT-05
 * privacy and discreet mode, PLT-06 notifications, PLT-07 the Rafeeq tone.
 * The server side is in backend/tests/test_plt0*.py.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes, useLocation } from "react-router"

import { LOCALES, dirOf, num, translate, type Key } from "@/app/i18n"
import { ar } from "@/app/i18n/ar"
import { en } from "@/app/i18n/en"
import { tl } from "@/app/i18n/tl"
import { useAuth, type Me as MeUser } from "@/app/stores/auth"
import { guessLocale, useDevice } from "@/app/stores/device"
import { useLearning } from "@/app/stores/learning"
import { useCompanion } from "@/app/companion/store"
import { usePractice } from "@/app/practice/store"
import { reminderText, type Reminder } from "@/app/practice/reminders"
import { askPermission, pushState, setReminder, setReplies } from "@/app/lib/push"
import { EXIT_URL, deviceData, exitNow, myData, shiftTimesThree, wipeDevice } from "@/app/lib/privacy"
import { APPROVED_TONE, playTone, usableTone, type ApprovedTone } from "@/app/lib/tone"

vi.mock("@/app/learning/useContent", () => ({
  useContent: () => ({ content: undefined, isLoading: false, isError: false, refetch: () => undefined, lessons: [], preview: false }),
}))

const { default: Welcome, linkLocale } = await import("@/app/pages/Welcome")
const { default: Privacy, POLICY_SECTIONS } = await import("@/app/pages/Privacy")
const { default: Me } = await import("@/app/pages/Me")
const { default: Account } = await import("@/app/pages/Account")
const { default: AppLayout, QuickExit } = await import("@/app/AppLayout")
const { default: HelpScreen } = await import("@/app/companion/HelpScreen")
const { VerseBlock } = await import("@/app/lesson/VerseBlock")

const ar_ = (k: Key, v?: Record<string, string | number>) => translate("ar", k, v)
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

const LocationProbe = () => {
  const l = useLocation()
  return <p data-testid="at">{l.pathname + l.search}</p>
}

const wrap = (ui: React.ReactNode, entry = "/", path = "*") =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="/" element={<LocationProbe />} />
          <Route path="/learn/placement" element={<LocationProbe />} />
          <Route path="/privacy" element={<LocationProbe />} />
          <Route path="/practice/*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

const ME: MeUser = {
  id: "u1",
  display_name: "نخلة الهادئ",
  username: "layla-1",
  roles: ["learner"],
  locale: "ar",
  two_factor_enabled: false,
  email_hint: null,
  gender: null,
  languages: ["ar"],
}

// A fake browser push stack: permission, service worker, push manager.
function mockPush(permission: NotificationPermission = "default") {
  const endpoint = "https://fcm.googleapis.com/fcm/send/this-device"
  const sub = { endpoint, toJSON: () => ({ endpoint, keys: { p256dh: "k", auth: "a" } }), unsubscribe: vi.fn(async () => true) }
  let current: typeof sub | null = null
  const reg = {
    pushManager: { getSubscription: vi.fn(async () => current), subscribe: vi.fn(async () => (current = sub)) },
  }
  const N = {
    permission,
    requestPermission: vi.fn(async () => {
      N.permission = "granted"
      return "granted"
    }),
  }
  vi.stubGlobal("Notification", N)
  vi.stubGlobal("PushManager", function PushManager() {})
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration: async () => reg, ready: Promise.resolve(reg), getRegistrations: async () => [reg] },
  })
  return { sub, reg, N }
}

const pushApi = (url: string) => {
  if (url === "/api/push/public-key") return json({ key: "BAAA" })
  if (url === "/api/push/subscribe" || url === "/api/push/unsubscribe") return new Response(null, { status: 204 })
  if (url === "/api/push/state") return json({ subscribed: false, reminder: false, time: null, replies: false })
  return undefined
}

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true })
}

const JSDOM_UA = navigator.userAgent

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
  useDevice.setState({
    locale: "ar",
    onboarded: true,
    placementOffered: true,
    quickExit: false,
    discreet: false,
    reminderOn: false,
    repliesOn: false,
    toneOn: true,
    city: null,
  })
  useAuth.getState().set({ token: null, me: null, ready: true })
  useCompanion.getState().set({ helpToken: null, helpGender: null })
  stubFetch()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (navigator as { serviceWorker?: unknown }).serviceWorker
  setUserAgent(JSDOM_UA)
  localStorage.clear()
  document.body.querySelectorAll("[data-quick-exit]").forEach((n) => n.remove())
})

// --- PLT-01 start and language ------------------------------------------------

describe("plt-01-r1 the first screen asks only for the language, the device's one suggested", () => {
  it("plt01_r1_tagalog_choice_turns_everything_after_into_tagalog", () => {
    useDevice.setState({ onboarded: false })
    wrap(<Welcome />, "/welcome", "/welcome")
    fireEvent.click(screen.getByRole("button", { name: /Tagalog/ }))
    expect(screen.getByText(translate("tl", "onb.intro.title"))).toBeTruthy()
    expect(useDevice.getState().locale).toBe("tl")
  })

  it("plt01_r1_english_phone_sees_english_suggested_and_can_choose_another", () => {
    expect(guessLocale("en-GB")).toBe("en")
    expect(guessLocale("fil-PH")).toBe("tl")
    useDevice.setState({ onboarded: false })
    wrap(<Welcome />, "/welcome", "/welcome") // jsdom's navigator.language is en-US
    const english = screen.getByRole("button", { name: /English/ })
    expect(within(english).getByText("Suggested")).toBeTruthy()
    expect(within(screen.getByRole("button", { name: /العربية/ })).queryByText("مقترحة")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /العربية/ }))
    expect(useDevice.getState().locale).toBe("ar")
  })

  it("plt01_r1_each_language_is_written_in_its_own_script", () => {
    expect(LOCALES.map((l) => l.label)).toEqual(["العربية", "English", "Tagalog"])
  })
})

describe("plt-01-r2 a link carries the language and nothing about the person", () => {
  it("plt01_r2_tagalog_link_starts_in_tagalog_without_the_language_screen", () => {
    useDevice.setState({ onboarded: false, locale: "ar" })
    wrap(<Welcome />, "/welcome?lang=tl&office=riyadh-dawah&name=Joseph", "/welcome")
    expect(screen.getByText(translate("tl", "onb.intro.title"))).toBeTruthy()
    expect(screen.queryByText(translate("tl", "onb.lang.title"))).toBeNull()
    expect(useDevice.getState().locale).toBe("tl")
  })

  it("plt01_r2_nothing_but_the_language_is_read_or_kept", () => {
    expect(linkLocale(new URLSearchParams("lang=xx&office=a"))).toBeNull()
    useDevice.setState({ onboarded: false })
    wrap(<Welcome />, "/welcome?lang=tl&office=riyadh-dawah&name=Joseph", "/welcome")
    const kept = JSON.stringify(useDevice.getState()) + JSON.stringify(localStorage)
    expect(kept).not.toMatch(/riyadh-dawah|Joseph/)
  })

  it("plt01_r2_a_deeper_link_passes_only_the_language_to_the_first_screen", () => {
    useDevice.setState({ onboarded: false })
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/learn?lang=tl&office=riyadh-dawah"]}>
          <Routes>
            <Route path="/welcome" element={<LocationProbe />} />
            <Route path="/" element={<AppLayout />}>
              <Route path="learn" element={<p>learn</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByTestId("at").textContent).toBe("/welcome?lang=tl")
  })
})

describe("plt-01-r3 three promises and one button", () => {
  it("plt01_r3_intro_shows_the_three_promises_and_lets_start", () => {
    useDevice.setState({ onboarded: false })
    wrap(<Welcome />, "/welcome", "/welcome")
    fireEvent.click(screen.getByRole("button", { name: /العربية/ }))
    for (const k of ["onb.intro.p1", "onb.intro.p2", "onb.intro.p3"] as const) expect(screen.getByText(ar_(k))).toBeTruthy()
    // One button to start; PLT-10 R4's quiet entries (sign-in, codes) sit apart.
    const main = screen.getAllByRole("button").filter((b) => !b.closest('[data-slot="welcome-entries"]'))
    expect(main.map((b) => b.textContent)).toEqual([ar_("onb.intro.cta")])
  })
})

describe("plt-01-r4 nothing personal is asked at the start", () => {
  it("plt01_r4_no_field_on_any_first_run_step", () => {
    useDevice.setState({ onboarded: false })
    const { container } = wrap(<Welcome />, "/welcome", "/welcome")
    expect(container.querySelectorAll("input, textarea, select")).toHaveLength(0)
    fireEvent.click(screen.getByRole("button", { name: /العربية/ }))
    expect(container.querySelectorAll("input, textarea, select")).toHaveLength(0)
    fireEvent.click(screen.getByRole("button", { name: ar_("onb.intro.cta") }))
    expect(container.querySelectorAll("input, textarea, select")).toHaveLength(0)
  })
})

describe("plt-01-r5 placement is offered once and is optional", () => {
  it("plt01_r5_start_from_the_beginning_goes_to_the_first_lesson", () => {
    useDevice.setState({ onboarded: false, placementOffered: false })
    wrap(<Welcome />, "/welcome", "/welcome")
    fireEvent.click(screen.getByRole("button", { name: /العربية/ }))
    fireEvent.click(screen.getByRole("button", { name: ar_("onb.intro.cta") }))
    fireEvent.click(screen.getByRole("button", { name: ar_("onb.placement.skip") }))
    expect(screen.getByTestId("at").textContent).toBe("/")
    expect(useDevice.getState()).toMatchObject({ onboarded: true, placementOffered: true })
  })

  it("plt01_r5_take_the_test_opens_the_short_test", () => {
    useDevice.setState({ onboarded: false })
    wrap(<Welcome />, "/welcome", "/welcome")
    fireEvent.click(screen.getByRole("button", { name: /English/ }))
    fireEvent.click(screen.getByRole("button", { name: translate("en", "onb.intro.cta") }))
    fireEvent.click(screen.getByRole("button", { name: translate("en", "onb.placement.take") }))
    expect(screen.getByTestId("at").textContent).toBe("/learn/placement")
  })
})

describe("plt-01-r6 the start happens once per device", () => {
  it("plt01_r6_after_the_start_rafeeq_opens_on_home", () => {
    useDevice.setState({ onboarded: true })
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/learn"]}>
          <Routes>
            <Route path="/welcome" element={<p>welcome</p>} />
            <Route path="/" element={<AppLayout />}>
              <Route path="learn" element={<p>the path</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByText("the path")).toBeTruthy()
    expect(screen.queryByText("welcome")).toBeNull()
  })

  it("plt01_r6_erased_device_starts_from_the_language_screen", async () => {
    localStorage.setItem("rafeeq.device", JSON.stringify({ state: { onboarded: true }, version: 1 }))
    const go = vi.fn()
    await wipeDevice(go)
    expect(go).toHaveBeenCalledWith("/welcome")
    expect(localStorage.getItem("rafeeq.device")).toBeNull()
  })
})

// --- PLT-02 optional account --------------------------------------------------

describe("plt-02 optional account (client)", () => {
  it("plt02_r2_r4_form_has_three_fields_the_promise_and_the_recovery_warning_before_creating", () => {
    const { container } = wrap(<Account />, "/me/account", "/me/account")
    const labels = Array.from(container.querySelectorAll("label")).map((l) => l.textContent)
    expect(labels).toEqual([ar_("acct.displayName"), ar_("acct.username"), ar_("acct.password")])
    expect(container.querySelectorAll("input")).toHaveLength(3)
    expect(screen.getByText(ar_("acct.promise"))).toBeTruthy()
    expect(screen.getByText(ar_("acct.noRecoveryBefore"))).toBeTruthy()
    expect(screen.getByRole("link", { name: ar_("privacy.beforeYouWrite") }).getAttribute("href")).toBe("/privacy")
  })

  it("plt02_r3_generated_credentials_are_shown_once_with_copy_and_a_warning", async () => {
    stubFetch((url) => {
      if (url.startsWith("/api/auth/suggest")) return json({ display_name: "نخلة الهادئ", username: "calm-palm-42", password: "x7Kp-2mQe-9vLs-Tw4r" })
      if (url === "/api/auth/register") return json({ access_token: "t", user: { ...ME, username: "calm-palm-42" } }, 201)
      return json({ completed: {}, unlockedUnits: [], mastery: {}, days: [], badges: {} })
    })
    wrap(<Account />, "/me/account", "/me/account")
    fireEvent.click(screen.getAllByRole("button", { name: ar_("acct.suggest") })[0])
    await waitFor(() => expect((screen.getByLabelText(ar_("acct.username")) as HTMLInputElement).value).toBe("calm-palm-42"))
    fireEvent.click(screen.getByRole("button", { name: ar_("acct.createCta") }))
    await screen.findByText(ar_("acct.credentials"))
    expect(screen.getByText("calm-palm-42")).toBeTruthy()
    expect(screen.getByText("x7Kp-2mQe-9vLs-Tw4r")).toBeTruthy()
    expect(screen.getAllByRole("button", { name: ar_("common.copy") })).toHaveLength(2)
    expect(screen.getByText(ar_("acct.saveThem"))).toBeTruthy()
  })
})

// --- PLT-03 languages and direction -------------------------------------------

describe("plt-03 languages and direction", () => {
  it("plt03_r1_changing_language_keeps_the_three_lessons", () => {
    const completed = Object.fromEntries(["u1-l1", "u1-l2", "u1-l3"].map((id) => [id, { first: "2026-10-01", last: "2026-10-01", times: 1 }]))
    useLearning.setState({ completed } as Partial<ReturnType<typeof useLearning.getState>>)
    useDevice.setState({ locale: "tl" })
    useDevice.getState().set({ locale: "en" })
    expect(Object.keys(useLearning.getState().completed)).toEqual(["u1-l1", "u1-l2", "u1-l3"])
    expect(translate("en", "nav.home")).toBe("Home")
  })

  it("plt03_r2_arabic_is_right_to_left_and_the_back_arrow_points_right", () => {
    expect(LOCALES.map((l) => dirOf(l.code))).toEqual(["rtl", "ltr", "ltr"])
    wrap(<Privacy />, "/privacy", "/privacy")
    expect(document.documentElement.dir).toBe("rtl")
    const back = screen.getByRole("button", { name: ar_("common.back") })
    expect(back.querySelector("svg")?.getAttribute("class")).toContain("ltr:rotate-180") // drawn pointing right, mirrored in LTR
    cleanup()
    useDevice.setState({ locale: "tl" })
    wrap(<Privacy />, "/privacy", "/privacy")
    expect(document.documentElement.dir).toBe("ltr")
  })

  it("plt03_r3_a_verse_stays_arabic_right_to_left_with_its_meaning_after_it", async () => {
    useDevice.setState({ locale: "tl" })
    stubFetch(() =>
      json({
        ayat: [{ aya: 1, arabic: "قُلۡ هُوَ ٱللَّهُ أَحَدٌ", translation: "Sabihin mo: Siya si Allah ay Iisa.", url: "" }],
        source: { name: "QuranEnc", translation: "Tagalog", version: "1" },
      }),
    )
    const { container } = wrap(<div dir="ltr"><VerseBlock quran={{ sura: 112, ayat: [1, 1] }} /></div>, "/lesson", "/lesson")
    const verse = await waitFor(() => {
      const q = container.querySelector("blockquote")
      if (!q) throw new Error("not yet")
      return q
    })
    expect(verse.getAttribute("dir")).toBe("rtl")
    expect(verse.getAttribute("lang")).toBe("ar")
    expect(verse.textContent).toContain("قُلۡ هُوَ ٱللَّهُ أَحَدٌ")
    const meaning = screen.getByText("Sabihin mo: Siya si Allah ay Iisa.")
    expect(verse.compareDocumentPosition(meaning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("plt03_r4_latin_digits_in_every_language", () => {
    expect(num(244)).toBe("244")
    expect(translate("ar", "practice.qibla.degrees", { deg: num(244) })).toContain("244°")
    const arabicIndic = /[٠-٩۰-۹]/
    for (const d of [ar, en, tl]) expect(Object.values(d).filter((s) => arabicIndic.test(s))).toEqual([])
  })

  it("plt03_r6_a_missing_tagalog_string_shows_in_english_never_a_code", () => {
    const key: Key = "nav.home"
    const saved = tl[key]
    try {
      ;(tl as Record<string, string>)[key] = ""
      expect(translate("tl", key)).toBe(en[key])
    } finally {
      ;(tl as Record<string, string>)[key] = saved
    }
    expect(translate("tl", "no.such.key" as Key)).not.toBe("no.such.key")
  })
})

// --- PLT-05 privacy and discreet mode -----------------------------------------

describe("plt-05-r1 a short privacy policy, before any data and without an account", () => {
  it("plt05_r1_guest_reads_the_policy_in_arabic", () => {
    useDevice.setState({ onboarded: false })
    wrap(<Privacy />, "/privacy", "/privacy")
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(ar_("policy.title"))
    for (const s of POLICY_SECTIONS) {
      expect(screen.getByRole("heading", { name: ar_(`policy.${s}.title` as Key) })).toBeTruthy()
      expect(screen.getByText(ar_(`policy.${s}.body` as Key))).toBeTruthy()
    }
  })

  it("plt05_r1_policy_exists_in_all_three_languages", () => {
    const keys = Object.keys(ar).filter((k) => k.startsWith("policy.")) as Key[]
    expect(keys.length).toBeGreaterThan(18)
    for (const d of [en, tl]) expect(keys.filter((k) => !d[k])).toEqual([])
  })

  it("plt05_r1_opened_from_me_as_a_guest", () => {
    wrap(<Me />, "/me", "/me")
    fireEvent.click(screen.getByRole("button", { name: new RegExp(ar_("privacy.policyLink")) }))
    expect(screen.getByTestId("at").textContent).toBe("/privacy")
  })

  it("plt05_r1_linked_before_writing_to_a_human", () => {
    wrap(<HelpScreen />, "/mentor/help?from=home", "/mentor/help")
    const link = screen.getByRole("link", { name: ar_("privacy.beforeYouWrite") })
    const textarea = document.getElementById("help-body")!
    expect(link.getAttribute("href")).toBe("/privacy")
    expect(link.compareDocumentPosition(textarea) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("plt05_r1_the_language_screen_links_the_policy", () => {
    useDevice.setState({ onboarded: false })
    wrap(<Welcome />, "/welcome", "/welcome")
    expect(screen.getByRole("link", { name: ar_("privacy.policyLink") }).getAttribute("href")).toBe("/privacy")
  })
})

describe("plt-05-r2 quick exit", () => {
  it("plt05_r2_the_button_leaves_at_once_for_a_weather_page", () => {
    useDevice.setState({ quickExit: true })
    const exit = vi.fn()
    render(<QuickExit exit={exit} />)
    fireEvent.click(screen.getByRole("button", { name: ar_("exit.weather") }))
    expect(exit).toHaveBeenCalledOnce()
    const go = vi.fn()
    exitNow(go)
    expect(go).toHaveBeenCalledWith(EXIT_URL)
    expect(EXIT_URL).toBe("https://www.bbc.com/weather")
    expect(document.querySelector("[data-quick-exit]")).not.toBeNull() // covered before the new page loads
  })

  it("plt05_r2_shift_pressed_three_times_works_like_the_button", () => {
    useDevice.setState({ quickExit: true })
    const exit = vi.fn()
    render(<QuickExit exit={exit} />)
    const shift = () => fireEvent.keyUp(window, { key: "Shift" })
    shift()
    shift()
    fireEvent.keyUp(window, { key: "a" }) // another key in between starts again
    shift()
    shift()
    expect(exit).not.toHaveBeenCalled()
    shift()
    expect(exit).toHaveBeenCalledOnce()
  })

  it("plt05_r2_shift_does_nothing_unless_quick_exit_is_on", () => {
    const exit = vi.fn()
    render(<QuickExit exit={exit} />)
    for (let i = 0; i < 3; i++) fireEvent.keyUp(window, { key: "Shift" })
    expect(exit).not.toHaveBeenCalled()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("plt05_r2_presses_spread_over_more_than_five_seconds_do_not_count", () => {
    const exit = vi.fn()
    const onKey = shiftTimesThree(exit)
    const now = vi.spyOn(Date, "now")
    for (const t of [0, 3000, 6500]) {
      now.mockReturnValue(t)
      onKey(new KeyboardEvent("keyup", { key: "Shift" }))
    }
    expect(exit).not.toHaveBeenCalled()
    now.mockRestore()
  })

  it("plt05_r2_turning_it_on_says_the_browser_history_may_keep_rafeeq", () => {
    wrap(<Me />, "/me", "/me")
    expect(screen.getByText(ar_("privacy.historyNote"))).toBeTruthy()
  })
})

describe("plt-05-r3 discreet mode", () => {
  const r: Reminder = { id: "x", key: "asr", at: new Date("2026-10-10T12:00:00Z"), time: new Date("2026-10-10T12:00:00Z") }
  const settings = { ...usePractice.getState().reminders, enabled: true, showName: true }

  it("plt05_r3_page_title_becomes_notes", () => {
    useDevice.setState({ discreet: true })
    wrap(<Privacy />, "/privacy", "/privacy")
    expect(document.title).toBe("Notes")
  })

  it("plt05_r3_reminder_shows_only_reminder_even_with_the_prayer_name_chosen", () => {
    expect(reminderText(r, settings, "ar", "Asia/Riyadh", false)).not.toBe(ar_("practice.reminders.neutral"))
    expect(reminderText(r, settings, "ar", "Asia/Riyadh", true)).toBe("تذكير")
  })
})

describe("plt-05-r4 erase this device", () => {
  it("plt05_r4_guest_progress_city_notebook_and_human_conversations_disappear", async () => {
    for (const k of ["learning", "practice", "notebook", "device", "motivation", "savedAnswers"]) localStorage.setItem(`rafeeq.${k}`, "{}")
    localStorage.setItem("other-site-key", "kept")
    useCompanion.getState().set({ helpToken: "g".repeat(43) })
    stubFetch((url) => (url === "/api/help/guest" || url === "/api/auth/logout" ? new Response(null, { status: 204 }) : undefined))
    const go = vi.fn()
    await wipeDevice(go)
    const del = calls.find((c) => c.url === "/api/help/guest")
    expect(del?.method).toBe("DELETE")
    expect(del?.headers["X-Help-Token"]).toBe("g".repeat(43))
    expect(Object.keys(localStorage).filter((k) => k.startsWith("rafeeq."))).toEqual([])
    expect(localStorage.getItem("other-site-key")).toBe("kept")
    expect(go).toHaveBeenCalledWith("/welcome")
  })

  it("plt05_r4_the_push_subscription_is_dropped_on_the_server_and_the_device", async () => {
    const p = mockPush("granted")
    await p.reg.pushManager.subscribe()
    stubFetch(pushApi)
    await wipeDevice(vi.fn())
    expect(calls.some((c) => c.url === "/api/push/unsubscribe" && (c.body as { endpoint: string }).endpoint === p.sub.endpoint)).toBe(true)
    expect(p.sub.unsubscribe).toHaveBeenCalled()
  })
})

describe("plt-05-r5 delete my account and my data", () => {
  it("plt05_r5_a_mistaken_tap_can_be_taken_back_before_anything_is_deleted", async () => {
    useAuth.getState().set({ token: "t", me: ME })
    stubFetch((url, method) => (url === "/api/me" && method === "DELETE" ? new Response(null, { status: 204 }) : undefined))
    wrap(<Me />, "/me", "/me")
    fireEvent.click(screen.getByRole("button", { name: ar_("me.delete") }))
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText(ar_("acct.deleteConfirm"))).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("button", { name: ar_("acct.deleteNo") }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(calls.some((c) => c.url === "/api/me" && c.method === "DELETE")).toBe(false)

    fireEvent.click(screen.getByRole("button", { name: ar_("me.delete") }))
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: ar_("acct.deleteYes") }))
    await waitFor(() => expect(calls.some((c) => c.url === "/api/me" && c.method === "DELETE")).toBe(true))
    await waitFor(() => expect(useAuth.getState().me).toBeNull())
  })
})

describe("plt-05-r6 download a copy of my data", () => {
  it("plt05_r6_account_file_has_the_account_and_this_device_and_no_device_secret", async () => {
    useAuth.getState().set({ token: "t", me: ME })
    localStorage.setItem("rafeeq.learning", JSON.stringify({ state: { completed: { "u1-l1": {} } }, version: 1 }))
    localStorage.setItem("rafeeq.companion", JSON.stringify({ state: { helpToken: "secret-guest-token", helpGender: "f" }, version: 1 }))
    stubFetch((url) => (url === "/api/me/export" ? json({ format: "rafeeq-my-data/1", account: { display_name: ME.display_name } }) : undefined))
    const data = await myData()
    expect(calls.map((c) => c.url)).toEqual(["/api/me/export"])
    expect((data.account as { account: { display_name: string } }).account.display_name).toBe(ME.display_name)
    expect(Object.keys(data.device)).toEqual(expect.arrayContaining(["companion", "learning"]))
    expect(JSON.stringify(data)).not.toContain("secret-guest-token")
  })

  it("plt05_r6_a_guest_gets_this_device_only_without_any_request", async () => {
    localStorage.setItem("rafeeq.practice", JSON.stringify({ state: { reminders: { enabled: false } }, version: 1 }))
    const data = await myData()
    expect(calls).toEqual([])
    expect(data.account).toBeNull()
    expect(deviceData()).toHaveProperty("practice")
  })

  it("plt05_r6_offered_in_me", () => {
    wrap(<Me />, "/me", "/me")
    expect(screen.getByRole("button", { name: ar_("privacy.download") })).toBeTruthy()
  })

  // MOT-07: the privacy notice was approved by the product owner on 2026-10-06 (approvals-ui).
  it("mot07_the_events_opt_out_carries_no_unapproved_marker", () => {
    wrap(<Me />, "/me", "/me")
    expect(screen.getByRole("switch", { name: new RegExp(ar_("privacy.events")) })).toBeTruthy()
    expect(screen.queryByText("غير معتمد")).toBeNull()
    expect(document.querySelector('[data-slot="unapproved"]')).toBeNull()
  })

  it("plt05_r1_policy_is_final_and_says_who_approved_it", () => {
    for (const { code } of LOCALES) {
      const line = translate(code, "policy.updated", { date: "2026-10-06" })
      expect(line).toContain("2026-10-06")
      expect(line).not.toMatch(/مسودة|مقترح|draft|proposal|burador/i)
    }
    expect(ar_("policy.updated", { date: "2026-10-06" })).toContain("اعتمده مالك المنتج")
  })
})

// --- PLT-06 notifications -----------------------------------------------------

const switchFor = (label: string) => screen.getByRole("switch", { name: label }) as HTMLButtonElement

describe("plt-06-r1 nothing before the person turns it on; permission once, after a tap", () => {
  it("plt06_r1_opening_rafeeq_asks_nothing_and_every_type_is_off", async () => {
    const p = mockPush("default")
    stubFetch(pushApi)
    wrap(<Me />, "/me", "/me")
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(0))
    expect(p.N.requestPermission).not.toHaveBeenCalled()
    for (const label of [ar_("reminder.toggle"), ar_("notif.replies"), ar_("practice.reminders")]) {
      expect(switchFor(label).getAttribute("aria-checked")).toBe("false")
    }
  })

  it("plt06_r1_turning_the_learning_reminder_on_asks_the_device_once", async () => {
    const p = mockPush("default")
    stubFetch((url) => pushApi(url) ?? (url === "/api/push/reminder" ? json({ enabled: true, time: "20:00" }) : undefined))
    await setReminder(true, "20:00")
    await setReminder(true, "21:00")
    expect(p.N.requestPermission).toHaveBeenCalledOnce()
    expect(await askPermission()).toBe(true)
    expect(p.N.requestPermission).toHaveBeenCalledOnce()
  })
})

describe("plt-06-r2 three types, each with its own switch in «حسابي»", () => {
  it("plt06_r2_three_switches_in_one_place", () => {
    mockPush("granted")
    stubFetch(pushApi)
    wrap(<Me />, "/me", "/me")
    const section = screen.getByRole("region", { name: ar_("me.notifications") })
    expect(within(section).getAllByRole("switch")).toHaveLength(3) // no tone switch until one is approved (PLT-07)
  })

  it("plt06_r2_turning_off_the_learning_reminder_keeps_replies", async () => {
    const p = mockPush("granted")
    stubFetch((url, _m, body) => {
      if (url === "/api/push/replies") return json({ enabled: (body as { enabled: boolean }).enabled })
      if (url === "/api/push/reminder") return json({ enabled: (body as { enabled: boolean }).enabled, time: "20:00" })
      return pushApi(url)
    })
    await setReminder(true, "20:00")
    useDevice.setState({ reminderOn: true })
    await setReplies(true)
    await setReminder(false)
    expect(useDevice.getState()).toMatchObject({ reminderOn: false, repliesOn: true })
    expect(calls.filter((c) => c.url === "/api/push/replies").map((c) => c.body)).toEqual([{ endpoint: p.sub.endpoint, enabled: true }])
    expect(calls.some((c) => c.url === "/api/push/unsubscribe")).toBe(false) // replies still need the subscription
    expect(p.sub.unsubscribe).not.toHaveBeenCalled()
  })

  it("plt06_r2_with_both_push_types_off_the_subscription_is_removed", async () => {
    const p = mockPush("granted")
    stubFetch((url, _m, body) => (url === "/api/push/replies" ? json({ enabled: (body as { enabled: boolean }).enabled }) : pushApi(url)))
    await setReplies(true)
    await setReplies(false)
    expect(calls.some((c) => c.url === "/api/push/unsubscribe")).toBe(true)
    expect(p.sub.unsubscribe).toHaveBeenCalled()
  })

  it("plt06_r2_the_prayer_reminder_switch_needs_no_permission", () => {
    const p = mockPush("default")
    stubFetch(pushApi)
    wrap(<Me />, "/me", "/me")
    fireEvent.click(switchFor(ar_("practice.reminders")))
    expect(usePractice.getState().reminders.enabled).toBe(true)
    expect(p.N.requestPermission).not.toHaveBeenCalled()
    usePractice.getState().set({ reminders: { ...usePractice.getState().reminders, enabled: false } })
  })
})

describe("plt-06-r3 the lock screen stays neutral", () => {
  it("plt06_r3_me_says_what_shows_on_the_lock_screen", () => {
    wrap(<Me />, "/me", "/me")
    expect(screen.getByText(ar_("notif.neutral"))).toBeTruthy()
  })

  it("plt06_r3_prayer_name_only_when_chosen", () => {
    const r: Reminder = { id: "x", key: "asr", at: new Date(), time: new Date() }
    const base = usePractice.getState().reminders
    expect(reminderText(r, { ...base, showName: false }, "ar", "Asia/Riyadh", false)).toBe("تذكير")
    expect(reminderText(r, { ...base, showName: true }, "ar", "Asia/Riyadh", false)).toContain(ar_("practice.prayer.asr" as Key))
  })
})

// PLT-06 R3 / PRC-05 R2 (owner approval 2026-10-06, approvals-ui): no default for the prayer name.
describe("plt-06-r3 the prayer-reminder switch in «حسابي» asks once about the prayer name", () => {
  const question = () => screen.queryByRole("dialog", { name: ar_("practice.reminders.ask.title" as Key) })

  it("plt06_r3_first_prayer_reminder_in_me_asks_once_and_the_answer_is_kept", () => {
    const p = mockPush("default")
    stubFetch(pushApi)
    const before = usePractice.getState().reminders
    usePractice.setState({ reminders: { ...before, enabled: false, showName: false, askedName: undefined } })
    wrap(<Me />, "/me", "/me")
    fireEvent.click(switchFor(ar_("practice.reminders")))
    expect(question()).toBeTruthy()
    expect(usePractice.getState().reminders).toMatchObject({ enabled: true, showName: false }) // neutral until answered
    fireEvent.click(screen.getByRole("button", { name: ar_("practice.reminders.ask.show" as Key) }))
    expect(usePractice.getState().reminders).toMatchObject({ enabled: true, showName: true, askedName: true })
    fireEvent.click(switchFor(ar_("practice.reminders"))) // off
    fireEvent.click(switchFor(ar_("practice.reminders"))) // on again: not asked
    expect(question()).toBeNull()
    expect(p.N.requestPermission).not.toHaveBeenCalled()
    usePractice.setState({ reminders: before })
  })
})

describe("plt-06-r4 iPhone needs the Home Screen", () => {
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

  it("plt06_r4_safari_tab_on_iphone_is_told_how_to_add_rafeeq_and_no_switch_shows_on", () => {
    expect(pushState({ userAgent: IPHONE, platform: "iPhone", maxTouchPoints: 5, standalone: false, supported: false, permission: "default" })).toBe(
      "ios-home-screen",
    )
    expect(pushState({ userAgent: IPHONE, platform: "iPhone", maxTouchPoints: 5, standalone: true, supported: true, permission: "default" })).toBe("ok")
    setUserAgent(IPHONE)
    useDevice.setState({ reminderOn: true, repliesOn: true }) // even if the device once thought so
    wrap(<Me />, "/me", "/me")
    expect(screen.getByText(ar_("notif.iosTitle"))).toBeTruthy()
    expect(screen.getByText(ar_("notif.iosBody"))).toBeTruthy()
    for (const label of [ar_("reminder.toggle"), ar_("notif.replies")]) {
      const s = switchFor(label)
      expect(s.getAttribute("aria-checked")).toBe("false")
      expect(s.disabled).toBe(true)
    }
  })
})

describe("plt-06-r5 a refused permission is explained and never asked again", () => {
  it("plt06_r5_me_says_notifications_are_off_in_the_device_and_how_to_bring_them_back", async () => {
    const p = mockPush("denied")
    stubFetch(pushApi)
    wrap(<Me />, "/me", "/me")
    expect(screen.getByText(ar_("notif.deniedTitle"))).toBeTruthy()
    expect(screen.getByText(ar_("notif.deniedBody"))).toBeTruthy()
    expect(switchFor(ar_("notif.replies")).disabled).toBe(true)
    expect(await setReplies(true)).toBeNull()
    expect(p.N.requestPermission).not.toHaveBeenCalled()
  })
})

describe("plt-06-r6 discreet mode makes every notification neutral", () => {
  it("plt06_r6_prayer_name_chosen_then_discreet_shows_reminder_only", () => {
    const r: Reminder = { id: "x", key: "fajr", at: new Date(), time: new Date() }
    const s = { ...usePractice.getState().reminders, showName: true }
    useDevice.setState({ discreet: true })
    expect(reminderText(r, s, "tl", "Asia/Manila")).toBe(translate("tl", "practice.reminders.neutral"))
  })
})

// --- PLT-07 the Rafeeq tone ---------------------------------------------------

const TONE: ApprovedTone = { src: "/sounds/rafeeq-tone.mp3", approvedBy: "Sharia reviewer", approvedOn: "2026-10-07", durationMs: 1200 }

describe("plt-07 the Rafeeq tone", () => {
  let played: string[] = []
  beforeEach(() => {
    played = []
    vi.stubGlobal(
      "Audio",
      class {
        src: string
        constructor(src: string) {
          this.src = src
        }
        play() {
          played.push(this.src)
          return Promise.resolve()
        }
      },
    )
  })

  it("plt07_r1_no_tone_is_used_until_the_reviewer_approves_one", () => {
    expect(APPROVED_TONE).toBeNull() // pending: no approved file in the repo
    expect(playTone()).toBe(false)
    expect(usableTone({ ...TONE, approvedBy: "" })).toBeNull()
    expect(usableTone({ ...TONE, durationMs: 2500 })).toBeNull() // under two seconds
    expect(usableTone(TONE)).toEqual(TONE)
  })

  it("plt07_r2_plays_only_while_rafeeq_is_open", () => {
    expect(playTone(TONE)).toBe(true)
    const vis = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
    expect(playTone(TONE)).toBe(false)
    vis.mockRestore()
    expect(played).toEqual([TONE.src])
  })

  it("plt07_r2_a_notification_from_outside_carries_no_custom_sound", async () => {
    const sw = (await import("@/sw.ts?raw")).default
    expect(sw).not.toMatch(/sound|Audio\(/)
  })

  it("plt07_r3_turning_the_tone_off_keeps_the_alert_silent", () => {
    useDevice.setState({ toneOn: false })
    expect(playTone(TONE)).toBe(false)
    expect(played).toEqual([])
  })
})
