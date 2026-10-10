/**
 * PLT-12 download center, device side: one test per example where the device
 * decides (the catalogue and the pass-through are tested in
 * backend/tests/test_plt12_downloads.py; the worker in src/sw/).
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"

import { checkUpdates, download, downloadAll, remove, removeAll, resume, setDeps, storageSummary, DOWNLOADS_CACHE } from "./manager"
import { totalStored, useDownloads } from "./store"
import type { Catalog, CatalogFile, CatalogItem } from "./types"
import { wipeDevice } from "@/app/lib/privacy"

const MB = 1024 * 1024

/** Cache Storage stand-in: bodies are read on put (a failing stream fails the put); optional capacity. */
function fakeCaches(capacity = Infinity) {
  const stores = new Map<string, Map<string, { body: ArrayBuffer; type: string }>>()
  const used = () => [...stores.values()].flatMap((m) => [...m.values()]).reduce((n, e) => n + e.body.byteLength, 0)
  const open = async (name: string) => {
    const m = stores.get(name) ?? new Map()
    stores.set(name, m)
    return {
      put: async (k: string, r: Response) => {
        const body = await r.arrayBuffer()
        if (used() + body.byteLength > capacity) throw new DOMException("full", "QuotaExceededError")
        m.set(k, { body, type: r.headers.get("content-type") ?? "" })
      },
      match: async (k: string) => {
        const e = m.get(k)
        return e ? new Response(e.body.slice(0), { headers: { "Content-Type": e.type, "Content-Length": String(e.body.byteLength) } }) : undefined
      },
      delete: async (k: string) => m.delete(k),
      keys: async () => [...m.keys()].map((k) => new Request(new URL(k, "http://localhost"))),
    } as unknown as Cache
  }
  return {
    stores,
    api: {
      open,
      has: async (n: string) => stores.has(n),
      delete: async (n: string) => stores.delete(n),
      keys: async () => [...stores.keys()],
      match: async () => undefined,
    } as unknown as CacheStorage,
    keysOf: (name = DOWNLOADS_CACHE) => [...(stores.get(name)?.keys() ?? [])],
  }
}

const text = (key: string, bytes = 100): CatalogFile => ({ id: `t-${key}`, url: key, key, bytes, mime: "application/json", kind: "text" })
const media = (name: string, bytes: number): CatalogFile => ({
  id: `f-${name}`,
  url: `/api/downloads/file/f-${name}`,
  key: `https://d1.islamhouse.com/${name}`,
  bytes,
  mime: "video/mp4",
  kind: "media",
})
function item(id: string, files: CatalogFile[], extra: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id,
    section: "lessons",
    kind: "unit",
    ref: id,
    title: id,
    files,
    bytes: files.reduce((n, f) => n + (f.bytes ?? 0), 0),
    sizes_known: true,
    version: "v1",
    downloadable: true,
    reason: null,
    ...extra,
  }
}
const catalog = (...items: CatalogItem[]): Catalog => ({ lang: "ar", cap_bytes: 300 * MB, sections: { lessons: items, quran: [], library: [] } })

let net: Mock<(url: string, init?: RequestInit) => Promise<Response>>
let fail: Set<string>
let cache: ReturnType<typeof fakeCaches>
let persist: Mock<() => Promise<boolean>>

function server(sizes: Record<string, number> = {}) {
  fail = new Set()
  net = vi.fn(async (url: string) => {
    if (fail.has(url)) throw new TypeError("Failed to fetch")
    const n = sizes[url] ?? 100
    return new Response(new Uint8Array(n), { headers: { "Content-Length": String(n) } })
  })
}

beforeEach(() => {
  useDownloads.setState({ items: {}, progress: {}, persistAsked: false })
  cache = fakeCaches()
  persist = vi.fn(async () => true)
  server()
  setDeps({ fetch: net as unknown as typeof fetch, caches: cache.api, persist, notify: () => undefined })
})

