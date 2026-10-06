/**
 * PLT-09 the organized home: one test (or more) per example, named
 * plt09_r<rule>_…, plus the setting (off by default: the current app stays).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes, useLocation } from "react-router"

import { translate, type Key } from "@/app/i18n"
import { ar as AR } from "@/app/i18n/ar"
import { useAuth } from "@/app/stores/auth"
import { useDevice, type City } from "@/app/stores/device"
import { useLearning } from "@/app/stores/learning"
import { useGuide } from "@/app/guide/store"
import { orderedLessons } from "@/app/learning/path"
import type { Content, Lesson, Unit } from "@/app/learning/types"
import { dayTimes, formatTime, nextPrayer, ymdIn } from "@/app/practice/times"
import { localDay } from "@/app/guide/suggest"
import { adhkarLine, checkOrder, daySlots, eligible, FIXED_ORDER, keepSaveInReach, OPTIONAL, openedBy, prayerLine, timeBucket, visibleOptional, type Eligibility, type OptionalId } from "./layout"
import { useHome } from "./store"

// --- content: the day-one unit (u01-l1..u01-l7) ------------------------------------------
function makeContent(): Content {
  const ids = Array.from({ length: 8 }, (_, i) => `u01-l${i + 1}`)
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
// A due review is decided by LRN-04; here it is set per test.
const due = { items: [] as unknown[] }
vi.mock("@/app/learning/reviewItems", async (orig) => ({
  ...(await orig<typeof import("@/app/learning/reviewItems")>()),
  reviewItems: () => due.items,
}))

const { default: Home } = await import("@/app/pages/Home")
const { default: Me } = await import("@/app/pages/Me")
const { default: Discover } = await import("@/app/pages/Discover")
const { default: GuideScreen } = await import("@/app/guide/GuideScreen")
const { default: PracticeHome } = await import("@/app/practice/PracticeHome")
const { MyDay } = await import("./OrganizedHome")

const ar = (k: Key, v?: Record<string, string | number>) => translate("ar", k, v)
const RIYADH: City = { id: "riyadh", name: { ar: "الرياض", en: "Riyadh" }, country: "SA", lat: 24.7136, lng: 46.6753, tz: "Asia/Riyadh" }
const DONE = { first: "2026-10-05", last: "2026-10-05", times: 1 }
const BLAME =/فاتك|لم تصلِّ|لم تصل|لم تقرأ|غبت|غيابك|قصّرت|missed|skipped/

type Reply = { status?: number; body: unknown }
let routes: Record<string, (init?: RequestInit) => Reply> = {}
let calls: { url: string; body?: string }[] = []

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, body: typeof init?.body === "string" ? init.body : undefined })
      const path = url.split("?")[0]
      const r = routes[path]?.(init) ?? { status: 404, body: { detail: "not found" } }
      return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } })
    }),
  )
}

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>
}

const wrap = (entry = "/") =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/me" element={<Me />} />
          <Route path="/guide" element={<GuideScreen />} />
          <Route path="/discover/*" element={<Discover />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  )

const setOnline = (on: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => on })
const orderRequests = () => calls.filter((c) => c.url.startsWith("/api/home/order"))
/** The components on the sheet, in document order. */
const sequence = () =>
  Array.from(document.querySelectorAll("[data-testid=plt09-next-step],[data-component],[data-optional]")).map(
    (el) => el.getAttribute("data-component") ?? el.getAttribute("data-optional") ?? "next",
  )

/** PLT-08 R3: components already shown on an earlier day are not "new" today. */
function seenBefore(...ids: OptionalId[]) {
  useHome.setState({ shown: Object.fromEntries(ids.map((id) => [id, "2026-01-01"])) })
}

function ctx(p: Partial<Eligibility> = {}): Eligibility {
  return {
    completed: {},
    signedIn: false,
    hasMentor: false,
    saveDismissed: false,
    ramadan: null,
    openedListening: false,
    reciterChosen: false,
    recitersAvailable: 0,
    libraryPick: false,
    opened: {},
    ...p,
  }
}

