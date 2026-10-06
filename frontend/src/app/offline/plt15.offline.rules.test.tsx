/**
 * PLT-15 «رفيق دون اتصال»: one test per example where it can run in jsdom.
 * The whole app offline in a real browser: frontend/scripts/offline-smoke.mjs.
 */
import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router"

import { translate, type Key } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { useLearning } from "@/app/stores/learning"
import { useAsk } from "@/app/ask/store"
import { useSaved } from "@/app/discover/savedStore"
import type { Content, Lesson, Unit } from "@/app/learning/types"
import { orderedLessons } from "@/app/learning/path"

// --- a one-lesson path whose first card has a support video -------------------------------
const lesson: Lesson = {
  id: "u01-l1",
  unit: "u01",
  order: 1,
  title: "أتوضأ",
  cards: [
    { id: "c1", kind: "text", text: "الوضوء", image_url: "/api/content/media/u01/wudu.png", quran: { sura: 5, ayat: [6, 6] } },
    { id: "c2", kind: "text", text: "الماء", image_url: "https://example.org/far.png" },
  ],
  objectives: [],
  exercises: [],
  approved: true,
  media: { video: "https://d1.islamhouse.com/data/ar/video.mp4" },
}
const units: Unit[] = [{ id: "u01", order: 1, title: "اليوم الأول", badge_name: "", source_credit: "", lessons: [lesson.id], approved: true }]
const content: Content = { lang: "ar", preview: false, units, lessons: { [lesson.id]: lesson } }
const lessons = orderedLessons(units, content.lessons)

vi.mock("@/app/learning/useContent", () => ({
  useContent: () => ({ content, isLoading: false, isError: false, refetch: () => undefined, lessons, preview: false }),
}))
// R3 ex3: the city list (a chunk loaded on first use) never reached this device.
vi.mock("@/app/practice/cities", async (orig) => ({
  ...(await orig<typeof import("@/app/practice/cities")>()),
  loadCities: vi.fn(() => Promise.reject(new TypeError("Failed to fetch dynamically imported module: /app/assets/cities-x.js"))),
}))

const { lazy, RouteErrorBoundary, isChunkLoadError } = await import("./lazyRoute")
const { OfflineIndicator } = await import("./NeedsConnection")
const { warmAdhkar, warmOffline, warmSaved, passageUrls } = await import("./warmup")
const { keptOffline, OFFLINE_CACHE, CONTENT_CACHE } = await import("./paths")
const { default: Ask } = await import("@/app/pages/Ask")
const { default: HelpScreen } = await import("@/app/companion/HelpScreen")
const { default: Saved } = await import("@/app/discover/Saved")
const { default: LessonPage } = await import("@/app/pages/Lesson")
const { default: CityPicker } = await import("@/app/practice/CityPicker")

const ar_ = (k: Key) => translate("ar", k)

let online = true
function setOnline(v: boolean) {
  online = v
  onlineManager.setOnline(v)
  window.dispatchEvent(new Event(v ? "online" : "offline"))
}

/** A minimal Cache Storage. */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>()
  return {
    stores,
    keys: (name: string) => [...(stores.get(name)?.keys() ?? [])],
    open: async (name: string) => {
      const m = stores.get(name) ?? new Map<string, Response>()
      stores.set(name, m)
      return {
        put: async (k: string, r: Response) => void m.set(k, r),
        match: async (k: string) => m.get(k),
      } as unknown as Cache
    },
  }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

/** The approved adhkar in Arabic: two approved chapters and one still in review. */
function adhkarServer(url: string): Response {
  const u = new URL(url, "http://localhost")
  if (u.pathname === "/api/practice/adhkar")
    return json({
      groups: [
        { key: "morning_evening", chapters: [{ id: 27, title: "أذكار الصباح والمساء", approved_count: 3, total: 3 }] },
        { key: "sleep", chapters: [{ id: 28, title: "أذكار النوم", approved_count: 2, total: 2 }, { id: 29, title: "قيد المراجعة", approved_count: 0, total: 4 }] },
      ],
      source: { name: "حصن المسلم", url: "https://example.org" },
    })
  const m = u.pathname.match(/^\/api\/practice\/adhkar\/(\d+)$/)
  if (m)
    return json({
      id: Number(m[1]),
      group: "x",
      title: "t",
      source: { name: "s", url: "u" },
      items: [{ id: `hisn-${m[1]}`, title: "", chapter: Number(m[1]), meaning: null, repeat: 1, audio: true, segments: [{ t: "text", text: "..." }, ...(m[1] === "27" ? [{ t: "quran", sura: 2, from: 255, to: 255 }] : [])] }],
    })
  if (u.pathname === "/api/scripture/quran") return json({ verses: [] })
  if (u.pathname.startsWith("/api/content/media/")) return new Response("png", { headers: { "Content-Type": "image/png" } })
  return json({ detail: "not found" }, 404)
}

