/**
 * PLT-11 R5: recitation streams verse by verse by default; the whole-surah
 * file (IslamHouse, one MP3 per surah) never starts before its size is shown
 * and accepted, every time. Verse texts are placeholders (rules.md §1.3).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { translate } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { quranpediaUrl } from "@/app/lib/quranpedia"
import { pickReciter, saveReciterChoice, surahMegabytes } from "./reciters"
import type { RecitationResponse, VerseReciter } from "./types"

const MINSHAWI: VerseReciter = { id: "quranpedia-248", quranpedia_id: 248, reciter: "TEST_MINSHAWI", source: "Quranpedia", origin_url: "https://quranpedia.net" }
const BAQARAH_FILE = "https://d1.islamhouse.com/data/ar/ih_quran/x/ar-002-x.mp3"
const MUAIQLY = {
  id: "islamhouse-728787",
  title: "TEST",
  reciter: "TEST_MUAIQLY",
  source: "IslamHouse.com",
  origin_url: "https://islamhouse.com/ar/quran/728787/",
  suras: { "2": BAQARAH_FILE },
  sizes: { "2": 206_968_793 }, // measured 2026-10-06
}

let recitations: RecitationResponse
vi.mock("@/app/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/app/lib/api")>()),
  api: async (path: string) => {
    if (path.startsWith("/api/discover/recitations")) return recitations
    if (path.startsWith("/api/scripture/quran?sura=2")) {
      return {
        sura: 2,
        ayat: [1, 2, 3, 4, 5, 6, 7].map((aya) => ({ aya, arabic: `TEST_ARABIC_${aya}`, translation: null, url: "" })),
        source: { name: "QuranEnc.com", translation: null, version: "1" },
      }
    }
    throw new Error(`unexpected ${path}`)
  },
}))

const { SuraPage } = await import("./Quran")

const played: string[] = []
const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate("ar", key, vars)
beforeEach(() => {
  played.length = 0
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

function renderBaqarah() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/discover/quran/2"]}>
        <Routes>
          <Route path="/discover/quran/:sura" element={<SuraPage />} />
          <Route path="/downloads" element={<p>DOWNLOAD_CENTER</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const size207 = t("plt11.mb", { n: "207" })
const playButton = () => screen.getByRole("button", { name: t("discover.quran.play") })
const verse = (aya: number) => document.querySelector(`[data-aya="${aya}"]`)

async function chooseWholeSurahAndPressPlay() {
  saveReciterChoice(MUAIQLY.id)
  renderBaqarah()
  await waitFor(() => expect(verse(1)).toBeTruthy())
  fireEvent.click(playButton())
}

describe("PLT-11 R5: per-verse by default; the whole-surah file asks first", () => {
  it("test_plt11_r5_approved_per_verse_reciter_is_the_default", async () => {
    expect(pickReciter([MINSHAWI], null, MUAIQLY.id)).toBe(MINSHAWI)
    expect(pickReciter([MINSHAWI], MUAIQLY.id, MUAIQLY.id)).toBeNull() // chosen on purpose
    expect(pickReciter([], null, MUAIQLY.id)).toBeNull() // none approved: the whole-surah files

    recitations = { lang: "ar", recitation: MUAIQLY, reciters: [MINSHAWI] }
    renderBaqarah()
    await waitFor(() => expect(verse(1)).toBeTruthy())
    fireEvent.click(playButton())
    expect(played).toEqual([quranpediaUrl(248, 2, 1)])
  })

  it("test_plt11_r5_per_verse_loads_only_the_verses_heard_never_the_whole_surah", async () => {
    recitations = { lang: "ar", recitation: MUAIQLY, reciters: [MINSHAWI] }
    renderBaqarah()
    await waitFor(() => expect(verse(1)).toBeTruthy())
    fireEvent.click(playButton())
    for (let i = 0; i < 4; i++) act(() => void fireEvent.ended(document.querySelector("audio")!))
    fireEvent.click(screen.getByRole("button", { name: t("discover.quran.pause") }))
    // Five verses heard: five verse files, at most the next one besides, and no surah file.
    expect(played).toEqual([1, 2, 3, 4, 5].map((a) => quranpediaUrl(248, 2, a)))
    expect(played).not.toContain(BAQARAH_FILE)
  })

  it("test_plt11_r5_whole_surah_shows_size_and_nothing_loads_before_the_choice", async () => {
    recitations = { lang: "ar", recitation: MUAIQLY, reciters: [MINSHAWI] }
    await chooseWholeSurahAndPressPlay()
    expect(await screen.findByText(t("plt11.size.title", { size: size207 }))).toBeTruthy()
    expect(played).toEqual([])
    expect(document.querySelector("audio")!.getAttribute("src")).toBeNull()
    expect(document.querySelector("audio")!.getAttribute("preload")).toBe("none")
    // The three choices.
    expect(screen.getByRole("button", { name: t("plt11.size.listen", { size: size207 }) })).toBeTruthy()
    expect(screen.getByRole("button", { name: t("plt11.size.download") })).toBeTruthy()
    expect(screen.getByRole("button", { name: t("plt11.size.perVerse", { name: MINSHAWI.reciter }) })).toBeTruthy()
  })

  it("test_plt11_r5_listen_after_accepting_the_size_plays_the_surah_file", async () => {
    recitations = { lang: "ar", recitation: MUAIQLY, reciters: [MINSHAWI] }
    await chooseWholeSurahAndPressPlay()
    fireEvent.click(await screen.findByRole("button", { name: t("plt11.size.listen", { size: size207 }) }))
    expect(played).toEqual([BAQARAH_FILE])
  })

  it("test_plt11_r5_size_is_asked_every_time_play_is_pressed", async () => {
    recitations = { lang: "ar", recitation: MUAIQLY, reciters: [] }
    renderBaqarah()
    await waitFor(() => expect(verse(1)).toBeTruthy())
    fireEvent.click(playButton())
    fireEvent.click(await screen.findByRole("button", { name: t("plt11.size.listen", { size: size207 }) }))
    fireEvent.click(screen.getByRole("button", { name: t("discover.quran.pause") }))
    await waitFor(() => expect(screen.queryByText(t("plt11.size.title", { size: size207 }))).toBeNull())
    fireEvent.click(playButton())
    expect(await screen.findByText(t("plt11.size.title", { size: size207 }))).toBeTruthy()
    expect(played).toEqual([BAQARAH_FILE]) // not played again before the second OK
    // No per-verse reciter approved: that option is not offered.
    expect(screen.queryByRole("button", { name: t("plt11.size.perVerse", { name: MINSHAWI.reciter }) })).toBeNull()
  })

  it("test_plt11_r5_download_option_opens_the_download_center", async () => {
    recitations = { lang: "ar", recitation: MUAIQLY, reciters: [MINSHAWI] }
    await chooseWholeSurahAndPressPlay()
    fireEvent.click(await screen.findByRole("button", { name: t("plt11.size.download") }))
    expect(await screen.findByText("DOWNLOAD_CENTER")).toBeTruthy()
    expect(played).toEqual([])
  })

  it("test_plt11_r5_switch_to_per_verse_reciter_from_the_size_question", async () => {
    recitations = { lang: "ar", recitation: MUAIQLY, reciters: [MINSHAWI] }
    await chooseWholeSurahAndPressPlay()
    fireEvent.click(await screen.findByRole("button", { name: t("plt11.size.perVerse", { name: MINSHAWI.reciter }) }))
    expect(played).toEqual([quranpediaUrl(248, 2, 1)])
    expect(localStorage.getItem("rafeeq.quranReciter")).toBe(MINSHAWI.id)
  })

  it("test_plt11_r5_size_in_megabytes", () => {
    expect(surahMegabytes(MUAIQLY.sizes, 2)).toBe(207)
    expect(surahMegabytes({ "67": 13_597_678 }, 67)).toBe(14)
    expect(surahMegabytes({ "1": 1_555_438 }, 1)).toBe(1.6)
    expect(surahMegabytes(undefined, 2)).toBeNull()
  })
})
