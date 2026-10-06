/** PLT-12 R1 / R6 on screen: the center lists sizes and states; Quranpedia plays online only. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"

import { translate } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import DownloadsScreen from "./DownloadsScreen"
import { OnlineOnlyNote } from "./DownloadControl"
import { useDownloads } from "./store"
import type { Catalog, CatalogItem } from "./types"

const MB = 1024 * 1024
const unit = (n: number, bytes: number): CatalogItem => ({
  id: `unit:u0${n}:ar`,
  section: "lessons",
  kind: "unit",
  ref: `u0${n}`,
  title: `الوحدة ${n}`,
  files: [{ id: `f${n}`, url: `/api/downloads/file/f${n}`, key: `https://d1.islamhouse.com/${n}.mp4`, bytes, mime: "video/mp4", kind: "media" }],
  bytes,
  sizes_known: true,
  version: "v1",
  downloadable: true,
  reason: null,
})
const CATALOG: Catalog = { lang: "ar", cap_bytes: 300 * MB, sections: { lessons: [unit(1, 50 * MB), unit(2, 12 * MB)], quran: [], library: [] } }

beforeEach(() => {
  useDevice.setState({ locale: "ar" })
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.startsWith("/api/downloads/catalog") ? new Response(JSON.stringify(CATALOG), { headers: { "Content-Type": "application/json" } }) : new Response("{}", { status: 404 }),
    ),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useDownloads.setState({ items: {}, progress: {} })
})

function show() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <DownloadsScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const ar = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate("ar", k, v)

describe("plt-12-r1 the center shows what can be downloaded, sizes and what is downloaded", () => {
  it("plt12_r1_downloaded_unit_shows_downloaded_with_its_size_and_others_a_download_button", async () => {
    const u1 = unit(1, 50 * MB)
    useDownloads.setState({
      items: { [u1.id]: { ...u1, lang: "ar", done: [u1.files[0].key], status: "done", error: null, update: null, obsolete: [] } },
    })
    show()
    expect((await screen.findAllByText(ar("downloads.status.done"), { exact: false })).length).toBeGreaterThan(0)
    expect(screen.getAllByText(ar("downloads.size.mb", { n: "50.0" }), { exact: false }).length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: ar("downloads.downloadLabel", { name: "الوحدة 2", size: ar("downloads.size.mb", { n: "12.0" }) }) })).toBeTruthy()
  })

  it("plt12_r1_nothing_downloaded_shows_zero_downloads", async () => {
    show()
    expect(await screen.findByText(ar("downloads.mineEmpty"))).toBeTruthy()
    expect(screen.getByText(ar("downloads.storage.downloads"), { selector: "dt" }).nextSibling?.textContent).toBe(ar("downloads.size.b", { n: "0" }))
    expect(screen.getByText(ar("downloads.cacheNote"))).toBeTruthy()
  })
})

describe("plt-12-r6 a Quranpedia reciter has no download button", () => {
  it("plt12_r6_quranpedia_reciter_plays_online_only", () => {
    render(<OnlineOnlyNote />)
    expect(screen.getByText(ar("downloads.onlineOnly"))).toBeTruthy()
  })
})