const UNIT1 = item("unit:u01:ar", [text("/api/content?lang=ar", 300), media("wudu.mp4", 2000), media("salah.mp4", 2500)])

describe("plt-12-r2 an item counts as downloaded only when all its files are complete", () => {
  it("plt12_r2_unit_is_downloaded_after_every_file", async () => {
    server({ [UNIT1.files[1].url]: 2000, [UNIT1.files[2].url]: 2500 })
    setDeps({ fetch: net as unknown as typeof fetch, caches: cache.api, persist, notify: () => undefined })
    await download(UNIT1, "ar")
    const saved = useDownloads.getState().items[UNIT1.id]
    expect(saved.status).toBe("done")
    expect(cache.keysOf().sort()).toEqual(UNIT1.files.map((f) => f.key).sort())
    expect(totalStored(useDownloads.getState().items)).toBe(100 + 2000 + 2500) // actual bytes, not the estimate
  })

  it("plt12_r2_interrupted_item_is_not_downloaded", async () => {
    fail.add(UNIT1.files[2].url)
    await download(UNIT1, "ar")
    const saved = useDownloads.getState().items[UNIT1.id]
    expect(saved.status).toBe("paused")
    expect(saved.done).toEqual([UNIT1.files[0].key, UNIT1.files[1].key])
  })
})

describe("plt-12-r3 nothing downloads without the learner's request; text updates silently", () => {
  it("plt12_r3_no_request_no_download", async () => {
    await checkUpdates(catalog(UNIT1))
    await resume()
    expect(net).not.toHaveBeenCalled()
    expect(totalStored(useDownloads.getState().items)).toBe(0)
  })

  it("plt12_r3_changed_lesson_text_is_refreshed_without_asking", async () => {
    await download(UNIT1, "ar")
    net.mockClear()
    await checkUpdates(catalog({ ...UNIT1, version: "v2" }))
    expect(net.mock.calls.map((c) => c[0])).toEqual(["/api/content?lang=ar"]) // the text only
    const saved = useDownloads.getState().items[UNIT1.id]
    expect(saved.version).toBe("v2")
    expect(saved.update).toBeNull()
  })

  it("plt12_r3_changed_video_is_offered_with_its_size_not_downloaded", async () => {
    await download(UNIT1, "ar")
    net.mockClear()
    const next = { ...UNIT1, version: "v2", files: [UNIT1.files[0], media("wudu-v2.mp4", 3000), UNIT1.files[2]] }
    await checkUpdates(catalog(next))
    expect(net.mock.calls.map((c) => c[0])).not.toContain(next.files[1].url)
    expect(useDownloads.getState().items[UNIT1.id].update).toEqual({ bytes: 3000, version: "v2" })
    await download(next, "ar") // on request: the new file comes, the old one goes
    expect(cache.keysOf()).toContain(next.files[1].key)
    expect(cache.keysOf()).not.toContain(UNIT1.files[1].key)
  })
})

describe("plt-12-r4 delete one or all; no device or account id; erase removes everything", () => {
  it("plt12_r4_deleting_a_unit_frees_its_space_and_keeps_shared_files", async () => {
    const unit2 = item("unit:u02:ar", [text("/api/content?lang=ar", 300), media("ghusl.mp4", 1000)])
    await download(UNIT1, "ar")
    await download(unit2, "ar")
    const before = totalStored(useDownloads.getState().items)
    await remove(UNIT1.id)
    expect(useDownloads.getState().items[UNIT1.id]).toBeUndefined()
    expect(totalStored(useDownloads.getState().items)).toBe(before - 200) // its two videos (100 B each here)
    expect(cache.keysOf().sort()).toEqual(["/api/content?lang=ar", "https://d1.islamhouse.com/ghusl.mp4"])
  })

  it("plt12_r4_delete_all", async () => {
    await download(UNIT1, "ar")
    await removeAll()
    expect(useDownloads.getState().items).toEqual({})
    expect(cache.stores.has(DOWNLOADS_CACHE)).toBe(false)
  })

  it("plt12_r4_download_requests_carry_no_account_or_device_id", async () => {
    await download(UNIT1, "ar")
    for (const [, init] of net.mock.calls) {
      expect(init).toEqual({ credentials: "omit", cache: "no-store" })
    }
  })

  it("plt12_r4_erasing_the_device_leaves_no_download_and_no_name", async () => {
    vi.stubGlobal("caches", cache.api)
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })))
    await download(UNIT1, "ar")
    expect(localStorage.getItem("rafeeq.downloads")).toContain("unit:u01:ar")
    await wipeDevice(() => undefined)
    expect(localStorage.getItem("rafeeq.downloads")).toBeNull()
    expect(cache.stores.has(DOWNLOADS_CACHE)).toBe(false)
    vi.unstubAllGlobals()
  })
})

