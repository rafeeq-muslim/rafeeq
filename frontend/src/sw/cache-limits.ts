/// <reference lib="webworker" />
/**
 * Security review 2026-10-07 (A-L6): the worker's three runtime caches had no
 * ceiling, so a device could fill with every Quran page, picture and adhkar
 * chapter it ever asked for. Each now keeps a bounded number of entries; past
 * it the least recently used goes first.
 *
 * - No time limit on lesson content and the offline answers: what the learner
 *   opened from the path, and «يومي», stay readable offline however long the
 *   device was away (PLT-15 R2/R3). The ceilings are far above what the app
 *   itself keeps: the whole Quran in one language is about 215 pages, the
 *   adhkar about 130 chapters a language.
 * - What the learner chose to download (PLT-12) lives in its own cache,
 *   `rafeeq-downloads`, which has no limit here and is never evicted.
 * - The plugin keeps the address and last-use time of each cached entry in
 *   IndexedDB. Erasing the device or signing out removes that too
 *   (`FORGET_MESSAGE`, sent by lib/privacy.ts), so no trace of what was read
 *   stays behind (rules.md §4).
 */
import { ExpirationPlugin } from "workbox-expiration"

import { CONTENT_CACHE, FORGET_MESSAGE, MEDIA_CACHE, OFFLINE_CACHE } from "../app/offline/paths"

const DAY = 24 * 60 * 60

export type CacheLimit = { maxEntries: number; maxAgeSeconds?: number; purgeOnQuotaError?: boolean }

export const CACHE_LIMITS: Record<string, CacheLimit> = {
  [CONTENT_CACHE]: { maxEntries: 1000 },
  [OFFLINE_CACHE]: { maxEntries: 600 },
  // Pictures outside lessons (lesson pictures are in the content cache): refetched when online anyway.
  [MEDIA_CACHE]: { maxEntries: 200, maxAgeSeconds: 90 * DAY, purgeOnQuotaError: true },
}

const plugins = new Map<string, ExpirationPlugin>()

/** The one expiration plugin of a limited cache (made on first use). */
export function limitOf(cacheName: string): ExpirationPlugin {
  let p = plugins.get(cacheName)
  if (!p) {
    p = new ExpirationPlugin(CACHE_LIMITS[cacheName])
    plugins.set(cacheName, p)
  }
  return p
}

type Forgettable = { deleteCacheAndMetadata(): Promise<void> }

/** Erase: the limited caches and what the plugin recorded about their entries. */
export async function forgetAll(all: Iterable<Forgettable> = Object.keys(CACHE_LIMITS).map(limitOf)) {
  await Promise.all([...all].map((p) => p.deleteCacheAndMetadata().catch(() => undefined)))
}

export function registerForget(sw: ServiceWorkerGlobalScope, forget: () => Promise<void> = forgetAll) {
  sw.addEventListener("message", (event) => {
    if ((event.data as { type?: string } | null)?.type === FORGET_MESSAGE) event.waitUntil(forget())
  })
}
