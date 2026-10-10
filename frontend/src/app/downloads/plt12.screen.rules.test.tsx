/** PLT-12 R1 / R6 on screen: the center lists sizes and states; Quranpedia plays online only. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"

import { translate } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import DownloadsScreen from "./DownloadsScreen"
import { OnlineOnlyNote } from "./DownloadControl"
import { useDownloads } from "./store"
import { setDeps } from "./manager"
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

describe("plt-12 owner decision 2026-10-10: a unit's videos are offered under it, one by one", () => {
  it("plt12_videos_unit_size_without_videos_and_each_video_opt_in_with_its_size", async () => {
    const lean = { ...unit(1, 0), files: [], bytes: 4 * MB }
    const wudu: CatalogItem = { ...unit(1, 22 * MB), id: "video:fwudu", kind: "video", ref: "u01-l3", unit: "u01", title: "صفة الوضوء" }
    CATALOG.sections.lessons = [lean, wudu]
    show()
    expect(await screen.findByRole("button", { name: ar("downloads.downloadLabel", { name: "الوحدة 1", size: ar("downloads.size.mb", { n: "4.0" }) }) })).toBeTruthy()
    expect(screen.getByText(ar("downloads.video.unitNote"))).toBeTruthy()
    const name = ar("downloads.video.name", { name: "صفة الوضوء" })
    const button = screen.getByRole("button", { name: ar("downloads.downloadLabel", { name, size: ar("downloads.size.mb", { n: "22.0" }) }) })
    expect(button.textContent).toContain(ar("downloads.video.download"))
    expect(screen.getByRole("list", { name: ar("downloads.video.listLabel") })).toBeTruthy() // under its unit, not a row of its own
    CATALOG.sections.lessons = [unit(1, 50 * MB), unit(2, 12 * MB)]
  })
})

describe("plt-12 owner 2026-10-10: downloading a unit with videos asks whether they come too, with both totals", () => {
  const lean = { ...unit(1, 0), files: [], bytes: Math.round(3.7 * MB) }
  const video = (id: string, bytes: number): CatalogItem => ({ ...unit(1, bytes), id, kind: "video", ref: "u01-l3", unit: "u01", title: id })
  const ITEMS = [lean, video("video:fwudu", 22 * MB), video("video:fsalah", 24.3 * MB), unit(2, 12 * MB)]
  const sizeMb = (n: string) => ar("downloads.size.mb", { n })

  beforeEach(() => {
    CATALOG.sections.lessons = ITEMS
    const cache = { match: async () => undefined, put: async () => undefined, delete: async () => true }
    setDeps({
      fetch: (async () => new Response(null, { status: 404 })) as unknown as typeof fetch,
      caches: { open: async () => cache, delete: async () => true } as unknown as CacheStorage,
      persist: async () => true,
      notify: () => undefined,
    })
  })
  afterEach(() => {
    CATALOG.sections.lessons = [unit(1, 50 * MB), unit(2, 12 * MB)]
  })

  async function openChoice() {
    show()
    fireEvent.click(await screen.findByRole("button", { name: ar("downloads.downloadLabel", { name: "الوحدة 1", size: sizeMb("3.7") }) }))
    return screen.findByRole("alertdialog")
  }

  it("plt12_choice_both_options_with_their_total_size_without_first", async () => {
    const dialog = await openChoice()
    const [first, second] = within(dialog).getAllByRole("button")
    expect(first.textContent).toBe(ar("downloads.choice.without", { size: sizeMb("3.7") }))
    expect(second.textContent).toBe(ar("downloads.choice.with", { size: sizeMb("50.0") })) // 3.7 + 22 + 24.3
    expect(within(dialog).getByText(ar("downloads.choice.body"))).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(first)) // the default
  })

  it("plt12_choice_without_videos_queues_the_unit_only", async () => {
    const dialog = await openChoice()
    fireEvent.click(within(dialog).getByText(ar("downloads.choice.without", { size: sizeMb("3.7") })))
    await waitFor(() => expect(Object.keys(useDownloads.getState().items)).toEqual([lean.id]))
  })

  it("plt12_choice_with_videos_queues_the_unit_and_each_video_as_its_own_item", async () => {
    const dialog = await openChoice()
    fireEvent.click(within(dialog).getByText(ar("downloads.choice.with", { size: sizeMb("50.0") })))
    await waitFor(() => expect(Object.keys(useDownloads.getState().items).sort()).toEqual([lean.id, "video:fsalah", "video:fwudu"].sort()))
  })

  it("plt12_choice_a_unit_without_videos_downloads_with_no_question", async () => {
    show()
    fireEvent.click(await screen.findByRole("button", { name: ar("downloads.downloadLabel", { name: "الوحدة 2", size: sizeMb("12.0") }) }))
    await waitFor(() => expect(Object.keys(useDownloads.getState().items)).toEqual(["unit:u02:ar"]))
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })
})

describe("plt-12-r6 a Quranpedia reciter has no download button", () => {
  it("plt12_r6_quranpedia_reciter_plays_online_only", () => {
    render(<OnlineOnlyNote />)
    expect(screen.getByText(ar("downloads.onlineOnly"))).toBeTruthy()
  })
})
