/// <reference lib="webworker" />
/**
 * Service worker: precached app shell (offline lessons after first load,
 * LRN-03 R5), cached approved content, and Web Push (PLT-06, MOT-05).
 * Notification texts arrive neutral from the server; nothing religious.
 * In discreet mode the icon is neutral too (lib/discreetPref.ts).
 */
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching"
import { registerRoute, NavigationRoute } from "workbox-routing"
import { NetworkFirst, StaleWhileRevalidate } from "workbox-strategies"
import { createHandlerBoundToURL, getCacheKeyForURL } from "workbox-precaching"
import "./sw/plt15-offline" // PLT-15: adhkar text, glossary and saved-item lists kept for offline use
import { APP_NAVIGATION, notificationTarget } from "./app/lib/base"
import { registerPushHandler } from "./sw/plt13-push"
import { registerDownloads } from "./sw/plt12-downloads" // PLT-12
import { registerPlt11Caching } from "./sw/plt11-caching" // PLT-11 R1/R3/R4
import { limitOf, registerForget } from "./sw/cache-limits" // security review A-L6: bounded runtime caches
import { CONTENT_CACHE, MEDIA_CACHE } from "./app/offline/paths"
import { fillPrecache } from "./sw/precache-fill" // size budget: install in seconds, not ~40 s

declare const self: ServiceWorkerGlobalScope

self.skipWaiting()
cleanupOutdatedCaches()
// PLT-10 R1: "/" is the landing page, so the precached /index.html (the app shell)
// must not answer for it (Workbox maps "/" to "/index.html" by default).
const MANIFEST = self.__WB_MANIFEST
precacheAndRoute(MANIFEST, { directoryIndex: "" })
// Workbox's default precache name (workbox-core cacheNames.precache).
const PRECACHE = `workbox-precache-v2-${self.registration.scope}`
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches.open(PRECACHE).then((cache) =>
      fillPrecache(MANIFEST, { cache, keyFor: getCacheKeyForURL, fetch: (url, init) => fetch(url, init), base: self.location.href }),
    ),
  ),
)
// PLT-10 R1/R2: the landing page at / is never replaced by the app shell; only /app/* is.
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html"), { allowlist: [APP_NAVIGATION], denylist: [/^\/api\//] }))

registerDownloads() // PLT-12: downloaded files first (before the generic routes below)

// Approved lesson content and Quran passages: usable offline. Same origin only.
registerRoute(
  ({ url }) => url.origin === self.location.origin && (url.pathname.startsWith("/api/content") || url.pathname.startsWith("/api/scripture")),
  new NetworkFirst({ cacheName: CONTENT_CACHE, networkTimeoutSeconds: 4, plugins: [limitOf(CONTENT_CACHE)] }),
)
// Images from Rafeeq itself only (issue #9 item 12). Audio and video bypass the
// worker: other origins (IslamHouse, Quranpedia verse recitations) are loaded by the browser under media-src
// (the worker's connect-src 'self' cannot fetch them), and cached responses
// would break the range requests players need for seeking.
registerRoute(
  ({ url }) => url.origin === self.location.origin && (url.pathname.startsWith("/api/content/media/") || /\.(jpg|jpeg|png|webp)$/.test(url.pathname)),
  new StaleWhileRevalidate({ cacheName: MEDIA_CACHE, plugins: [limitOf(MEDIA_CACHE)] }),
)
registerPlt11Caching(self) // PLT-11: hashed shell files and fonts, cache first; never audio/video
registerForget(self) // erasing the device also removes what the cache limits recorded

self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

registerPushHandler(self) // PLT-13 R2: never an empty notification (discreet look kept)

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = notificationTarget((event.notification.data as { url?: string })?.url)
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      for (const c of all) {
        if ("focus" in c) {
          await c.navigate(url).catch(() => undefined)
          return c.focus()
        }
      }
      return self.clients.openWindow(url)
    })(),
  )
})