beforeEach(() => {
  localStorage.clear()
  setOnline(true)
  due.items = []
  calls = []
  routes = {
    "/api/home/config": () => ({ body: { organized: true } }),
    "/api/home/order": () => ({ body: { order: null } }),
  }
  useDevice.setState({ locale: "ar", onboarded: true, city: null, organizedHome: true, dismissedSaveSheet: false })
  useAuth.setState({ me: null, token: null })
  useLearning.setState({ completed: {}, sessions: {}, mastery: {}, unlockedUnits: [] })
  useGuide.setState({ dismissed: {}, used: {}, lastShown: null })
  useHome.setState({ day: null, order: null, slots: [], hidden: {}, shown: {}, opened: {} })
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
  stubFetch()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// --- the setting -------------------------------------------------------------------------
describe("plt-09 setting: on by default (approved), switchable off to roll back", () => {
  it("plt09_setting_is_on_by_default_on_the_device", () => {
    expect(useDevice.getInitialState().organizedHome).toBe(true)
  })

  it("plt09_setting_on_by_default_home_me_guide_and_discover_follow_plt09", async () => {
    wrap("/")
    expect(await screen.findByRole("heading", { name: ar("home.org.daily") })).toBeTruthy()
    expect(screen.queryByRole("button", { name: new RegExp(ar("guide.homeLink")) })).toBeNull()
    cleanup()
    wrap("/me")
    expect(screen.queryByRole("heading", { name: ar("me.tools") })).toBeNull()
  })

  it("plt09_setting_switched_off_by_the_server_restores_the_previous_app", async () => {
    routes["/api/home/config"] = () => ({ body: { organized: false } })
    wrap("/")
    expect(await screen.findByRole("button", { name: new RegExp(ar("guide.homeLink")) })).toBeTruthy() // PLT-08 R5 link at the end
    expect(screen.queryByRole("heading", { name: ar("home.org.daily") })).toBeNull()
    expect(useDevice.getState().organizedHome).toBe(false) // kept for offline
    cleanup()
    calls = []
    wrap("/")
    await screen.findByRole("button", { name: new RegExp(ar("guide.homeLink")) })
    expect(orderRequests()).toHaveLength(0) // no model call while off
    cleanup()
    wrap("/me")
    expect(screen.getByRole("heading", { name: ar("me.tools") })).toBeTruthy()
    cleanup()
    wrap("/guide")
    expect(screen.getByText(ar("guide.lede"))).toBeTruthy()
    cleanup()
    wrap("/discover")
    expect(screen.getByText(ar("discover.lede"))).toBeTruthy()
  })

  it("plt09_setting_switched_back_on_by_the_server_turns_the_organized_home_on", async () => {
    useDevice.setState({ organizedHome: false })
    wrap("/")
    expect(await screen.findByRole("heading", { name: ar("home.org.daily") })).toBeTruthy()
    expect(useDevice.getState().organizedHome).toBe(true)
  })
})

// --- R1 ----------------------------------------------------------------------------------
describe("plt-09-r1 next step first, three main, at most two optional, nothing after", () => {
  it("plt09_r1_one_next_step_card_then_main_then_two_optional_then_nothing", async () => {
    // Joseph: a next lesson AND a due review; a guest after his first lesson (human + save eligible).
    due.items = [{ id: "x" }, { id: "y" }]
    useLearning.setState({ completed: { "u01-l1": DONE } })
    useDevice.setState({ city: RIYADH })
    useHome.setState({ day: localDay(new Date()), order: FIXED_ORDER })
    seenBefore("human", "save")
    wrap("/")
    await screen.findByRole("heading", { name: ar("home.org.daily") })
    await waitFor(() => expect(sequence()).toEqual(["next", "daily", "card", "ask", "human", "save"]))
    expect(screen.getAllByTestId("plt09-next-step")).toHaveLength(1) // one card, not two
    expect(screen.getByText(ar("home.review"))).toBeTruthy()
    expect(screen.queryByText(ar("home.start"))).toBeNull()
    expect(screen.queryByRole("button", { name: new RegExp(ar("guide.homeLink")) })).toBeNull() // nothing after
  })

  it("plt09_r1_the_next_step_stays_before_daily_whatever_the_order", async () => {
    useHome.setState({ day: localDay(new Date()), order: { main: ["daily", "ask", "card"], optional: [...OPTIONAL] } })
    wrap("/")
    await screen.findByRole("heading", { name: ar("home.org.daily") })
    expect(sequence().slice(0, 4)).toEqual(["next", "daily", "ask", "card"])
    expect(checkOrder({ main: ["next", "daily", "card"], optional: [] })).toBeNull() // the next step is never placed by the order
  })
})

// --- R2 ----------------------------------------------------------------------------------
describe("plt-09-r2 «يومي»: prayer, adhkar, Quran, library", () => {
  it("plt09_r2_after_fajr_at_540_next_prayer_is_dhuhr_and_morning_adhkar_one_tap_each", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-06T02:40:00Z")) // 5:40 in Riyadh, Fajr has passed
    useDevice.setState({ city: RIYADH })
    const now = new Date()
    const next = nextPrayer(RIYADH, now)
    expect(next.key).toBe("dhuhr")
    wrap("/")
    useHome.setState({ day: localDay(now), order: FIXED_ORDER })
    const day = within(await screen.findByRole("region", { name: ar("home.org.daily") }))
    const prayer = day.getByRole("button", { name: new RegExp(ar("home.org.prayerAt", { name: ar("practice.prayer.dhuhr"), time: formatTime(next.at, RIYADH.tz) })) })
    expect(day.getByRole("button", { name: new RegExp(ar("home.org.adhkar.morning")) })).toBeTruthy()
    fireEvent.click(prayer)
    expect(screen.getByTestId("where").textContent).toBe("/practice")
  })

  it("plt09_r2_adhkar_row_opens_the_adhkar_with_one_tap", async () => {
    useHome.setState({ day: localDay(new Date()), order: FIXED_ORDER })
    wrap("/")
    const day = within(await screen.findByRole("region", { name: ar("home.org.daily") }))
    fireEvent.click(day.getByRole("button", { name: new RegExp(ar("home.org.adhkar.any")) }))
    expect(screen.getByTestId("where").textContent).toBe("/practice/adhkar")
  })

  it("plt09_r2_without_a_city_the_line_invites_to_know_the_prayer_time", async () => {
    useHome.setState({ day: localDay(new Date()), order: FIXED_ORDER })
    wrap("/")
    expect(await screen.findByRole("button", { name: new RegExp(ar("home.org.prayerUnknown")) })).toBeTruthy()
  })

  it("plt09_r2_quran_continues_the_last_surah_else_opens_listening", async () => {
    useHome.setState({ day: localDay(new Date()), order: FIXED_ORDER })
    wrap("/")
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(ar("discover.quran")) }))
    expect(screen.getByTestId("where").textContent).toBe("/discover/quran")
    cleanup()
    localStorage.setItem("rafeeq.quranPos.last", "36")
    wrap("/")
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(ar("home.org.quranContinue", { name: "يس" })) }))
    expect(screen.getByTestId("where").textContent).toBe("/discover/quran/36")
  })

  it("plt09_r2_me_has_no_daily_tools_nor_everything_link_but_has_saved_and_qibla_ramadan_live_in_prayer_times", async () => {
    wrap("/me")
    expect(screen.queryByRole("heading", { name: ar("me.tools") })).toBeNull()
    expect(screen.queryByRole("button", { name: new RegExp(ar("guide.homeLink")) })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: new RegExp(ar("home.org.openSaved")) }))
    expect(screen.getByTestId("where").textContent).toBe("/discover/saved")
    cleanup()
    // The prayer-times screen opened from «يومي» holds qibla, the prayer reminder and Ramadan.
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2027-01-31T09:00:00Z")) // Ramadan 1448 is days away
    useDevice.setState({ city: RIYADH })
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <PracticeHome />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByRole("button", { name: new RegExp(ar("practice.qibla")) })).toBeTruthy()
    expect(screen.getByRole("button", { name: new RegExp(ar("practice.reminders")) })).toBeTruthy()
    expect(screen.getByRole("heading", { name: ar("practice.ramadan.title") })).toBeTruthy()
  })

  it("plt09_r2_setting_on_removes_the_everything_and_discover_pages", async () => {
    wrap("/guide")
    expect(screen.queryByText(ar("guide.lede"))).toBeNull()
    expect(await screen.findByRole("heading", { name: ar("home.org.daily") })).toBeTruthy() // led to Home
    cleanup()
    wrap("/discover")
    expect(screen.queryByText(ar("discover.lede"))).toBeNull()
  })

  it("plt09_r2_location_and_prayer_times_never_leave_the_device", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-06T02:40:00Z"))
    useDevice.setState({ city: RIYADH })
    wrap("/")
    await waitFor(() => expect(orderRequests()).toHaveLength(1))
    await screen.findByRole("heading", { name: ar("home.org.daily") })
    const t = dayTimes(RIYADH, ymdIn(RIYADH.tz, new Date()))
    const sent = calls.map((c) => `${c.url} ${c.body ?? ""}`).join("\n")
    for (const secret of ["24.71", "46.67", "riyadh", "Riyadh", "الرياض", "Asia/Riyadh", formatTime(t.dhuhr, RIYADH.tz), t.dhuhr.toISOString()]) {
      expect(sent).not.toContain(secret)
    }
    expect(Object.keys(JSON.parse(orderRequests()[0].body!)).sort()).toEqual(["bucket", "lang", "mastered", "next", "reviewing"])
  })
})

