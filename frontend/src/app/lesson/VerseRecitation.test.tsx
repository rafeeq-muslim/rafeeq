// @vitest-environment jsdom
/**
 * LRN-01 R4 / LRN-09 R2 (PR #33): the Arabic recitation under a whole-verse
 * card. Approved verse → a plain «استمع» player for that verse's file;
 * pending verse → nothing; a card showing part of a verse → nothing.
 * Media policy: the service worker never routes those files (the CSP's
 * media-src is checked in backend/tests/test_lrn01_r4_recitation.py).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { translate } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import type { QuranRef } from "@/app/learning/types"
import { QURANPEDIA_ORIGIN, quranpediaUrl } from "@/app/lib/quranpedia"
import { VerseBlock, recitationOf } from "./VerseBlock"
import sw from "@/sw.ts?raw"

const recitationUrl = (sura: number, aya: number) => quranpediaUrl(255, sura, aya)

const V21_107 = "وَمَآ أَرۡسَلۡنَٰكَ إِلَّا رَحۡمَةٗ لِّلۡعَٰلَمِينَ"
const V2_110 = "وَأَقِيمُواْ ٱلصَّلَوٰةَ وَءَاتُواْ ٱلزَّكَوٰةَۚ"

function verse(aya: number, arabic: string) {
  return {
    ayat: [{ aya, arabic, translation: "meaning", url: "" }],
    source: { name: "QuranEnc", translation: "Saheeh International", version: "1.1.4" },
  }
}

const view = (quran: QuranRef) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <VerseBlock quran={quran} />
    </QueryClientProvider>,
  )

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const u = new URL(String(input), "http://test")
      const sura = Number(u.searchParams.get("sura"))
      const body = sura === 21 ? verse(107, V21_107) : verse(110, V2_110)
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const listen = (lang: "ar" | "en" | "tl") => translate(lang, "lesson.listen")

describe("lrn-01-r4 / lrn-09-r2 recitation under whole-verse cards", () => {
  it("builds the per-verse file of Quranpedia recitation 255", () => {
    expect(recitationUrl(21, 107)).toBe("https://files.quranpedia.net/recitations/255/021107.mp3")
    expect(recitationUrl(2, 21)).toBe("https://files.quranpedia.net/recitations/255/002021.mp3")
    expect(QURANPEDIA_ORIGIN).toBe("https://files.quranpedia.net") // the host allowed in the CSP's media-src
  })

  it("lrn-01-r3: the figcaption shows the translation's name with its version (QuranEnc terms)", async () => {
    useDevice.setState({ locale: "en" })
    view({ sura: 21, ayat: [107, 107] })
    const caption = await waitFor(() => {
      const c = document.querySelector("figcaption")!
      expect(c.textContent).toContain("Saheeh International")
      return c
    })
    expect(caption.textContent).toContain(`${translate("en", "lesson.translation", { name: "Saheeh International" })} (1.1.4)`)
  })

  it("lrn-09-r2: Joseph presses «استمع» under Al-Anbiya 107 (approved) and the same Arabic file plays in every language", async () => {
    for (const lang of ["ar", "en", "tl"] as const) {
      useDevice.setState({ locale: lang })
      view({ sura: 21, ayat: [107, 107], recite: true })
      const button = await screen.findByRole("button", { name: listen(lang) })
      const audio = document.querySelector("audio")!
      expect(audio.getAttribute("src")).toBe("https://files.quranpedia.net/recitations/255/021107.mp3")
      expect(audio.getAttribute("preload")).toBe("none") // nothing loads before it is pressed
      expect(button).toBeTruthy()
      cleanup()
    }
  })

  it("lrn-01-r4: a verse still pending the reviewer's listening has no player and no file", async () => {
    useDevice.setState({ locale: "en" })
    view({ sura: 21, ayat: [107, 107] })
    await screen.findByText(/رَحۡمَةٗ/)
    expect(screen.queryByRole("button", { name: listen("en") })).toBeNull()
    expect(document.querySelector("audio")).toBeNull()
    expect(document.body.innerHTML).not.toContain("quranpedia")
  })

  it("lrn-09-r2: «وَأَقِيمُوا الصَّلَاةَ» (part of Al-Baqarah 110) gets no recitation, even if marked", async () => {
    useDevice.setState({ locale: "ar" })
    const excerpt: QuranRef = { sura: 2, ayat: [110, 110], excerpt: { words: [1, 2] }, recite: true }
    expect(recitationOf(excerpt)).toBeNull()
    view(excerpt)
    await waitFor(() => expect(screen.getByText(/وَأَقِيمُواْ ٱلصَّلَوٰةَ/)).toBeTruthy())
    expect(screen.queryByRole("button", { name: listen("ar") })).toBeNull()
    expect(document.querySelector("audio")).toBeNull()
  })

  it("pressing «استمع» plays the file, and the same button stops it", async () => {
    useDevice.setState({ locale: "ar" })
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event("play"))
      return Promise.resolve()
    })
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event("pause"))
    })
    view({ sura: 21, ayat: [107, 107], recite: true })
    fireEvent.click(await screen.findByRole("button", { name: listen("ar") }))
    expect(play).toHaveBeenCalledTimes(1)
    fireEvent.click(await screen.findByRole("button", { name: translate("ar", "lesson.recite.stop") }))
    expect(pause).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole("button", { name: listen("ar") })).toBeTruthy()
    play.mockRestore()
    pause.mockRestore()
  })

  it("a file that cannot load says the recitation plays when back online", async () => {
    useDevice.setState({ locale: "en" })
    view({ sura: 21, ayat: [107, 107], recite: true })
    await screen.findByRole("button", { name: listen("en") })
    fireEvent.error(document.querySelector("audio")!)
    expect(await screen.findByText(translate("en", "lesson.recite.offline"))).toBeTruthy()
  })

  it("only a single whole verse is recited", () => {
    expect(recitationOf({ sura: 1, ayat: [1, 7], recite: true })).toBeNull()
    expect(recitationOf({ sura: 21, ayat: [107, 107], recite: false })).toBeNull()
    expect(recitationOf({ sura: 21, ayat: [107, 107], excerpt: null, recite: true })).toBe(recitationUrl(21, 107))
  })
})

describe("lrn-01-r4 media policy", () => {
  it("the service worker routes same-origin requests only, so recitation files bypass it", () => {
    const routes = sw.split("registerRoute(").slice(1)
    expect(routes.length).toBeGreaterThan(0)
    for (const r of routes) {
      if (r.startsWith("new NavigationRoute")) continue // navigations are always same-origin
      expect(r.slice(0, r.indexOf("new "))).toContain("url.origin === self.location.origin")
    }
    expect(sw).not.toContain("quranpedia")
  })
})
