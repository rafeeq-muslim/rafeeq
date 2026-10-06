/**
 * PLT-16 installing Rafeeq on the device: the screens. One test (or more)
 * per example of the PRD, named plt16_r<rule>_…; the pure rules are in
 * lib/install.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router"

import { translate, type Key } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { useLearning } from "@/app/stores/learning"
import { useGuide } from "@/app/guide/store"
import { localDay } from "@/app/guide/suggest"
import { orderedLessons } from "@/app/learning/path"
import type { Content, Lesson, Unit } from "@/app/learning/types"
import { MAIN, OPTIONAL, type OptionalId } from "@/app/home/layout"
import { useHome } from "@/app/home/store"
import { orderBody } from "@/app/home/useOrganized"
import { deviceData } from "@/app/lib/privacy"
import { UA } from "@/app/lib/install.fixtures"
import { startInstall, useInstall } from "./store"

function makeContent(): Content {
  const ids = Array.from({ length: 3 }, (_, i) => `u01-l${i + 1}`)
  const units: Unit[] = [{ id: "u01", order: 1, title: "دليل اليوم الأول", badge_name: "", source_credit: "", lessons: ids, approved: true }]
  const lessons: Record<string, Lesson> = {}
  ids.forEach((id, i) => {
    lessons[id] = { id, unit: "u01", order: i + 1, title: `درس ${i + 1}`, cards: [{ id: `${id}-c`, kind: "text", text: id }], objectives: [], exercises: [], approved: true }
  })
  return { lang: "ar", preview: false, units, lessons }
}
const content = makeContent()
const lessons = orderedLessons(content.units, content.lessons)
vi.mock("@/app/learning/useContent", () => ({
  useContent: () => ({ content, isLoading: false, isError: false, refetch: () => undefined, lessons, preview: false }),
}))

const { default: Home } = await import("@/app/pages/Home")
const { default: Me } = await import("@/app/pages/Me")

const ar = (k: Key, v?: Record<string, string | number>) => translate("ar", k, v)
const DONE = { first: "2026-10-05", last: "2026-10-05", times: 1 }
const BLAME = /فاتك|لم تثبّت|ما زلت|للمرة|تذكير أخير|missed/
/** The device day `n` days before today. */
const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return localDay(d)
}
const TODAY = () => localDay(new Date())
/** A day's order in which the model put «ثبّت رفيق» first among the optional components. */
const INSTALL_FIRST = { main: [...MAIN], optional: ["install", ...OPTIONAL.filter((x) => x !== "install")] as OptionalId[] }

let calls: { url: string; body?: string }[] = []
let stop: (() => void) | undefined
let standalone = false

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, body: typeof init?.body === "string" ? init.body : undefined })
      const path = url.split("?")[0]
      const body = path === "/api/home/config" ? { organized: true } : path === "/api/home/order" ? { order: null } : null
      return new Response(JSON.stringify(body ?? { detail: "not found" }), { status: body ? 200 : 404, headers: { "Content-Type": "application/json" } })
    }),
  )
}

const useBrowser = (userAgent: string) => Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => userAgent })

/** The browser offers installing (Chromium's `beforeinstallprompt`). */
function browserOffers(outcome: "accepted" | "dismissed" = "accepted") {
  const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: ReturnType<typeof vi.fn>; userChoice: Promise<{ outcome: string }> }
  e.prompt = vi.fn(async () => undefined)
  e.userChoice = Promise.resolve({ outcome })
  act(() => void window.dispatchEvent(e))
  return e
}

const wrap = (entry = "/") =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/me" element={<Me />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

const card = () => document.querySelector("[data-optional=install]") as HTMLElement | null
/** Home is drawn and its optional components are decided. */
const homeReady = () => screen.findByRole("heading", { name: ar("home.org.daily") })
const openEntry = () => fireEvent.click(screen.getByRole("button", { name: new RegExp(ar("install.title")) }))
const steps = () => document.querySelector("[data-install-mode]") as HTMLElement