describe("plt-12-r5 interrupted or out of space: no partial file, the learner knows", () => {
  it("plt12_r5_asks_the_browser_to_keep_storage_before_the_first_download", async () => {
    await download(UNIT1, "ar")
    await download(item("unit:u02:ar", [media("x.mp4", 10)]), "ar")
    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist.mock.invocationCallOrder[0]).toBeLessThan(net.mock.invocationCallOrder[0])
  })

  it("plt12_r5_space_runs_out_download_stops_and_its_files_are_deleted", async () => {
    const small = item("surah:1:ar", [media("fatiha.mp3", 1000)], { section: "quran", kind: "surah" })
    const big = item("unit:u01:ar", [text("/api/content?lang=ar", 300), media("wudu.mp4", 5000), media("salah.mp4", 5000)])
    server({ [small.files[0].url]: 1000, [big.files[1].url]: 5000, [big.files[2].url]: 5000 })
    cache = fakeCaches(8000) // ~10 MB left while a 50 MB unit is downloading, scaled down
    setDeps({ fetch: net as unknown as typeof fetch, caches: cache.api, persist, notify: () => undefined })
    await download(small, "ar")
    await download(big, "ar")
    const saved = useDownloads.getState().items[big.id]
    expect(saved.status).toBe("failed")
    expect(saved.error).toBe("quota")
    expect(saved.needed).toBe(big.bytes)
    expect(cache.keysOf()).toEqual([small.files[0].key]) // the earlier download is intact
    expect(useDownloads.getState().items[small.id].status).toBe("done")
  })

  it("plt12_r5_resumes_from_where_it_stopped_when_the_connection_returns", async () => {
    fail.add(UNIT1.files[2].url)
    await download(UNIT1, "ar")
    fail.clear()
    net.mockClear()
    window.dispatchEvent(new Event("online"))
    await resume()
    expect(net.mock.calls.map((c) => c[0])).toEqual([UNIT1.files[2].url]) // only the missing file
    expect(useDownloads.getState().items[UNIT1.id].status).toBe("done")
  })

  it("plt12_r5_incomplete_body_is_never_kept", async () => {
    net.mockImplementation(async () => new Response(new Uint8Array(50), { headers: { "Content-Length": "100" } }))
    await download(item("surah:67:ar", [media("mulk.mp3", 100)]), "ar")
    expect(cache.keysOf()).toEqual([])
    expect(useDownloads.getState().items["surah:67:ar"].status).toBe("paused")
  })
})

describe("plt-12-r6 only what the licence allows", () => {
  it("plt12_r6_item_over_the_cap_is_not_downloaded", async () => {
    await download(item("surah:2:ar", [media("baqara.mp3", 310 * MB)], { downloadable: false, reason: "too_large" }), "ar")
    expect(net).not.toHaveBeenCalled()
    expect(useDownloads.getState().items).toEqual({})
  })
})

