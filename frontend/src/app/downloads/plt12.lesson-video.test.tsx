/**
 * PLT-12, owner decision 2026-10-10: a lesson video loads only when the
 * learner plays it. Before that it is a poster card with its size; offline
 * and not on the device it says it needs a connection; one video can be
 * downloaded on its own (opt-in) and then plays offline.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router"

import { translate, type Key } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { useLearning } from "@/app/stores/learning"
import type { Content, Lesson, Unit } from "@/app/learning/types"
import { orderedLessons } from "@/app/learning/path"
import { useDownloads } from "./store"
import { videoItemId } from "./queries"
import type { CatalogItem } from "./types"

const MB = 1024 * 1024
const SRC = "https://d1.islamhouse.com/data/ar/ih_videos/mp4/single/ar-sifat-alwoduo.mp4"
const lesson: Lesson = {
  id: "u01-l3",
  unit: "u01",
  order: 1,
  title: "أتوضأ",
  cards: [{ id: "c1", kind: "text", text: "الوضوء" }],
  objectives: [],
  exercises: [],
  approved: true,
  media: { video: SRC },
}
const units: Unit[] = [{ id: "u01", order: 1, title: "اليوم الأول", badge_name: "", source_credit: "", lessons: [lesson.id], approved: true }]
const content: Content = { lang: "ar", preview: false, units, lessons: { [lesson.id]: lesson } }
const lessons = orderedLessons(units, content.lessons)

vi.mock("@/app/learning/useContent", () => ({
  useContent: () => ({ content, isLoading: false, isError: false, refetch: () => undefined, lessons, preview: false }),
}))
const { default: LessonPage } = await import("@/app/pages/Lesson")

const ar = (k: Key, v?: Record<string, string | number>) => translate("ar", k, v)
let online = true
function setOnline(v: boolean) {
  online = v
  onlineManager.setOnline(v)
  window.dispatchEvent(new Event(v ? "online" : "offline"))
}

let videoId = ""
const entry = (): CatalogItem => ({
  id: videoId,
  section: "lessons",
  kind: "video",
  ref: lesson.id,
  unit: "u01",
  title: "صفة الوضوء",
  files: [{ id: videoId.slice(6), url: `/api/downloads/file/${videoId.slice(6)}`, key: SRC, bytes: 22 * MB, mime: "video/mp4", kind: "media" }],
  bytes: 22 * MB,
  sizes_known: true,
  version: "v1",
  downloadable: true,
  reason: null,
})
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input)
  if (url.startsWith(`/api/downloads/catalog/${encodeURIComponent(videoId)}`)) return Response.json(entry())
  return Response.json({ detail: "not found" }, { status: 404 })
})
const fakeCaches = {
  open: async () => ({ put: async () => undefined, match: async () => undefined, delete: async () => true, keys: async () => [] }),
  has: async () => false,
  match: async () => undefined,
}

function show() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[`/learn/lesson/${lesson.id}`]}>
        <Routes>
          <Route path="/learn/lesson/:lessonId" element={<LessonPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  videoId = await videoItemId(SRC)
  localStorage.clear()
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online })
  setOnline(true)
  useDevice.setState({ locale: "ar", onboarded: true, quickExit: false, discreet: false, city: null })
  useLearning.setState({ completed: {}, sessions: {}, mastery: {}, unlockedUnits: [] })
  useDownloads.setState({ items: {}, progress: {} })
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
  fetchMock.mockClear()
  vi.stubGlobal("fetch", fetchMock)
  vi.stubGlobal("caches", fakeCaches)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  setOnline(true)
})

describe("plt-12 a lesson video loads only when played", () => {
  it("plt12_videos_id_matches_the_server_file_id", async () => {
    // backend downloads.file_id: "f" + sha256(url)[:24]
    expect(await videoItemId("abc")).toBe("video:fba7816bf8f01cfea414140de")
  })

  it("plt12_videos_online_poster_with_size_and_nothing_fetched_until_played", async () => {
    show()
    const container = document.body
    const play = await screen.findByRole("button", { name: new RegExp(ar("lesson.video").replace(/[()]/g, "\\$&")) })
    expect(container.querySelector("video")).toBeNull() // no video element: not a byte of it is fetched
    expect(await screen.findByText(`${ar("downloads.size.mb", { n: "22.0" })} · ${ar("lesson.videoCard.online")}`)).toBeTruthy() // on the poster
    expect(fetchMock.mock.calls.map((c) => String(c[0])).some((u) => u.includes(".mp4") || u.includes("/api/downloads/file/"))).toBe(false)
    // R2/opt-in: this one video can be kept, with its size
    const keep = screen.getByRole("button", { name: ar("downloads.downloadLabel", { name: ar("downloads.video.name", { name: "صفة الوضوء" }), size: ar("downloads.size.mb", { n: "22.0" }) }) })
    expect(keep.textContent).toContain(ar("downloads.video.download"))
    fireEvent.click(play)
    const video = container.querySelector("video")!
    expect(video.getAttribute("src")).toBe(SRC) // streamed from its source (Range), no download first
    expect(video.getAttribute("preload")).toBe("none")
  })

  it("plt12_videos_offline_not_on_device_says_it_needs_a_connection_and_the_lesson_goes_on", async () => {
    setOnline(false)
    show()
    expect(screen.getByText(ar("offline.video"))).toBeTruthy()
    expect(screen.queryByRole("button", { name: new RegExp(ar("lesson.video").replace(/[()]/g, "\\$&")) })).toBeNull()
    expect(document.querySelector("video")).toBeNull()
    expect(screen.getByText("الوضوء")).toBeTruthy()
  })

  it("plt12_videos_a_downloaded_video_plays_offline", async () => {
    useDownloads.setState({
      items: { [videoId]: { ...entry(), lang: "ar", done: [SRC], status: "done", error: null, update: null, obsolete: [] } },
    })
    setOnline(false)
    show()
    expect(screen.getByText(ar("lesson.videoCard.kept"), { exact: false })).toBeTruthy()
    expect(screen.queryByText(ar("offline.video"))).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: new RegExp(ar("lesson.video").replace(/[()]/g, "\\$&")) }))
    expect(document.querySelector("video")?.getAttribute("src")).toBe(SRC) // the worker answers it from the download
  })
})