beforeEach(() => {
  localStorage.clear()
  calls = []
  standalone = false
  useDevice.setState({ locale: "ar", onboarded: true, city: null, organizedHome: true, dismissedSaveSheet: false, discreet: false, shareEvents: true })
  useAuth.setState({ me: null, token: null })
  useLearning.setState({ completed: { "u01-l1": DONE }, sessions: {}, mastery: {}, unlockedUnits: [] })
  useGuide.setState({ dismissed: {}, used: {}, lastShown: null })
  useHome.setState({ day: TODAY(), order: INSTALL_FIRST, slots: [], hidden: {}, shown: {}, opened: {} })
  useInstall.setState({ installed: false, installedOnce: false, shownDays: [], visitDays: [] })
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: standalone && q === "(display-mode: standalone)", media: q, addEventListener() {}, removeEventListener() {} }))
  stubFetch()
  useBrowser(UA.androidChrome)
  stop = startInstall(window) // as main.tsx does before the first render
})

afterEach(() => {
  cleanup()
  stop?.()
  vi.unstubAllGlobals()
})

// --- R1 ----------------------------------------------------------------------------------
describe("plt-16-r1 «حسابي» always has «ثبّت رفيق» while Rafeeq is not installed", () => {
  it("plt16_r1_opened_from_the_browser_me_shows_install_rafeeq", () => {
    wrap("/me")
    expect(screen.getByRole("button", { name: new RegExp(ar("install.title")) })).toBeTruthy()
    expect(screen.queryByText(ar("install.installed"))).toBeNull()
  })

  it("plt16_r1_opened_from_its_icon_me_says_installed_and_invites_nothing", () => {
    standalone = true
    stop?.()
    stop = startInstall(window)
    wrap("/me")
    expect(screen.getByText(ar("install.installed"))).toBeTruthy()
    expect(screen.queryByRole("button", { name: new RegExp(ar("install.title")) })).toBeNull()
    expect(screen.queryByRole("button", { name: ar("install.now") })).toBeNull()
    expect(useInstall.getState().installed).toBe(true) // kept on the device for later browser visits
  })

  it("plt16_r1_the_home_card_hidden_me_still_has_install_rafeeq", async () => {
    browserOffers()
    wrap("/")
    await homeReady()
    fireEvent.click(within(card()!).getByRole("button", { name: ar("home.org.hide") }))
    expect(card()).toBeNull()
    cleanup()
    wrap("/me")
    expect(screen.getByRole("button", { name: new RegExp(ar("install.title")) })).toBeTruthy()
  })

  it("plt16_r1_the_browser_reporting_the_install_turns_the_entry_into_installed", () => {
    wrap("/me")
    act(() => void window.dispatchEvent(new Event("appinstalled")))
    expect(screen.getByText(ar("install.installed"))).toBeTruthy()
    expect(screen.queryByRole("button", { name: new RegExp(ar("install.title")) })).toBeNull()
  })
})

