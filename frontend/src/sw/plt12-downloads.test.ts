// @vitest-environment node
/**
 * PLT-12 service worker part: a downloaded file answers the page's own request
 * offline, with Range for seeking (R2 example: Al-Mulk heard in full offline);
 * text is network first and refreshed silently (R3).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("workbox-routing", () => ({ registerRoute: () => undefined }))

import { DOWNLOADS_CACHE, handle, isDownloaded, rangeResponse, reloadKeys } from "./plt12-downloads"

const ORIGIN = "http://localhost"
const MULK = "https://d1.islamhouse.com/data/ar/ih_quran/maher/ar-067-maher.mp3"
const PAGE = `${ORIGIN}/api/scripture/quran?sura=67&from=1&to=30&lang=en`

function fakeCaches(entries: Record<string, Response>) {
  const m = new Map(Object.entries(entries))
  const cache = {
    match: async (k: string) => m.get(k)?.clone(),
    put: async (k: string, r: Response) => void m.set(k, r),
    keys: async () => [...m.keys()].map((k) => new Request(k)),
  }
  return { m, api: { has: async (n: string) => n === DOWNLOADS_CACHE, open: async () => cache } as unknown as CacheStorage }
}

const audio = (n: number) => new Response(new Uint8Array(n).map((_, i) => i % 256), { headers: { "Content-Type": "audio/mpeg" } })

let store: ReturnType<typeof fakeCaches>
beforeEach(() => {
  store = fakeCaches({ [MULK]: audio(1000), [PAGE]: new Response('{"old":true}') })
})

describe("plt-12-r2 a downloaded surah plays offline, seeking included", () => {
  it("plt12_r2_worker_knows_the_downloaded_urls", async () => {
    await reloadKeys(store.api)
    expect(isDownloaded(MULK)).toBe(true)
    expect(isDownloaded("https://d1.islamhouse.com/other.mp3")).toBe(false)
  })

  it("plt12_r2_original_media_url_is_answered_from_the_cache", async () => {
    const offline = vi.fn(async () => Promise.reject(new TypeError("offline")))
    const res = await handle(new Request(MULK), new URL(MULK), ORIGIN, store.api, offline)
    expect(res.status).toBe(200)
    expect((await res.arrayBuffer()).byteLength).toBe(1000)
    expect(offline).not.toHaveBeenCalled()
  })

  it("plt12_r2_seeking_gets_the_requested_range", async () => {
    const res = await handle(new Request(MULK, { headers: { Range: "bytes=100-199" } }), new URL(MULK), ORIGIN, store.api)
    expect(res.status).toBe(206)
    expect(res.headers.get("content-range")).toBe("bytes 100-199/1000")
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(bytes.length).toBe(100)
    expect(bytes[0]).toBe(100)
  })

  it("plt12_r2_open_and_suffix_ranges_and_out_of_range", async () => {
    expect((await rangeResponse("bytes=900-", audio(1000))).headers.get("content-range")).toBe("bytes 900-999/1000")
    expect((await rangeResponse("bytes=-10", audio(1000))).headers.get("content-range")).toBe("bytes 990-999/1000")
    expect((await rangeResponse("bytes=5000-", audio(1000))).status).toBe(416)
  })
})

describe("plt-12-r3 downloaded text: newest when online, the copy when offline", () => {
  it("plt12_r3_online_text_replaces_the_downloaded_copy", async () => {
    const net = vi.fn(async () => new Response('{"new":true}', { status: 200 }))
    const res = await handle(new Request(PAGE), new URL(PAGE), ORIGIN, store.api, net)
    expect(await res.json()).toEqual({ new: true })
    expect(await store.m.get(PAGE)!.clone().json()).toEqual({ new: true })
  })

  it("plt12_r3_offline_text_comes_from_the_download", async () => {
    const net = vi.fn(async () => Promise.reject(new TypeError("offline")))
    const res = await handle(new Request(PAGE), new URL(PAGE), ORIGIN, store.api, net as unknown as typeof fetch)
    expect(await res.json()).toEqual({ old: true })
  })
})