const fetchMock = vi.fn(async (input: RequestInfo | URL) => adhkarServer(String(input)))

const wrap = (ui: React.ReactNode, entry = "/") =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entry]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )

let store = fakeCaches()

beforeEach(() => {
  localStorage.clear()
  store = fakeCaches()
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online })
  setOnline(true)
  useDevice.setState({ locale: "ar", onboarded: true, quickExit: false, discreet: false, city: null })
  useLearning.setState({ completed: {}, sessions: {}, mastery: {}, unlockedUnits: [] })
  useAsk.getState().reset()
  useSaved.setState({ items: [] })
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
  fetchMock.mockClear()
  vi.stubGlobal("fetch", fetchMock)
  vi.stubGlobal("caches", store)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  setOnline(true)
})

// --- R1 -----------------------------------------------------------------------------------
describe("plt-15-r1 Rafeeq opens offline on any learner screen", () => {
  it("plt15_r1_offline_shows_one_quiet_indicator_and_it_goes_when_online", () => {
    wrap(<OfflineIndicator />)
    expect(screen.queryByText(ar_("offline.indicator"))).toBeNull()
    act(() => setOnline(false))
    expect(screen.getAllByRole("status")).toHaveLength(1)
    expect(screen.getByText(ar_("offline.indicator"))).toBeTruthy()
    act(() => setOnline(true))
    expect(screen.queryByText(ar_("offline.indicator"))).toBeNull()
  })

  it("plt15_r1_screen_never_loaded_says_it_needs_a_connection_first_time", async () => {
    setOnline(false)
    const Qibla = lazy<object>(() => Promise.reject(new TypeError("Failed to fetch dynamically imported module: /app/assets/QiblaScreen-x.js")))
    wrap(
      <React.Suspense fallback="loading">
        <Qibla />
      </React.Suspense>,
    )
    expect(await screen.findByText(ar_("offline.firstTime.title"))).toBeTruthy()
    expect(screen.getByRole("button", { name: ar_("common.retry") })).toBeTruthy()
    expect(screen.getByRole("button", { name: ar_("offline.home") })).toBeTruthy()
  })

  it("plt15_r1_a_chunk_failing_inside_a_screen_shows_the_same_screen_other_errors_go_on", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined)
    setOnline(false)
    const Chunk = () => {
      throw new TypeError("Importing a module script failed.")
    }
    wrap(
      <RouteErrorBoundary resetKey="/practice/qibla">
        <Chunk />
      </RouteErrorBoundary>,
    )
    expect(screen.getByText(ar_("offline.firstTime.title"))).toBeTruthy()
    cleanup()
    const Bug = () => {
      throw new Error("a real bug")
    }
    expect(() =>
      wrap(
        <RouteErrorBoundary resetKey="/">
          <Bug />
        </RouteErrorBoundary>,
      ),
    ).toThrow("a real bug")
    expect(isChunkLoadError(new Error("a real bug"))).toBe(false)
    quiet.mockRestore()
  })
})

// --- R2 -----------------------------------------------------------------------------------
describe("plt-15-r2 what the learner opened stays with them", () => {
  it("plt15_r2_video_offline_needs_connection_or_download_and_the_lesson_goes_on", () => {
    setOnline(false)
    wrap(
      <Routes>
        <Route path="/learn/lesson/:lessonId" element={<LessonPage />} />
      </Routes>,
      "/learn/lesson/u01-l1",
    )
    expect(screen.getByText(ar_("offline.video"))).toBeTruthy()
    expect(screen.queryByRole("button", { name: ar_("lesson.video") })).toBeNull()
    expect(screen.getByText("الوضوء")).toBeTruthy() // the lesson itself is there
  })

  it("plt15_r2_an_opened_lesson_keeps_its_verses_and_own_images_online", async () => {
    wrap(
      <Routes>
        <Route path="/learn/lesson/:lessonId" element={<LessonPage />} />
      </Routes>,
      "/learn/lesson/u01-l1",
    )
    await waitFor(() => expect(store.keys(CONTENT_CACHE).some((k) => k.includes("/api/scripture/quran?sura=5&from=6&to=6&lang=ar"))).toBe(true))
    await waitFor(() => expect(store.keys("rafeeq-media")).toEqual(["/api/content/media/u01/wudu.png"]))
  })
})

