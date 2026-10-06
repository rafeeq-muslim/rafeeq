/**
 * KNW-08 R2, verse navigation (learning owner's request, 2026-10-06):
 * tapping a stored verse recites from it and the verses after it follow;
 * «الآية السابقة» / «الآية التالية» next to play jump one verse and recite it;
 * no previous on the first verse, no next on the last. The same controls in
 * the review desk's reciter sample. Verse texts here are placeholders, never
 * scripture (rules.md §1.3).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router"

import { translate, type Locale } from "@/app/i18n"
import { quranpediaUrl } from "@/app/lib/quranpedia"
import { useDevice } from "@/app/stores/device"
import { ListeningPlayer, loadPosition, nextAya, prevAya, type AudioLike } from "./player"
import { SuraPage } from "./Quran"
import { SampleSura } from "./ReciterSample"
import type { VerseReciter } from "./types"

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
type Call = { url: string; method: string }
let calls: Call[] = []

// Placeholders standing in for the stored QuranEnc record of al-Fatiha (7 verses).
const FATIHA = [1, 2, 3, 4, 5, 6, 7].map((aya) => ({ aya, arabic: `STORED_1_${aya}`, translation: null, url: "" }))
const MINSHAWI: VerseReciter = { id: "quranpedia-248", quranpedia_id: 248, reciter: "محمد صديق المنشاوي", source: "Quranpedia", origin_url: "https://quranpedia.net" }
const MUAIQLY = { id: "r1", title: "TEST", reciter: "TEST_RECITER", source: "TEST_SOURCE", origin_url: "", suras: { "1": "https://audio.test/001.mp3" } }
let reciters: VerseReciter[] = [MINSHAWI]

function api(url: string) {
  if (url.startsWith("/api/scripture/quran?sura=1&"))
    return json({ sura: 1, ayat: FATIHA, source: { name: "QuranEnc.com", translation: null, version: "t", loaded: null } })
  if (url.startsWith("/api/discover/recitations")) return json({ lang: "ar", recitation: MUAIQLY, reciters })
  return new Response(JSON.stringify({ detail: "not found" }), { status: 404 })
}

const played: string[] = []
let audioCtor: ReturnType<typeof vi.fn>
beforeEach(() => {
  calls = []
  played.length = 0
  reciters = [MINSHAWI]
  useDevice.setState({ locale: "ar", discreet: false })
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET" })
      return api(url)
    }),
  )
  audioCtor = vi.fn() // a second sound source would be created through this (R1)
  vi.stubGlobal("Audio", audioCtor)
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} unobserve() {} })
  Element.prototype.scrollIntoView = vi.fn()
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async function (this: HTMLMediaElement) {
    played.push(this.src)
  })
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

const L = () => useDevice.getState().locale as Locale
const tr = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(L(), key, vars)
const verse = (aya: number) => document.querySelector(`[data-aya="${aya}"]`) as HTMLElement
const audio = () => document.querySelector("audio")!
const highlighted = () => [...document.querySelectorAll("[aria-current]")].map((el) => Number((el as HTMLElement).dataset.aya))
const tapVerse = (aya: number) => fireEvent.click(within(verse(aya)).getByRole("button", { name: new RegExp(`^${tr("discover.quran.reciteFrom", { n: aya })}`) }))
const prevBtn = () => screen.getByRole("button", { name: tr("discover.quran.prevVerse") }) as HTMLButtonElement
const nextBtn = () => screen.getByRole("button", { name: tr("discover.quran.nextVerse") }) as HTMLButtonElement
const url = (aya: number) => quranpediaUrl(248, 1, aya)

function wrap(node: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>)
}
function renderFatiha() {
  return wrap(
    <MemoryRouter initialEntries={["/discover/quran/1"]}>
      <Routes>
        <Route path="/discover/quran/:sura" element={<SuraPage />} />
      </Routes>
    </MemoryRouter>,
  )
}
async function openFatiha() {
  renderFatiha()
  await waitFor(() => expect(verse(7)).toBeTruthy())
  await screen.findByRole("group", { name: tr("discover.quran.verseControls") })
}

describe("KNW-08 R2: tap a verse, previous / next verse", () => {
  it("knw-08-r2 example: Joseph listens to al-Fatiha with verse 2 recited; he taps verse 5 and it is recited and highlighted; «الآية السابقة» recites verse 4; on verse 1 «الآية السابقة» does nothing", async () => {
    await openFatiha()
    fireEvent.click(screen.getByRole("button", { name: "استمع إلى التلاوة" }))
    act(() => void fireEvent.ended(audio()))
    expect(played.at(-1)).toBe(url(2))
    expect(highlighted()).toEqual([2])

    tapVerse(5)
    expect(played.at(-1)).toBe("https://files.quranpedia.net/recitations/248/001005.mp3")
    expect(highlighted()).toEqual([5])
    expect(verse(5).textContent).toContain("STORED_1_5")

    fireEvent.click(screen.getByRole("button", { name: "الآية السابقة" }))
    expect(played.at(-1)).toBe(url(4))
    expect(highlighted()).toEqual([4])

    tapVerse(1)
    expect(highlighted()).toEqual([1])
    const before = played.length
    expect(prevBtn().disabled).toBe(true)
    fireEvent.click(prevBtn())
    expect(played.length).toBe(before)
    expect(highlighted()).toEqual([1])
  })

  it("knw-08-r2: tapping a verse before playing starts there, then the verses after it follow as usual", async () => {
    await openFatiha()
    tapVerse(3)
    expect(played).toEqual([url(3)])
    expect(screen.getByRole("button", { name: "أوقف التلاوة" })).toBeTruthy()
    act(() => void fireEvent.ended(audio()))
    act(() => void fireEvent.ended(audio()))
    expect(played).toEqual([url(3), url(4), url(5)])
    expect(highlighted()).toEqual([5])
  })

  it("knw-08-r2: «الآية التالية» jumps one verse and recites it; on the last verse there is no next", async () => {
    await openFatiha()
    fireEvent.click(nextBtn()) // nothing played yet: from verse 1 to verse 2
    expect(played).toEqual([url(2)])
    tapVerse(6)
    fireEvent.click(nextBtn())
    expect(played.at(-1)).toBe(url(7))
    expect(highlighted()).toEqual([7])
    expect(nextBtn().disabled).toBe(true)
    expect(prevBtn().disabled).toBe(false)
    fireEvent.click(nextBtn())
    expect(played.at(-1)).toBe(url(7))
    expect(played.length).toBe(3)
    act(() => void fireEvent.ended(audio())) // the surah ends as before
    expect(highlighted()).toEqual([])
  })

  it("knw-08-r2: before anything plays, the first verse has no previous", async () => {
    await openFatiha()
    expect(prevBtn().disabled).toBe(true)
    expect(nextBtn().disabled).toBe(false)
  })

  it("knw-08-r2: a jump to a verse off screen scrolls to it, without smooth scrolling under reduced motion", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q }))
    await openFatiha()
    tapVerse(5)
    vi.spyOn(verse(6), "getBoundingClientRect").mockReturnValue({ top: 2000, bottom: 2100 } as DOMRect)
    vi.mocked(Element.prototype.scrollIntoView).mockClear()
    fireEvent.click(nextBtn())
    const scroll = vi.mocked(Element.prototype.scrollIntoView)
    expect(scroll.mock.contexts).toContain(verse(6))
    expect(scroll).toHaveBeenLastCalledWith({ block: "center", behavior: "auto" })
  })

  it("knw-08-r2 / R1 / R5: jumps add no other sound, send nothing and count nothing", async () => {
    await openFatiha()
    tapVerse(4)
    fireEvent.click(prevBtn())
    fireEvent.click(nextBtn())
    for (let i = 0; i < 4; i++) act(() => void fireEvent.ended(audio()))
    expect(document.querySelectorAll("audio")).toHaveLength(1)
    expect(audioCtor).not.toHaveBeenCalled()
    expect(played.every((u) => u.startsWith("https://files.quranpedia.net/recitations/248/001"))).toBe(true)
    expect(calls.every((c) => c.method === "GET" && /^\/api\/(scripture\/quran|discover\/recitations)/.test(c.url))).toBe(true)
    expect(document.body.textContent).not.toMatch(/أحسنت|أتممت|نقاط|سلسلة/)
  })

  it("knw-08-r2 / R6: stopping after a jump keeps that verse on this device", async () => {
    await openFatiha()
    tapVerse(5)
    fireEvent.click(prevBtn())
    fireEvent.click(screen.getByRole("button", { name: "أوقف التلاوة" }))
    expect(loadPosition(1)?.aya).toBe(4)
  })

  it("knw-08-r2: discreet mode: tapping and jumping put nothing about the Quran on the lock screen", async () => {
    useDevice.setState({ discreet: true })
    const session = { metadata: null as unknown }
    Object.defineProperty(navigator, "mediaSession", { value: session, configurable: true })
    await openFatiha()
    tapVerse(2)
    fireEvent.click(nextBtn())
    expect(session.metadata).toBeNull()
  })

  it("knw-08-r2: with al-Muaiqly's single surah file there are no verse boundaries: no previous/next and verses are not buttons", async () => {
    reciters = []
    renderFatiha()
    await waitFor(() => expect(verse(7)).toBeTruthy())
    await screen.findByRole("button", { name: "استمع إلى التلاوة" })
    expect(screen.queryByRole("button", { name: "الآية السابقة" })).toBeNull()
    expect(screen.queryByRole("button", { name: "الآية التالية" })).toBeNull()
    expect(within(verse(5)).queryByRole("button", { name: /ابدأ التلاوة/ })).toBeNull()
  })

  it.each([
    ["en", "Previous verse", "Next verse", "Verse controls", "Recite from verse 5:"],
    ["tl", "Nakaraang talata", "Susunod na talata", "Paglipat sa mga talata", "Bigkasin mula sa talata 5:"],
    ["ar", "الآية السابقة", "الآية التالية", "التنقّل بين الآيات", "ابدأ التلاوة من الآية 5:"],
  ] as const)("knw-08-r2: accessible labels in %s", async (locale, prev, next, group, recite) => {
    useDevice.setState({ locale })
    renderFatiha()
    await waitFor(() => expect(verse(7)).toBeTruthy())
    const controls = await screen.findByRole("group", { name: group })
    expect(within(controls).getByRole("button", { name: prev })).toBeTruthy()
    expect(within(controls).getByRole("button", { name: next })).toBeTruthy()
    expect(within(controls).getByRole("button", { name: translate(locale, "discover.quran.play") })).toBeTruthy()
    // The verse button's name keeps the stored text after the cue.
    expect(within(verse(5)).getByRole("button").textContent).toBe(`${recite}STORED_1_5 ﴿5﴾`)
  })

  it("knw-08-r2: tapping the verse being recited starts it again from its beginning; play after pause resumes it", () => {
    const log: string[] = []
    const el: AudioLike = {
      src: "",
      currentTime: 0,
      paused: true,
      play() {
        log.push(`play ${this.src}@${this.currentTime}`)
      },
      pause() {},
    }
    const p = new ListeningPlayer(el)
    p.playVerse(1, 5, "v5.mp3")
    el.currentTime = 3
    p.pause()
    p.playVerse(1, 5, "v5.mp3") // play: resume
    el.currentTime = 4
    p.playVerse(1, 5, "v5.mp3", true) // tap: from the start
    expect(log).toEqual(["play v5.mp3@0", "play v5.mp3@3", "play v5.mp3@0"])
    expect([prevAya(1), prevAya(5), nextAya(7, 7), nextAya(5, 7)]).toEqual([null, 4, null, 6])
  })
})

describe("KNW-08 R2/R4: the same controls in the review desk's reciter sample", () => {
  it("knw-08-r2: the reviewer taps a verse, steps back and forth, with no previous on the first verse and no next on the last", async () => {
    wrap(<SampleSura reciter={248} sura={1} />)
    await waitFor(() => expect(verse(7)).toBeTruthy())
    expect(prevBtn().disabled).toBe(true)
    tapVerse(5)
    expect(played).toEqual([url(5)])
    expect(highlighted()).toEqual([5])
    fireEvent.click(prevBtn())
    expect(played.at(-1)).toBe(url(4))
    act(() => void fireEvent.ended(audio()))
    expect(played.at(-1)).toBe(url(5)) // continues verse by verse
    tapVerse(7)
    expect(nextBtn().disabled).toBe(true)
    tapVerse(1)
    expect(prevBtn().disabled).toBe(true)
    expect(screen.getByRole("button", { name: "أوقف التلاوة" })).toBeTruthy()
  })
})