// --- R3 ----------------------------------------------------------------------------------
describe("plt-09-r3 the fixed optional list, eligibility on the device", () => {
  it("plt09_r3_guest_after_first_lesson_without_a_mentor_human_and_save_are_eligible", () => {
    const c = ctx({ completed: { "u01-l1": DONE } })
    expect(OPTIONAL.filter((id) => eligible(id, c))).toEqual(["human", "save"])
    expect(eligible("human", { ...c, hasMentor: true })).toBe(false)
    expect(eligible("save", { ...c, signedIn: true })).toBe(false)
    expect(eligible("ramadan", ctx({ ramadan: { kind: "upcoming", daysLeft: 14 } }))).toBe(true)
    expect(eligible("ramadan", ctx({ ramadan: { kind: "upcoming", daysLeft: 15 } }))).toBe(false)
    expect(eligible("reciter", ctx({ openedListening: true, recitersAvailable: 6 }))).toBe(true)
    expect(eligible("reciter", ctx({ openedListening: true, recitersAvailable: 1 }))).toBe(false) // nothing to choose from
    expect(eligible("reciter", ctx({ openedListening: true, recitersAvailable: 6, reciterChosen: true }))).toBe(false)
    expect(eligible("library", ctx({ completed: { "u01-l7": DONE }, libraryPick: true }))).toBe(true)
    expect(eligible("library", ctx({ completed: { "u01-l6": DONE }, libraryPick: true }))).toBe(false)
  })

  it("plt09_r3_closing_save_progress_makes_it_ineligible", async () => {
    const c = ctx({ completed: { "u01-l1": DONE }, saveDismissed: true })
    expect(eligible("save", c)).toBe(false)
    // and hiding it on the organized home keeps it away
    useLearning.setState({ completed: { "u01-l1": DONE } })
    useHome.setState({ day: localDay(new Date()), order: FIXED_ORDER })
    seenBefore("human", "save")
    wrap("/")
    const save = await screen.findByRole("region", { name: ar("me.save") })
    fireEvent.click(within(save).getByRole("button", { name: ar("home.org.hide") }))
    expect(screen.queryByRole("region", { name: ar("me.save") })).toBeNull()
    cleanup()
    wrap("/")
    await screen.findByRole("heading", { name: ar("home.org.daily") })
    expect(screen.queryByRole("region", { name: ar("me.save") })).toBeNull()
  })
})