// --- R2 ----------------------------------------------------------------------------------
describe("plt-16-r2 the way fits the device; the browser window opens only from a tap", () => {
  it("plt16_r2_android_chrome_install_button_opens_the_browser_window_at_once", async () => {
    const offer = browserOffers("accepted")
    wrap("/me")
    openEntry()
    expect(offer.prompt).not.toHaveBeenCalled() // opening the entry is not the tap on «ثبّت»
    fireEvent.click(within(steps()).getByRole("button", { name: ar("install.now") }))
    expect(offer.prompt).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(ar("install.installed"))).toBeTruthy()
  })

  it("plt16_r2_chromium_before_the_browser_offers_shows_the_menu_way_not_a_dead_button", () => {
    wrap("/me")
    openEntry()
    expect(steps().getAttribute("data-install-mode")).toBe("prompt")
    expect(within(steps()).getByText(ar("install.menu"))).toBeTruthy()
    expect(within(steps()).queryByRole("button")).toBeNull()
  })

  it("plt16_r2_iphone_safari_two_steps_share_then_add_to_home_screen_and_no_dead_button", () => {
    useBrowser(UA.iphoneSafari)
    wrap("/me")
    openEntry()
    const items = within(steps()).getAllByRole("listitem")
    expect(items.map((li) => li.textContent)).toEqual([ar("install.ios.1"), ar("install.ios.2")])
    expect(within(steps()).queryByRole("button")).toBeNull()
    // The same words as the notifications note (PLT-06 R4).
    expect(ar("notif.iosBody")).toContain("«إضافة إلى الشاشة الرئيسية»")
    expect(ar("install.ios.2")).toContain("«إضافة إلى الشاشة الرئيسية»")
  })

  it("plt16_r2_mac_safari_file_then_add_to_dock", () => {
    useBrowser(UA.macSafari17)
    wrap("/me")
    openEntry()
    expect(within(steps()).getAllByRole("listitem").map((li) => li.textContent)).toEqual([ar("install.mac.1"), ar("install.mac.2")])
  })

  it("plt16_r2_desktop_firefox_learns_it_cannot_install_and_which_browser_does", () => {
    useBrowser(UA.desktopFirefox)
    wrap("/me")
    openEntry()
    const text = steps().textContent ?? ""
    expect(text).toContain(ar("install.other.unsupported", { browser: ar("install.browser.chromeEdge") }))
    expect(text).toContain("Chrome")
    expect(within(steps()).queryByRole("button")).toBeNull()
  })

  it("plt16_r2_inside_another_app_names_the_browser_to_open", () => {
    useBrowser(UA.iphoneInstagram)
    wrap("/me")
    openEntry()
    expect(steps().textContent).toContain(ar("install.other.inApp", { browser: ar("install.browser.safari") }))
  })

  it("plt16_r2_the_card_showing_on_home_never_opens_the_browser_window_by_itself", async () => {
    const offer = browserOffers()
    wrap("/")
    await homeReady()
    expect(card()).not.toBeNull()
    await new Promise((r) => setTimeout(r, 20))
    expect(offer.prompt).not.toHaveBeenCalled()
    expect(document.querySelector("[role=dialog],[role=alertdialog]")).toBeNull() // R3: a card, not a pop-up
    fireEvent.click(within(card()!).getByRole("button", { name: ar("install.now") }))
    expect(offer.prompt).toHaveBeenCalledTimes(1)
  })
})

// --- R3 ----------------------------------------------------------------------------------
describe("plt-16-r3 a quiet optional card on Home", () => {
  it("plt16_r3_first_visit_without_a_lesson_no_card", async () => {
    useLearning.setState({ completed: {} })
    browserOffers()
    wrap("/")
    await homeReady()
    expect(card()).toBeNull()
    expect(useInstall.getState().shownDays).toEqual([])
  })

  it("plt16_r3_after_the_first_lesson_the_card_is_among_the_optional_components_the_next_day", async () => {
    useInstall.setState({ visitDays: [daysAgo(1)] }) // the lesson was yesterday; today is the next day
    browserOffers()
    wrap("/")
    await homeReady()
    expect(card()).not.toBeNull()
    expect(within(card()!).getByRole("heading", { name: ar("install.card.title") })).toBeTruthy()
    expect(document.querySelectorAll("[data-optional]").length).toBeLessThanOrEqual(2) // PLT-09 R1
    expect(card()!.textContent).not.toMatch(BLAME)
    expect(useInstall.getState().shownDays).toEqual([TODAY()]) // today is one showing (R4)
  })

  it("plt16_r3_three_visit_days_without_a_lesson_make_it_eligible", async () => {
    useLearning.setState({ completed: {} })
    useInstall.setState({ visitDays: [daysAgo(2), daysAgo(1)] })
    browserOffers()
    wrap("/")
    await homeReady()
    await waitFor(() => expect(card()).not.toBeNull()) // today is the third day
    expect(useInstall.getState().visitDays).toHaveLength(3)
  })

  it("plt16_r3_a_browser_that_cannot_install_shows_no_card_and_me_explains", async () => {
    useBrowser(UA.desktopFirefox)
    wrap("/")
    await homeReady()
    expect(card()).toBeNull()
    cleanup()
    wrap("/me")
    openEntry()
    expect(steps().getAttribute("data-install-mode")).toBe("other-browser")
  })

  it("plt16_r3_chromium_without_the_browser_offer_shows_no_card", async () => {
    wrap("/")
    await homeReady()
    expect(card()).toBeNull()
  })

  it("plt16_r3_iphone_safari_card_leads_to_the_steps_in_me", async () => {
    useBrowser(UA.iphoneSafari)
    wrap("/")
    await homeReady()
    fireEvent.click(within(card()!).getByRole("button", { name: ar("install.card.how") }))
    expect(await screen.findByText(ar("install.ios.1"))).toBeTruthy()
  })

  it("plt16_r3_install_is_last_in_the_fixed_order_and_a_stored_order_without_it_still_works", async () => {
    expect(OPTIONAL[OPTIONAL.length - 1]).toBe("install")
    // An order kept from before this id existed: no card today, no error.
    useHome.setState({ order: { main: [...MAIN], optional: ["ramadan", "human", "save", "reciter", "library"] } })
    browserOffers()
    wrap("/")
    await homeReady()
    expect(card()).toBeNull()
  })
})

