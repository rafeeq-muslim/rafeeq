/// <reference lib="webworker" />
/**
 * Size budget 2026-10-10: the first install fetches the precache several
 * files at a time.
 *
 * Workbox 7 precaches one file after another (PrecacheController.install).
 * Measured on production: 124 files took ~40 s to install. Until the worker
 * is active, every page load downloads the whole shell again (the host
 * router sends `no-store`, PLT-11), and the app does not open offline yet.
 *
 * This fill runs alongside Workbox's own install: it walks the list from the
 * end, a few files at a time, and puts each answer under the key Workbox
 * uses. Workbox walks from the start and skips every key already in the
 * cache, so each file is fetched about once. Files already cached (a new
 * version that kept most hashed files) are not fetched again. Any failure is
 * left to Workbox, which fetches the file itself and fails the install as
 * before if it cannot.
 */

export const FILL_PARALLEL = 6

type Entry = string | { url: string; revision?: string | null }

export type FillDeps = {
  cache: Pick<Cache, "match" | "put">
  /** The key Workbox stores this absolute URL under, or undefined if not precached. */
  keyFor: (href: string) => string | undefined
  fetch: (url: string, init: RequestInit) => Promise<Response>
  base: string
  parallel?: number
}

/** Fills the precache from the end of the list; returns how many files it stored. */
export async function fillPrecache(entries: Entry[], deps: FillDeps): Promise<number> {
  const queue = entries.map((e) => new URL(typeof e === "string" ? e : e.url, deps.base).href).reverse()
  let stored = 0
  const worker = async () => {
    for (let href = queue.shift(); href !== undefined; href = queue.shift()) {
      const key = deps.keyFor(href)
      if (!key) continue
      try {
        if (await deps.cache.match(key)) continue
        const res = await deps.fetch(href, { credentials: "same-origin", cache: "reload" })
        // Workbox keeps only plain 200 answers (its cacheability plugin); anything else is left to it.
        if (res.status !== 200 || res.redirected || res.type === "opaque") continue
        if (await deps.cache.match(key)) continue // Workbox got there first
        await deps.cache.put(key, res)
        stored += 1
      } catch {
        /* Workbox fetches it */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(deps.parallel ?? FILL_PARALLEL, queue.length) }, worker))
  return stored
}
