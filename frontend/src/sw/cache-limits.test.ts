/**
 * Security review 2026-10-07 (A-L6): the worker's runtime caches have a
 * ceiling, without breaking PLT-12 (downloads are never evicted) or PLT-15
 * (lessons and «يومي» stay offline with no time limit), and erasing the
 * device removes what the limits recorded.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("workbox-expiration", () => ({
  ExpirationPlugin: class {
    config: unknown
    deleteCacheAndMetadata = vi.fn(async () => undefined)
    constructor(config: unknown) {
      this.config = config
    }
  },
}))

import { CONTENT_CACHE, FORGET_MESSAGE, MEDIA_CACHE, OFFLINE_CACHE } from "../app/offline/paths"
import { wipeDevice, signOutAndErase } from "../app/lib/privacy"
import { CACHE_LIMITS, forgetAll, limitOf, registerForget } from "./cache-limits"
import { DOWNLOADS_CACHE } from "./plt12-downloads"
import swSource from "../sw.ts?raw"
import downloadsSource from "./plt12-downloads.ts?raw"
import offlineSource from "./plt15-offline.ts?raw"

afterEach(() => {
  vi.unstubAllGlobals()
  delete (navigator as { serviceWorker?: unknown }).serviceWorker
})

describe("A-L6: bounded runtime caches", () => {
  it("sec_a_l6_the_three_runtime_caches_have_a_ceiling", () => {
    expect(Object.keys(CACHE_LIMITS).sort()).toEqual([CONTENT_CACHE, MEDIA_CACHE, OFFLINE_CACHE].sort())
    for (const limit of Object.values(CACHE_LIMITS)) expect(limit.maxEntries).toBeGreaterThan(0)
    expect((limitOf(CONTENT_CACHE) as unknown as { config: unknown }).config).toEqual(CACHE_LIMITS[CONTENT_CACHE])
    expect(limitOf(CONTENT_CACHE)).toBe(limitOf(CONTENT_CACHE)) // one plugin a cache
  })

  it("sec_a_l6_plt15_lessons_and_daily_content_never_expire_by_age", () => {
    // PLT-15 R2/R3: readable offline however long the device was away.
    expect(CACHE_LIMITS[CONTENT_CACHE].maxAgeSeconds).toBeUndefined()
    expect(CACHE_LIMITS[OFFLINE_CACHE].maxAgeSeconds).toBeUndefined()
    expect(CACHE_LIMITS[CONTENT_CACHE].purgeOnQuotaError).toBeFalsy()
    expect(CACHE_LIMITS[OFFLINE_CACHE].purgeOnQuotaError).toBeFalsy()
    // Room for what the app itself keeps: the Quran's pages in one language (about 215) and
    // every lesson's verses and pictures; the adhkar chapters in three languages and the lists.
    expect(CACHE_LIMITS[CONTENT_CACHE].maxEntries).toBeGreaterThanOrEqual(3 * 215)
    expect(CACHE_LIMITS[OFFLINE_CACHE].maxEntries).toBeGreaterThanOrEqual(3 * 140)
  })

  it("sec_a_l6_plt12_downloads_are_never_limited", () => {
    expect(DOWNLOADS_CACHE).toBe("rafeeq-downloads")
    expect(Object.keys(CACHE_LIMITS)).not.toContain(DOWNLOADS_CACHE)
    expect(downloadsSource).not.toMatch(/ExpirationPlugin|cache-limits/)
  })

  it("sec_a_l6_the_worker_routes_use_the_limits", () => {
    const sw = swSource
    expect(sw).toContain("cacheName: CONTENT_CACHE, networkTimeoutSeconds: 4, plugins: [limitOf(CONTENT_CACHE)]")
    expect(sw).toContain("cacheName: MEDIA_CACHE, plugins: [limitOf(MEDIA_CACHE)]")
    expect(sw).toContain("registerForget(self)")
    expect(offlineSource).toContain("cacheName: OFFLINE_CACHE, networkTimeoutSeconds: 4, plugins: [limitOf(OFFLINE_CACHE)]")
  })

  it("sec_a_l6_the_worker_forgets_the_caches_and_their_records_when_asked", async () => {
    const listeners: ((e: { data: unknown; waitUntil: (p: Promise<unknown>) => void }) => void)[] = []
    const sw = { addEventListener: (_: string, fn: (typeof listeners)[number]) => listeners.push(fn) } as unknown as ServiceWorkerGlobalScope
    const forget = vi.fn(async () => undefined)
    registerForget(sw, forget)
    const waited: Promise<unknown>[] = []
    listeners[0]({ data: { type: "something-else" }, waitUntil: (p) => waited.push(p) })
    expect(forget).not.toHaveBeenCalled()
    listeners[0]({ data: { type: FORGET_MESSAGE }, waitUntil: (p) => waited.push(p) })
    expect(forget).toHaveBeenCalledTimes(1)
    expect(waited).toHaveLength(1)

    await forgetAll()
    for (const name of Object.keys(CACHE_LIMITS)) {
      expect((limitOf(name) as unknown as { deleteCacheAndMetadata: ReturnType<typeof vi.fn> }).deleteCacheAndMetadata).toHaveBeenCalled()
    }
  })

  it.each([
    ["erasing the device", wipeDevice],
    ["signing out", signOutAndErase],
  ])("sec_a_l6_%s_removes_the_record_of_what_was_cached", async (_name, erase) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })))
    const postMessage = vi.fn()
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { controller: { postMessage }, getRegistrations: async () => [] } })
    const deleteDatabase = vi.fn()
    vi.stubGlobal("indexedDB", { deleteDatabase })

    await erase(vi.fn())

    expect(postMessage).toHaveBeenCalledWith({ type: FORGET_MESSAGE })
    expect(deleteDatabase).toHaveBeenCalledWith("workbox-expiration")
  })
})
