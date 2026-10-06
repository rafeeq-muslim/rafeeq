/**
 * KNW-08 R1 (the recitation alone, silent in-app notices) and R5 (listening
 * is worship: nothing counted, rewarded or sent), on the listening screen.
 * Verse texts here are placeholders, never scripture (rules.md §1.3).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router"
import { Toaster, toast } from "sonner"

import { translate } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { useLearning } from "@/app/stores/learning"
import { SuraPage } from "./Quran"

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
type Call = { url: string; method: string }
let calls: Call[] = []
const lc = () => useDevice.getState().locale

const AYAT = [1, 2, 3, 4].map((aya) => ({ aya, arabic: `TEST_ARABIC_${aya}`, translation: null, url: "" }))
const RECITATION = { id: "r1", title: "TEST", reciter: "TEST_RECITER", source: "TEST_SOURCE", origin_url: "", suras: { "112": "https://audio.test/112.mp3" } }

function api(url: string) {
  if (url.startsWith("/api/scripture/quran")) return json({ sura: 112, ayat: AYAT, source: { name: "QuranEnc.com", translation: null, version: "t", loaded: null } })
  if (url.startsWith("/api/discover/recitations")) return json({ recitation: RECITATION, reciters: [] })
  return new Response(JSON.stringify({ detail: "not found" }), { status: 404 })
}

let audioCtor: ReturnType<typeof vi.fn>
let contextCtor: ReturnType<typeof vi.fn>

beforeEach(() => {
  calls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET" })
      return api(url)
    }),
  )
  // Any second sound source would be created through one of these.
  audioCtor = vi.fn()
  contextCtor = vi.fn()
  vi.stubGlobal("Audio", audioCtor)
  vi.stubGlobal("AudioContext", contextCtor)
  vi.stubGlobal("webkitAudioContext", contextCtor)
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} unobserve() {} })
  Element.prototype.scrollIntoView = () => {}
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { configurable: true, value: false })
  })
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { configurable: true, value: true })
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

function renderSura() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/discover/quran/112"]}>
        <Routes>
          <Route path="/discover/quran/:sura" element={<SuraPage />} />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </QueryClientProvider>,
  )
}

async function startRecitation() {
  renderSura()
  await screen.findByText(/TEST_ARABIC_4/)
  fireEvent.click(await screen.findByRole("button", { name: translate(lc(), "discover.quran.play") }))
  // PLT-11 R5: the whole-surah file plays only after its size is shown and accepted.
  fireEvent.click(await screen.findByRole("button", { name: translate(lc(), "plt11.size.listen", { size: translate(lc(), "plt11.size.unknown") }) }))
  const audios = document.querySelectorAll("audio")
  return audios
}

describe("KNW-08 R1: the recitation plays as recorded, with no other sound", () => {
  it("R1: playing a surah plays the reciter's file on the one audio element, and nothing else", async () => {
    const audios = await startRecitation()
    expect(audios).toHaveLength(1)
    expect(audios[0].getAttribute("src") ?? audios[0].src).toContain("https://audio.test/112.mp3")
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
    expect(audioCtor).not.toHaveBeenCalled()
    expect(contextCtor).not.toHaveBeenCalled()
  })

  it("R1: an in-app notice during the recitation is shown without sound and leaves the recitation playing", async () => {
    const audios = await startRecitation()
    const src = audios[0].src
    act(() => {
      toast.success("TEST_NOTICE")
    })
    expect(await screen.findByText("TEST_NOTICE")).toBeTruthy()
    expect(document.querySelectorAll("audio")).toHaveLength(1)
    expect(audioCtor).not.toHaveBeenCalled()
    expect(contextCtor).not.toHaveBeenCalled()
    expect(audios[0].src).toBe(src)
    expect(audios[0].paused).toBe(false)
  })
})

describe("KNW-08 R5: listening is worship: no points, streak, badge, counter or message", () => {
  it("R5: finishing a surah changes no progress, shows no completion message and sends nothing", async () => {
    const before = JSON.stringify(useLearning.getState())
    const audios = await startRecitation()
    const textBefore = document.body.textContent
    const notices = () => document.querySelectorAll("[role=status],[role=alert],[data-sonner-toast]").length
    const noticesBefore = notices()
    act(() => {
      fireEvent(audios[0], new Event("ended"))
    })
    // Learning progress (and with it streak and badges) is untouched.
    expect(JSON.stringify(useLearning.getState())).toBe(before)
    // No message appears: only the play/pause label of the player may change.
    const pause = translate(lc(), "discover.quran.pause")
    const play = translate(lc(), "discover.quran.play")
    const normalise = (s: string | null) => (s ?? "").replaceAll(pause, "").replaceAll(play, "")
    expect(normalise(document.body.textContent)).toBe(normalise(textBefore))
    expect(notices()).toBe(noticesBefore)
    // Nothing about listening leaves the device: only reads of the public text and audio list.
    expect(calls.every((c) => c.method === "GET" && /^\/api\/(scripture\/quran|discover\/recitations)/.test(c.url))).toBe(true)
    // Only the stop position is kept, on this device (R6); no counter or history.
    expect(Object.keys(localStorage).filter((k) => !k.startsWith("rafeeq.quranPos."))).toEqual([])
  })
})
