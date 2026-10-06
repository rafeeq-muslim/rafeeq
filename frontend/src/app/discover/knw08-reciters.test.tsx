/**
 * KNW-08 R2 and R4 (decision 2026-10-06): Quranpedia per-verse Hafs
 * reciters approved by the Sharia reviewer, played verse by verse with the
 * stored verse being recited highlighted and kept in view; al-Muaiqly until
 * a reciter is approved.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { useDevice } from "@/app/stores/device"
import { QURANPEDIA_ORIGIN, quranpediaUrl } from "@/app/lib/quranpedia"
import { ListeningPlayer, loadPosition, type AudioLike } from "./player"
import { followVerse, pickReciter } from "./reciters"
import type { RecitationResponse, VerseReciter } from "./types"

// The stored QuranEnc record of al-Ikhlas, as /api/scripture/quran returns it (test fixture).
const IKHLAS = ["قُلۡ هُوَ ٱللَّهُ أَحَدٌ", "ٱللَّهُ ٱلصَّمَدُ", "لَمۡ يَلِدۡ وَلَمۡ يُولَدۡ", "وَلَمۡ يَكُن لَّهُۥ كُفُوًا أَحَدُۢ"]
const MINSHAWI: VerseReciter = {
  id: "quranpedia-248",
  quranpedia_id: 248,
  reciter: "محمد صديق المنشاوي",
  source: "Quranpedia",
  origin_url: "https://quranpedia.net",
}
const AFASY: VerseReciter = { ...MINSHAWI, id: "quranpedia-255", quranpedia_id: 255, reciter: "مشاري راشد العفاسي" }
const MUAIQLY = {
  id: "islamhouse-728787",
  title: "المصحف المرتل",
  reciter: "ماهر بن حمد المعيقلي",
  source: "IslamHouse.com",
  origin_url: "https://islamhouse.com/ar/quran/728787/",
  suras: { "112": "https://d1.islamhouse.com/data/ar/ih_quran/x/ar-112-x.mp3" },
}

let recitations: RecitationResponse
const calls: string[] = []
vi.mock("@/app/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/app/lib/api")>()),
  api: async (path: string) => {
    calls.push(path)
    if (path.startsWith("/api/discover/recitations")) return recitations
    if (path.startsWith("/api/scripture/quran?sura=112")) {
      return {
        sura: 112,
        ayat: IKHLAS.map((arabic, i) => ({ aya: i + 1, arabic, translation: null, url: "" })),
        source: { name: "QuranEnc.com", translation: null, version: "1" },
      }
    }
    throw new Error(`unexpected ${path}`)
  },
}))

const { SuraPage } = await import("./Quran")

const played: string[] = []
beforeEach(() => {
  played.length = 0
  calls.length = 0
  localStorage.clear()
  useDevice.setState({ locale: "ar", discreet: false })
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    played.push(this.src)
    return Promise.resolve()
  })
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined)
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderSura(sura = 112) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/discover/quran/${sura}`]}>
        <Routes>
          <Route path="/discover/quran/:sura" element={<SuraPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const verse = (aya: number) => document.querySelector(`[data-aya="${aya}"]`) as HTMLElement
const audio = () => document.querySelector("audio")!
const offScreen = (el: HTMLElement) =>
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ top: 2000, bottom: 2100, left: 0, right: 0, width: 0, height: 100, x: 0, y: 2000, toJSON: () => ({}) })

describe("KNW-08 R2: verse by verse, the recited verse highlighted", () => {
  it("knw-08-r2 example: Daniel listens to al-Ikhlas by al-Minshawi; when verse 1 ends the highlight moves to «ٱللَّهُ ٱلصَّمَدُ» and the screen follows it", async () => {
    recitations = { lang: "ar", recitation: MUAIQLY, reciters: [MINSHAWI] }
    renderSura()
    await waitFor(() => expect(verse(2)).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "استمع إلى التلاوة" }))
    expect(played).toEqual([quranpediaUrl(248, 112, 1)])
    expect(verse(1).getAttribute("aria-current")).toBe("true")

    offScreen(verse(2))
    vi.mocked(Element.prototype.scrollIntoView).mockClear()
    act(() => void fireEvent.ended(audio()))
    expect(played.at(-1)).toBe("https://files.quranpedia.net/recitations/248/112002.mp3")
    expect(verse(1).getAttribute("aria-current")).toBeNull()
    expect(verse(2).getAttribute("aria-current")).toBe("true")
    expect(verse(2).textContent).toContain("ٱللَّهُ ٱلصَّمَدُ")
    expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts).toContain(verse(2))
  })

  it("knw-08-r2: the highlighted text is the stored verse from /api/scripture/quran, nothing generated", async () => {
    recitations = { lang: "ar", recitation: null, reciters: [MINSHAWI] }
    renderSura()
    await waitFor(() => expect(verse(4)).toBeTruthy())
    expect(calls.filter((c) => c.startsWith("/api/scripture/quran"))).toEqual(["/api/scripture/quran?sura=112&from=1&to=4&lang=ar"])
    IKHLAS.forEach((text, i) => expect(verse(i + 1).textContent).toContain(text))
  })

  it("knw-08-r2: a visible verse is not scrolled to", () => {
    const el = document.createElement("li")
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ top: 200, bottom: 300 } as DOMRect)
    el.scrollIntoView = vi.fn()
    expect(followVerse(el, { innerHeight: 800, matchMedia: () => ({ matches: false }) } as unknown as Window)).toBe(false)
    expect(el.scrollIntoView).not.toHaveBeenCalled()
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ top: 900, bottom: 1000 } as DOMRect)
    expect(followVerse(el, { innerHeight: 800, matchMedia: () => ({ matches: true }) } as unknown as Window)).toBe(true)
    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "auto" }) // reduced motion: no smooth scroll
  })

  it("knw-08-r2: after the last verse the recitation stops, with no completion message (R5) and no other sound (R1)", async () => {
    recitations = { lang: "ar", recitation: null, reciters: [MINSHAWI] }
    renderSura()
    await waitFor(() => expect(verse(4)).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "استمع إلى التلاوة" }))
    for (let i = 0; i < 4; i++) act(() => void fireEvent.ended(audio()))
    expect(played).toEqual([1, 2, 3, 4].map((a) => quranpediaUrl(248, 112, a)))
    expect(document.querySelector("[aria-current]")).toBeNull()
    expect(screen.getByRole("button", { name: "استمع إلى التلاوة" })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/أحسنت|أتممت|نقاط|سلسلة/)
  })

  it("knw-08-r2 / R6: stopping at a verse keeps that verse on this device", async () => {
    recitations = { lang: "ar", recitation: null, reciters: [MINSHAWI] }
    renderSura()
    await waitFor(() => expect(verse(4)).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "استمع إلى التلاوة" }))
    act(() => void fireEvent.ended(audio()))
    act(() => void fireEvent.ended(audio()))
    fireEvent.click(screen.getByRole("button", { name: "أوقف التلاوة" }))
    expect(loadPosition(112)?.aya).toBe(3)
    expect(screen.getByText("تابع من الآية 3")).toBeTruthy()
  })

  it("knw-08-r2: discreet mode: playing puts nothing about the Quran on the lock screen", async () => {
    useDevice.setState({ discreet: true })
    const session = { metadata: null as unknown }
    Object.defineProperty(navigator, "mediaSession", { value: session, configurable: true })
    recitations = { lang: "ar", recitation: null, reciters: [MINSHAWI] }
    renderSura()
    await waitFor(() => expect(verse(1)).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "استمع إلى التلاوة" }))
    act(() => void fireEvent.ended(audio()))
    expect(session.metadata).toBeNull()
  })

  it("knw-08-r2 / R3: a meaning stops the verse; the recitation resumes the same verse where it stopped", () => {
    const log: string[] = []
    const el: AudioLike = {
      src: "",
      currentTime: 0,
      paused: true,
      play() {
        log.push(`play ${this.src}@${this.currentTime}`)
      },
      pause() {
        log.push("pause")
      },
    }
    const p = new ListeningPlayer(el)
    p.playVerse(112, 2, "v2.mp3")
    el.currentTime = 1.5
    p.playMeaning(112, 2, "tl-112002.mp3")
    p.playVerse(112, 2, "v2.mp3")
    expect(log).toEqual(["pause", "play v2.mp3@0", "pause", "play tl-112002.mp3@0", "pause", "play v2.mp3@1.5"])
  })
})

describe("KNW-08 R4: reciters", () => {
  it("knw-08-r4: until a reciter is approved, al-Muaiqly's surah file plays, without highlighting", async () => {
    recitations = { lang: "ar", recitation: MUAIQLY, reciters: [] }
    renderSura()
    await waitFor(() => expect(verse(1)).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "استمع إلى التلاوة" }))
    expect(played).toEqual([]) // PLT-11 R5: the size first
    fireEvent.click(await screen.findByRole("button", { name: "استمع (غير معروف)" }))
    expect(played).toEqual([MUAIQLY.suras["112"]])
    expect(document.querySelector("[aria-current]")).toBeNull()
    expect(document.body.textContent).toContain("بصوت ماهر بن حمد المعيقلي")
  })

  it("knw-08-r4 example: an approved reciter is shown with the reciter's name and the source", async () => {
    recitations = { lang: "ar", recitation: MUAIQLY, reciters: [MINSHAWI] }
    renderSura()
    await waitFor(() => expect(verse(1)).toBeTruthy())
    expect(document.body.textContent).toContain("بصوت محمد صديق المنشاوي (Quranpedia)")
    expect(document.body.textContent).not.toContain("المعيقلي")
  })

  it("knw-08-r4: the learner's choice among approved reciters stays on the device; an unapproved choice falls back", () => {
    expect(pickReciter([MINSHAWI, AFASY], "quranpedia-255")).toBe(AFASY)
    expect(pickReciter([MINSHAWI, AFASY], "quranpedia-249")).toBe(MINSHAWI)
    expect(pickReciter([MINSHAWI], null)).toBe(MINSHAWI)
    expect(pickReciter([], "quranpedia-255")).toBeNull() // → al-Muaiqly
  })

  it("knw-08-r4: verse files come only from Quranpedia's own host, by reciter, surah and verse", () => {
    expect(QURANPEDIA_ORIGIN).toBe("https://files.quranpedia.net")
    expect(quranpediaUrl(254, 2, 255)).toBe("https://files.quranpedia.net/recitations/254/002255.mp3")
    expect(quranpediaUrl(248, 112, 2)).toBe("https://files.quranpedia.net/recitations/248/112002.mp3")
  })
})