// --- R4 ----------------------------------------------------------------------------------
describe("plt-16-r4 three showings at most, 14 days apart; never after installing or hiding", () => {
  it("plt16_r4_seen_on_day_1_not_on_day_5_again_on_day_15", async () => {
    useHome.setState({ shown: { install: daysAgo(4) } })
    useInstall.setState({ shownDays: [daysAgo(4)] }) // today is day 5
    browserOffers()
    wrap("/")
    await homeReady()
    expect(card()).toBeNull()
    expect(useInstall.getState().shownDays).toHaveLength(1)
    cleanup()

    useHome.setState({ slots: [], shown: { install: daysAgo(14) } })
    useInstall.setState({ shownDays: [daysAgo(14)] }) // today is day 15
    wrap("/")
    await homeReady()
    expect(card()).not.toBeNull()
    expect(useInstall.getState().shownDays).toEqual([daysAgo(14), TODAY()])
  })

  it("plt16_r4_shown_today_it_keeps_its_place_all_day_and_counts_once", async () => {
    browserOffers()
    wrap("/")
    await homeReady()
    expect(card()).not.toBeNull()
    cleanup()
    wrap("/")
    await homeReady()
    expect(card()).not.toBeNull()
    expect(useInstall.getState().shownDays).toEqual([TODAY()])
  })

  it("plt16_r4_after_three_showing_days_not_shown_a_month_later", async () => {
    useHome.setState({ shown: { install: daysAgo(58) } })
    useInstall.setState({ shownDays: [daysAgo(58), daysAgo(44), daysAgo(30)] })
    browserOffers()
    wrap("/")
    await homeReady()
    expect(card()).toBeNull()
    expect(useInstall.getState().shownDays).toHaveLength(3)
  })

  it("plt16_r4_hidden_it_is_not_shown_14_days_later", async () => {
    useHome.setState({ hidden: { install: true }, shown: { install: daysAgo(14) } })
    useInstall.setState({ shownDays: [daysAgo(14)] })
    browserOffers()
    wrap("/")
    await homeReady()
    expect(card()).toBeNull()
  })

  it("plt16_r4_installed_from_the_card_it_is_gone_when_opened_from_the_browser_later", async () => {
    const offer = browserOffers("accepted")
    wrap("/")
    await homeReady()
    fireEvent.click(within(card()!).getByRole("button", { name: ar("install.now") }))
    expect(offer.prompt).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(card()).toBeNull())
    expect(useInstall.getState().installed).toBe(true)
    cleanup()

    // Later, from the browser again; even if the browser offers installing again (after an uninstall).
    useHome.setState({ day: TODAY(), order: INSTALL_FIRST, slots: [] })
    useInstall.setState({ shownDays: [daysAgo(20)] })
    wrap("/")
    await homeReady()
    expect(card()).toBeNull()
    browserOffers()
    expect(card()).toBeNull()
  })
})