// --- R4 ----------------------------------------------------------------------------------
describe("plt-09-r4 the model orders from the summary and the time of day only", () => {
  it("plt09_r4_model_order_is_used_and_the_device_keeps_the_first_two_eligible", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 9, 6, 19, 0)) // evening on the device clock
    localStorage.setItem("rafeeq.quranPos.last", "1") // opened listening
    useLearning.setState({ completed: { "u01-l1": DONE, "u01-l7": DONE } })
    routes["/api/home/order"] = () => ({ body: { order: { main: ["daily", "card", "ask"], optional: ["library", "reciter", "human", "save", "ramadan"] } } })
    routes["/api/discover/recitations"] = () => ({ body: { lang: "ar", recitation: null, reciters: [{ id: "quranpedia-255" }, { id: "quranpedia-250" }] } })
    routes["/api/discover/library"] = () => ({ body: { lang: "ar", topics: [{ id: "basics", items: [{ id: "lib-1", title: "كتاب المسلم الجديد", topic: "basics" }] }] } })
    seenBefore("library", "reciter")
    wrap("/")
    await waitFor(() => expect(sequence()).toEqual(["next", "daily", "card", "ask", "library", "reciter"]))
    const body = JSON.parse(orderRequests()[0].body!)
    expect(body.bucket).toBe("evening")
    expect(body.lang).toBe("ar")
  })

  it("plt09_r4_invalid_model_order_falls_back_to_the_fixed_order", async () => {
    useLearning.setState({ completed: { "u01-l1": DONE } })
    routes["/api/home/order"] = () => ({ body: { order: { main: ["daily", "card", "prayer"], optional: [] } } })
    seenBefore("human", "save")
    wrap("/")
    await waitFor(() => expect(sequence()).toEqual(["next", "daily", "card", "ask", "human", "save"]))
    expect(checkOrder({ main: ["daily", "card"], optional: [] })).toBeNull() // «اسأل رفيق» dropped
    expect(checkOrder({ main: ["daily", "card", "ask"], optional: ["dhikr"] })).toBeNull()
  })

  it("plt09_r4_offline_shows_the_fixed_order_at_once_without_waiting_or_error", async () => {
    setOnline(false)
    useLearning.setState({ completed: { "u01-l1": DONE } })
    seenBefore("human", "save")
    wrap("/")
    await waitFor(() => expect(sequence()).toEqual(["next", "daily", "card", "ask", "human", "save"]))
    expect(orderRequests()).toHaveLength(0)
    expect(document.querySelector("[aria-busy=true]")).toBeNull()
    expect(screen.queryByText(ar("common.error"))).toBeNull()
  })

  it("plt09_r4_time_bucket_comes_from_the_clock_hour_only", () => {
    const at = (h: number) => timeBucket(new Date(2026, 9, 6, h, 30))
    expect([5, 8, 12, 16, 19, 23, 2].map(at)).toEqual(["fajr", "morning", "dhuhr", "asr", "evening", "night", "night"])
  })
})

