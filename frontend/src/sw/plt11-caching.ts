/// <reference lib="webworker" />
/**
 * PLT-11 R1/R3: what came down once is not downloaded again. The host router
 * adds `Cache-Control: no-store` to every public response, so the browser keeps
 * nothing between visits; the worker keeps the hashed shell files and fonts
 * itself (cache first: a hashed name never changes content). Files already in
 * the precache are left to it. R2's on-demand chunks (role pages, cities data,
 * Quran font) land here on first use.
 *
 * R4: audio and video are never cached here: they stream from their source,
 * range requests pass through untouched, and only the download center (PLT-12)
 * keeps a copy.
 */
import { getCacheKeyForURL } from "workbox-precaching"
import { registerRoute } from "workbox-routing"
import { CacheFirst } from "workbox-strategies"
import { ExpirationPlugin } from "workbox-expiration"

export const ASSET_CACHE = "rafeeq-plt11-assets"
export const FONT_CACHE = "rafeeq-plt11-fonts"
const YEAR = 365 * 24 * 60 * 60

type Req = { destination?: string; headers: { has(name: string): boolean } }

const MEDIA = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|mp4|m4v|webm|mov|m3u8|mpd)$/i

/** R4: a streamed sound or video, or a range request (seeking). Never cached. */
export function isMedia(url: URL, request: Req): boolean {
  return request.destination === "audio" || request.destination === "video" || request.headers.has("range") || MEDIA.test(url.pathname)
}

/** R1: a hashed JS/CSS file of Rafeeq's own build. */
export function isShellAsset(url: URL, origin: string): boolean {
  return url.origin === origin && /(^|\/)assets\/[^/]+\.(js|css)$/.test(url.pathname)
}

/** R1/R3: a font file of Rafeeq's own (bundled fallbacks, Quran font, brand font). */
export function isFont(url: URL, origin: string): boolean {
  return url.origin === origin && (/(^|\/)fonts\/.+\.(woff2?|ttf|otf)$/.test(url.pathname) || /(^|\/)assets\/[^/]+\.(woff2?|ttf|otf)$/.test(url.pathname))
}

/** Which PLT-11 runtime cache handles a request, if any. */
export function plt11CacheFor(url: URL, request: Req, origin: string, precached: (href: string) => boolean): string | null {
  if (isMedia(url, request) || precached(url.href)) return null
  if (isFont(url, origin)) return FONT_CACHE
  if (isShellAsset(url, origin)) return ASSET_CACHE
  return null
}

export function registerPlt11Caching(sw: ServiceWorkerGlobalScope) {
  const precached = (href: string) => getCacheKeyForURL(href) !== undefined
  const route = (cacheName: string, maxEntries: number) =>
    registerRoute(
      ({ url, request }) => plt11CacheFor(url, request, sw.location.origin, precached) === cacheName,
      new CacheFirst({ cacheName, plugins: [new ExpirationPlugin({ maxEntries, maxAgeSeconds: YEAR, purgeOnQuotaError: true })] }),
    )
  route(FONT_CACHE, 60)
  route(ASSET_CACHE, 200)
}