// --- R5 ----------------------------------------------------------------------------------
describe("plt-16-r5 the invitation says honestly what will show on the device", () => {
  it("plt16_r5_discreet_mode_the_card_itself_says_an_icon_named_rafeeq_will_show", async () => {
    useDevice.setState({ discreet: true })
    browserOffers()
    wrap("/")
    await homeReady()
    const line = card()!.querySelector("[data-slot=install-honest]")
    expect(line?.textContent).toBe(ar("install.honest"))
    expect(line?.textContent).toContain("Rafeeq")
  })

  it("plt16_r5_without_discreet_mode_the_card_stays_short", async () => {
    browserOffers()
    wrap("/")
    await homeReady()
    expect(card()!.querySelector("[data-slot=install-honest]")).toBeNull()
  })

  it.each([
    ["android chrome", UA.androidChrome, false],
    ["iphone safari", UA.iphoneSafari, true],
    ["desktop firefox", UA.desktopFirefox, false],
  ])("plt16_r5_the_install_section_always_carries_the_honest_line (%s)", (_name, ua, discreet) => {
    useBrowser(ua)
    useDevice.setState({ discreet })
    wrap("/me")
    openEntry()
    expect(steps().querySelector("[data-slot=install-honest]")?.textContent).toContain("«Rafeeq»")
  })
})

// --- R6 ----------------------------------------------------------------------------------
describe("plt-16-r6 what was shown, hidden and installed stays on the device", () => {
  it("plt16_r6_showing_hiding_and_installing_send_nothing", async () => {
    const offer = browserOffers("accepted")
    wrap("/")
    await homeReady()
    expect(card()).not.toBeNull()
    await new Promise((r) => setTimeout(r, 30)) // Home's own requests (order, cards) are out
    const before = calls.length
    fireEvent.click(within(card()!).getByRole("button", { name: ar("install.now") }))
    await waitFor(() => expect(useInstall.getState().installed).toBe(true))
    act(() => void window.dispatchEvent(new Event("appinstalled")))
    await new Promise((r) => setTimeout(r, 30))
    expect(calls.length).toBe(before) // installing asks for nothing
    cleanup()

    useInstall.setState({ installed: false, installedOnce: false })
    useHome.setState({ slots: [] })
    browserOffers()
    wrap("/")
    await homeReady()
    const requestsOfHome = calls.length
    fireEvent.click(within(card()!).getByRole("button", { name: ar("home.org.hide") }))
    await new Promise((r) => setTimeout(r, 30))
    expect(calls.length).toBe(requestsOfHome) // hiding asks for nothing

    expect(offer.prompt).toHaveBeenCalledTimes(1)
    expect(calls.every((c) => !/install|shown|hidden|standalone/i.test(c.url + (c.body ?? "")))).toBe(true)
    expect(calls.some((c) => c.url.startsWith("/api/events"))).toBe(false)
    expect(localStorage.getItem("rafeeq.eventQueue")).toBeNull() // no event was even queued (PLT-08 R6)
  })

  it("plt16_r6_nothing_of_it_enters_what_the_model_orders_home_from", () => {
    useInstall.setState({ installed: true, installedOnce: true, shownDays: [daysAgo(20), daysAgo(3)], visitDays: [daysAgo(20)] })
    useHome.setState({ hidden: { install: true } })
    const body = orderBody("ar", lessons, new Date())
    expect(Object.keys(body).sort()).toEqual(["bucket", "lang", "mastered", "next", "reviewing"])
    expect(JSON.stringify(body)).not.toMatch(/install|shown|hidden/)
  })

  it("plt16_r6_it_is_kept_under_a_rafeeq_key_so_erasing_the_device_clears_it", () => {
    useInstall.getState().recordShown(TODAY())
    expect(localStorage.getItem("rafeeq.install")).toContain(TODAY())
    expect(deviceData()).toHaveProperty("install") // every rafeeq.* key is erased by «امسح بيانات هذا الجهاز» (PLT-05 R4)
  })
})