// --- R5 ----------------------------------------------------------------------------------
describe("plt-09-r5 the order is set once a day; contents change, places don't", () => {
  it("plt09_r5_morning_then_afternoon_same_places_and_the_next_prayer_is_now_asr", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-06T05:00:00Z")) // 8:00 in Riyadh
    useDevice.setState({ city: RIYADH })
    routes["/api/home/order"] = () => ({ body: { order: { main: ["ask", "daily", "card"], optional: [...OPTIONAL] } } })
    wrap("/")
    await waitFor(() => expect(sequence()).toEqual(["next", "ask", "daily", "card"]))
    expect(screen.getByRole("button", { name: new RegExp(ar("practice.prayer.dhuhr")) })).toBeTruthy()
    cleanup()
    // After Dhuhr the same day: no new request, the same places, Asr in «يومي».
    routes["/api/home/order"] = () => ({ body: { order: FIXED_ORDER } })
    vi.setSystemTime(new Date("2026-10-06T10:00:00Z")) // 13:00 in Riyadh
    wrap("/")
    await screen.findByRole("heading", { name: ar("home.org.daily") })
    expect(sequence()).toEqual(["next", "ask", "daily", "card"])
    expect(orderRequests()).toHaveLength(1)
    expect(screen.getByRole("button", { name: new RegExp(ar("practice.prayer.asr")) })).toBeTruthy()
    // The next day the order is asked for again.
    cleanup()
    vi.setSystemTime(new Date("2026-10-07T05:00:00Z"))
    wrap("/")
    await waitFor(() => expect(orderRequests()).toHaveLength(2))
    await waitFor(() => expect(sequence()).toEqual(["next", "daily", "card", "ask"]))
  })

  it("plt09_r5_asr_in_40_minutes_is_highlighted_then_evening_adhkar_nothing_moves", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    useDevice.setState({ city: RIYADH })
    const t = dayTimes(RIYADH, { y: 2026, m: 10, d: 6 })
    vi.setSystemTime(new Date(t.asr.getTime() - 40 * 60_000))
    expect(prayerLine({ key: "asr", at: t.asr }, new Date())).toMatchObject({ kind: "soon", minutes: 40 })
    expect(ar("home.org.soon", { name: ar("practice.prayer.asr"), n: 40 })).toBe("العصر بعد 40 دقيقة")
    useHome.setState({ day: localDay(new Date()), order: FIXED_ORDER })
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <MyDay now={new Date()} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const soon = screen.getByRole("button", { name: /العصر بعد 40 دقيقة/ })
    expect(soon.getAttribute("data-highlight")).toBe("true")
    const rowsBefore = screen.getAllByRole("button").length
    unmount()
    // After Asr (past the half hour of after-prayer adhkar, PRC-07 R6): the evening adhkar; same four rows.
    vi.setSystemTime(new Date(t.asr.getTime() + 35 * 60_000))
    expect(adhkarLine(t, new Date())).toBe("evening")
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <MyDay now={new Date()} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByRole("button", { name: new RegExp(ar("home.org.adhkar.evening")) })).toBeTruthy()
    expect(screen.getAllByRole("button")).toHaveLength(rowsBefore)
  })

  it("plt09_r5_an_optional_component_no_longer_eligible_is_removed_in_place", () => {
    const order = [...OPTIONAL] as OptionalId[]
    let ok = (id: OptionalId) => id === "human" || id === "save" || id === "library"
    const seen = { human: "2026-10-01", save: "2026-10-01" } as const
    const slots = daySlots([], order, ok, {}, seen, "2026-10-06")
    expect(slots).toEqual(["human", "save"])
    ok = (id) => id === "save" || id === "library" // «لست وحدك» no longer eligible (a mentor was chosen)
    const later = daySlots(slots, order, ok, {}, seen, "2026-10-06")
    expect(later).toEqual(["human", "save"]) // its slot stays, nothing moves, nothing fills it today
    expect(visibleOptional(later, ok, {})).toEqual(["save"])
  })
})