// --- R3 -----------------------------------------------------------------------------------
describe("plt-15-r3 «يومي» works offline", () => {
  it("plt15_r3_every_approved_adhkar_chapter_is_kept_after_the_first_online_open", async () => {
    const kept = await warmAdhkar("ar")
    expect(kept).toBe(2)
    expect(store.keys(OFFLINE_CACHE)).toEqual(
      expect.arrayContaining(["/api/practice/adhkar?lang=ar", "/api/practice/adhkar/27?lang=ar", "/api/practice/adhkar/28?lang=ar"]),
    )
    expect(store.keys(OFFLINE_CACHE)).not.toContain("/api/practice/adhkar/29?lang=ar") // in review: not shown, not fetched
    expect(store.keys(CONTENT_CACHE)).toContain("/api/scripture/quran?sura=2&from=255&to=255&lang=ar")
    // no audio, and nothing but the language is sent
    expect(fetchMock.mock.calls.map(([u]) => String(u)).every((u) => !u.includes("audio") && !u.includes("city"))).toBe(true)
  })

  it("plt15_r3_warm_up_runs_once_a_week_per_language_and_again_for_a_new_language", async () => {
    const now = Date.UTC(2026, 9, 6)
    expect(await warmOffline("ar", now)).toBe(true)
    expect(await warmOffline("ar", now + 60_000)).toBe(false)
    expect(await warmOffline("en", now + 60_000)).toBe(true)
    expect(store.keys(OFFLINE_CACHE)).toContain("/api/practice/adhkar?lang=en")
    expect(await warmOffline("ar", now + 8 * 24 * 3600_000)).toBe(true)
  })

  it("plt15_r3_offline_warm_up_does_nothing_and_does_not_count", async () => {
    setOnline(false)
    expect(await warmOffline("ar")).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    setOnline(true)
    expect(await warmOffline("ar")).toBe(true)
  })

  it("plt15_r3_sw_keeps_adhkar_text_but_not_audio_or_search", () => {
    expect(keptOffline("/api/practice/adhkar")).toBe(true)
    expect(keptOffline("/api/practice/adhkar/27")).toBe(true)
    expect(keptOffline("/api/practice/adhkar/audio/12.mp3")).toBe(false)
    expect(keptOffline("/api/discover/library")).toBe(true)
    expect(keptOffline("/api/discover/library/search")).toBe(false)
    expect(keptOffline("/api/ask")).toBe(false)
  })

  it("plt15_r3_choosing_a_city_offline_before_the_list_reached_the_device_says_it_needs_a_connection", async () => {
    setOnline(false)
    wrap(<CityPicker />, "/practice/city")
    expect(await screen.findByText(ar_("offline.cityList"))).toBeTruthy()
  })
})

// --- R4 -----------------------------------------------------------------------------------
describe("plt-15-r4 saved items read offline", () => {
  it("plt15_r4_a_saved_card_whose_list_never_reached_the_device_is_not_called_withdrawn", async () => {
    useSaved.setState({ items: [{ kind: "card", ref: "card-1", saved_at: "2026-10-01T10:00:00Z" }] })
    setOnline(false)
    wrap(<Saved />, "/discover/saved")
    expect(await screen.findByText(ar_("offline.savedItem"))).toBeTruthy()
    expect(screen.queryByText(ar_("discover.saved.unavailable"))).toBeNull()
  })

  it("plt15_r4_saved_answers_sources_and_lists_are_kept_with_the_same_requests_as_the_saved_screen", async () => {
    expect(passageUrls(["b", "a", "b"])).toEqual(["/api/scripture/passages?ids=a&ids=b"])
    useSaved.setState({
      items: [
        { kind: "card", ref: "card-1", saved_at: "2026-10-01T10:00:00Z" },
        { kind: "library", ref: "ih-1-en", saved_at: "2026-10-01T10:00:00Z" },
      ],
    })
    await warmSaved("ar")
    expect(store.keys(OFFLINE_CACHE)).toEqual([]) // the fake server answers 404: nothing kept
    expect(fetchMock.mock.calls.map(([u]) => String(u))).toEqual(expect.arrayContaining(["/api/discover/cards?lang=ar", "/api/discover/library?lang=en"]))
  })
})

// --- R5 -----------------------------------------------------------------------------------
describe("plt-15-r5 what needs the network says so; nothing typed is lost", () => {
  it("plt15_r5_offline_the_typed_question_stays_as_a_draft_and_is_not_sent", () => {
    setOnline(false)
    wrap(<Ask />, "/ask")
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "كيف أتوضأ؟" } })
    expect(screen.getByText(ar_("ask.offline"))).toBeTruthy()
    expect((screen.getByRole("button", { name: ar_("ask.send") }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole("button", { name: ar_("home.org.openSaved") })).toBeTruthy()
    cleanup() // leaves Ask
    wrap(<Ask />, "/ask")
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("كيف أتوضأ؟")
    expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith("/api/ask"))).toBe(false)
    act(() => setOnline(true))
    expect((screen.getByRole("button", { name: ar_("ask.send") }) as HTMLButtonElement).disabled).toBe(false) // sent only by its owner
    expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith("/api/ask"))).toBe(false)
  })

  it("plt15_r5_in_danger_offline_the_helplines_show_at_once_with_the_note_that_a_person_needs_a_connection", () => {
    setOnline(false)
    wrap(<HelpScreen />, "/mentor/help?from=ask")
    expect(screen.getByText(ar_("cmp.helplines.title"))).toBeTruthy()
    expect(screen.getByText(ar_("offline.human"))).toBeTruthy()
  })
})
