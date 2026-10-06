/// <reference lib="webworker" />
/**
 * PLT-12 (service worker part): serve what the learner downloaded.
 *
 * The bytes live in Cache Storage `rafeeq-downloads`, each file under the URL
 * the page itself requests: the original media URL (a <video>/<audio> src on
 * IslamHouse or QuranEnc) or the same-origin API URL. The cache's own keys are
 * the lookup table, so there is no other index to keep in sync (and erasing
 * the device, which deletes every cache, leaves nothing behind).
 *
 * - Media: answered from the cache, with Range support so seeking works.
 * - Text (same-origin API): network first, and a fresh copy replaces the
 *   downloaded one (R3: text updates silently); offline, the downloaded copy.
 *
 * Registered before the generic routes in sw.ts so a downloaded file always wins.
 */
import { registerRoute } from "workbox-routing"

export const DOWNLOADS_CACHE = "rafeeq-downloads"
export const CHANGED_MESSAGE = "plt12:downloads-changed"
const TEXT_TIMEOUT_MS = 4000

let keys = new Set<string>()

export async function reloadKeys(store: CacheStorage = caches) {
  try {
    if (!(await store.has(DOWNLOADS_CACHE))) {
      keys = new Set()
      return
    }
    const cache = await store.open(DOWNLOADS_CACHE)
    keys = new Set((await cache.keys()).map((r) => r.url))
  } catch {
    keys = new Set()
  }
}

export const isDownloaded = (href: string) => keys.has(href)

/** A 206 slice of a cached full response, or 416 when the range is outside it. */
export async function rangeResponse(range: string | null, full: Response): Promise<Response> {
  if (!range) return full
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
  const blob = await full.blob()
  const size = blob.size
  let start = m?.[1] ? Number(m[1]) : NaN
  let end = m?.[2] ? Number(m[2]) : size - 1
  if (m && !m[1] && m[2]) {
    start = Math.max(0, size - Number(m[2])) // suffix range: the last N bytes
    end = size - 1
  }
  end = Math.min(end, size - 1)
  if (!m || !Number.isFinite(start) || start > end || start >= size) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } })
  }
  const part = blob.slice(start, end + 1)
  return new Response(part, {
    status: 206,
    headers: {
      "Content-Type": full.headers.get("content-type") ?? "application/octet-stream",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(part.size),
      "Accept-Ranges": "bytes",
    },
  })
}

const isText = (url: URL, origin: string) => url.origin === origin && url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/content/media/")

async function withTimeout(p: Promise<Response>, ms: number): Promise<Response> {
  return Promise.race([p, new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))])
}

export async function handle(request: Request, url: URL, origin: string, store: CacheStorage = caches, net: typeof fetch = fetch): Promise<Response> {
  const cache = await store.open(DOWNLOADS_CACHE)
  if (isText(url, origin)) {
    try {
      const res = await withTimeout(net(request), TEXT_TIMEOUT_MS)
      if (res.ok) {
        // R3: still downloaded (not deleted meanwhile)? keep the newest approved text.
        if (await cache.match(url.href, { ignoreVary: true })) await cache.put(url.href, res.clone())
        return res
      }
    } catch {
      /* offline or slow: the downloaded copy */
    }
    const hit = await cache.match(url.href, { ignoreVary: true })
    return hit ?? net(request)
  }
  const hit = await cache.match(url.href, { ignoreVary: true })
  if (!hit) {
    keys.delete(url.href) // deleted since: the network as before
    return net(request)
  }
  return rangeResponse(request.headers.get("range"), hit)
}

export function registerDownloads(sw: ServiceWorkerGlobalScope = self as unknown as ServiceWorkerGlobalScope) {
  void reloadKeys()
  sw.addEventListener("message", (event) => {
    if ((event.data as { type?: string } | null)?.type === CHANGED_MESSAGE) event.waitUntil(reloadKeys())
  })
  registerRoute(
    ({ request, url }) => request.method === "GET" && isDownloaded(url.href),
    ({ request, url }) => handle(request, url, sw.location.origin),
  )
}