// --- PLT-08 R3 on the organized home (PLT-09 does not replace it) -----------------------
describe("plt-08-r3 on the organized home: one new suggestion a day, never after the feature was opened", () => {
  const order = [...OPTIONAL] as OptionalId[]

  it("plt08_r3_ex2_day_one_shows_one_new_optional_component_not_two", () => {
    const ok = (id: OptionalId) => id === "human" || id === "save"
    expect(daySlots([], order, ok, {}, {}, "2026-10-06")).toEqual(["human"])
    // The next day the second one comes; the first is no longer new.
    expect(daySlots([], order, ok, {}, { human: "2026-10-06" }, "2026-10-07")).toEqual(["human", "save"])
  })

  it("plt08_r3_ex2_hiding_today_brings_no_replacement_until_tomorrow", () => {
    const ok = (id: OptionalId) => id === "human" || id === "save" || id === "library"
    const seen = { human: "2026-10-05", save: "2026-10-06" } as const
    expect(daySlots(["human", "save"], order, ok, { save: true }, seen, "2026-10-06")).toEqual(["human", "save"])
    expect(visibleOptional(["human", "save"], ok, { save: true })).toEqual(["human"])
    expect(daySlots([], order, ok, { save: true }, seen, "2026-10-07")).toEqual(["human", "library"])
  })

  it("plt08_r3_ex3_a_feature_already_opened_is_not_offered", () => {
    const c = ctx({ completed: { "u01-l1": DONE, "u01-l7": DONE }, libraryPick: true, ramadan: { kind: "ramadan" } })
    expect(OPTIONAL.filter((id) => eligible(id, c))).toEqual(["ramadan", "human", "save", "library"])
    const opened = ctx({ ...c, opened: { ramadan: true, human: true, library: true } })
    expect(OPTIONAL.filter((id) => eligible(id, opened))).toEqual(["save"])
    expect(openedBy("/me/account")).toEqual(["save"])
    expect(openedBy("/discover/library/lib-1")).toEqual(["library"])
    expect(openedBy("/discover/quran")).toEqual([])
  })

  it("plt08_r3_ex3_opening_the_library_or_the_mentor_screen_ends_its_component_on_home", async () => {
    useLearning.setState({ completed: { "u01-l1": DONE } })
    useHome.setState({ day: localDay(new Date()), order: FIXED_ORDER })
    seenBefore("human", "save")
    useGuide.setState({ used: { human: true } })
    wrap("/")
    await screen.findByRole("heading", { name: ar("home.org.daily") })
    await waitFor(() => expect(sequence().slice(4)).toEqual(["save"]))
    expect(screen.queryByRole("region", { name: ar("guide.suggest.human.title") })).toBeNull()
  })

  it("plt02_r1_save_progress_is_not_crowded_out_in_ramadan", () => {
    const ok = (id: OptionalId) => id === "ramadan" || id === "human" || id === "save"
    expect(keepSaveInReach(order, ok).filter(ok).slice(0, 2)).toEqual(["ramadan", "save"])
    // Day one in Ramadan: Ramadan; the next day the save-progress offer joins it, not «لست وحدك».
    expect(daySlots([], order, ok, {}, {}, "2027-02-10")).toEqual(["ramadan"])
    expect(daySlots([], order, ok, {}, { ramadan: "2027-02-10" }, "2027-02-11")).toEqual(["ramadan", "save"])
    // Outside Ramadan the day's order stands (PLT-09 R4).
    const model: OptionalId[] = ["library", "reciter", "human", "save", "ramadan"]
    expect(keepSaveInReach(model, (id) => id !== "ramadan")).toEqual(model)
  })
})