describe("plt-12-r1 storage in three parts", () => {
  it("plt12_r1_nothing_downloaded_shows_zero_and_the_app_about_2mb", async () => {
    vi.stubGlobal("navigator", { ...navigator, storage: { estimate: async () => ({ usage: 2 * MB, quota: 1000 * MB }) } })
    const s = await storageSummary(totalStored(useDownloads.getState().items), localStorage)
    expect(s.downloads).toBe(0)
    expect(s.app).toBeGreaterThan(1.9 * MB)
    expect(s.available).toBe(998 * MB)
    vi.unstubAllGlobals()
  })
})

// Owner decision 2026-10-10: a unit downloads without its videos; each video is its own opt-in item.
describe("plt-12 videos load lazily: never in a unit download, opt-in one by one", () => {
  const WUDU = media("wudu.mp4", 2000)
  const SALAH = media("salah.mp4", 2500)
  const LEAN = item("unit:u01:ar", [text("/api/content?lang=ar", 300), media("fatiha.mp3", 400)], { version: "v2" })
  const video = (f: CatalogFile) => item(`video:${f.id}`, [f], { kind: "video", ref: "u01-l3", unit: "u01", title: "الوضوء" })

  it("plt12_videos_unit_download_fetches_no_video", async () => {
    await download(LEAN, "ar")
    expect(useDownloads.getState().items[LEAN.id].status).toBe("done")
    expect(net.mock.calls.map((c) => c[0])).not.toContain(WUDU.url)
    expect(cache.keysOf()).not.toContain(WUDU.key)
  })

  it("plt12_choice_with_videos_downloads_the_unit_and_each_video_removable_alone", async () => {
    await download(video(WUDU), "ar") // already on the device: left as it is
    net.mockClear()
    await downloadAll([LEAN, video(WUDU), video(SALAH)], "ar")
    const items = useDownloads.getState().items
    expect([items[LEAN.id], items[`video:${WUDU.id}`], items[`video:${SALAH.id}`]].map((i) => i.status)).toEqual(["done", "done", "done"])
    expect(net.mock.calls.map((c) => c[0])).not.toContain(WUDU.url) // not fetched twice
    expect(cache.keysOf()).toEqual(expect.arrayContaining([WUDU.key, SALAH.key]))
    await remove(`video:${SALAH.id}`)
    expect(cache.keysOf()).not.toContain(SALAH.key)
    expect(useDownloads.getState().items[LEAN.id].status).toBe("done")
  })

  it("plt12_videos_one_video_downloads_on_request_and_is_deleted_alone", async () => {
    await download(LEAN, "ar")
    await download(video(WUDU), "ar")
    expect(useDownloads.getState().items[`video:${WUDU.id}`].status).toBe("done")
    expect(cache.keysOf()).toContain(WUDU.key)
    expect(cache.keysOf()).not.toContain(SALAH.key)
    await remove(`video:${WUDU.id}`)
    expect(cache.keysOf()).not.toContain(WUDU.key)
    expect(useDownloads.getState().items[LEAN.id].status).toBe("done") // the unit stays
  })

  it("plt12_videos_a_unit_downloaded_with_videos_keeps_them_as_items_of_their_own", async () => {
    await download(item(LEAN.id, [...LEAN.files, WUDU, SALAH]), "ar") // before the decision: the unit held both videos
    net.mockClear()
    await checkUpdates(catalog(LEAN, video(WUDU), video(SALAH)))
    const items = useDownloads.getState().items
    expect(items[`video:${WUDU.id}`]).toMatchObject({ status: "done", done: [WUDU.key] })
    expect(items[`video:${SALAH.id}`]).toMatchObject({ status: "done", done: [SALAH.key] })
    expect(cache.keysOf()).toEqual(expect.arrayContaining([WUDU.key, SALAH.key])) // nothing deleted silently
    expect(items[LEAN.id].files.map((f) => f.key)).not.toContain(WUDU.key)
    expect(net.mock.calls.map((c) => c[0])).not.toContain(WUDU.url) // nothing fetched again
    await remove(`video:${WUDU.id}`) // the learner removes a video from the center when they wish
    expect(cache.keysOf()).not.toContain(WUDU.key)
    expect(cache.keysOf()).toContain(SALAH.key)
  })
})