// --- R6 ----------------------------------------------------------------------------------
describe("plt-09-r6 the learner owns Home: hide with one tap, no reward or blame", () => {
  it("plt09_r6_hidden_choose_reciter_does_not_return_and_the_next_eligible_takes_its_place_the_next_day", async () => {
    const order: OptionalId[] = ["reciter", "library", "human", "save", "ramadan"]
    const ok = (id: OptionalId) => id === "reciter" || id === "library" || id === "human"
    const seen = { reciter: "2026-10-01", library: "2026-10-01", human: "2026-10-01" } as const
    expect(daySlots([], order, ok, {}, seen, "2026-10-06")).toEqual(["reciter", "library"])
    // PLT-08 R3: the hidden one's slot stays empty today; tomorrow the next eligible takes it.
    expect(daySlots(["reciter", "library"], order, ok, { reciter: true }, seen, "2026-10-06")).toEqual(["reciter", "library"])
    expect(daySlots([], order, ok, { reciter: true }, seen, "2026-10-07")).toEqual(["library", "human"])

    // On screen: Layla hides «اختر قارئك».
    localStorage.setItem("rafeeq.quranPos.last", "2")
    useLearning.setState({ completed: { "u01-l1": DONE } })
    useAuth.setState({ me: { id: "l", display_name: "ليلى", username: "layla", roles: ["learner"] } as never, token: "x" })
    routes["/api/discover/recitations"] = () => ({ body: { reciters: [{ id: "quranpedia-250" }, { id: "quranpedia-255" }] } })
    routes["/api/mentors/mine"] = () => ({ body: { mentor: null } })
    useHome.setState({ day: localDay(new Date()), order: { main: ["daily", "card", "ask"], optional: order } })
    seenBefore("reciter", "human")
    wrap("/")
    const reciter = await screen.findByRole("region", { name: ar("home.org.reciter.title") })
    fireEvent.click(within(reciter).getByRole("button", { name: ar("home.org.hide") }))
    await waitFor(() => expect(sequence().slice(4)).toEqual(["human"])) // nothing takes its place today
    expect([...useHome.getState().slots].sort()).toEqual(["human", "reciter"]) // the hidden one keeps its slot today
    cleanup()
    wrap("/")
    await screen.findByRole("heading", { name: ar("home.org.daily") })
    expect(screen.queryByRole("region", { name: ar("home.org.reciter.title") })).toBeNull()
    expect(useHome.getState().hidden).toEqual({ reciter: true })
    expect(calls.some((c) => (c.body ?? "").includes("reciter"))).toBe(false) // stays on the device
  })

  it("plt09_r6_days_without_adhkar_show_evening_adhkar_as_a_tool_without_blame", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    const t = dayTimes(RIYADH, { y: 2026, m: 10, d: 6 })
    vi.setSystemTime(new Date(t.maghrib.getTime() + 45 * 60_000))
    useDevice.setState({ city: RIYADH })
    useHome.setState({ day: localDay(new Date()), order: FIXED_ORDER })
    wrap("/")
    const day = within(await screen.findByRole("region", { name: ar("home.org.daily") }))
    expect(day.getByRole("button", { name: new RegExp(ar("home.org.adhkar.evening")) })).toBeTruthy()
    expect(document.body.textContent ?? "").not.toMatch(BLAME)
    expect(document.body.textContent ?? "").not.toMatch(/\d+\s*(مرة|times)/) // no counter on worship
    const keys = (Object.keys(AR) as Key[]).filter((k) => k.startsWith("home.org."))
    for (const l of ["ar", "en", "tl"] as const) for (const k of keys) expect(translate(l, k)).not.toMatch(BLAME)
  })
})
