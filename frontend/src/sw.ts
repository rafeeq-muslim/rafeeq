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
import { createHandlerBoundToURL } from "workbox-precaching"
import { notificationLook, readDiscreet } from "./app/lib/discreetPref"
import "./sw/plt15-offline" // PLT-15: adhkar text, glossary and saved-item lists kept for offline use
import { APP_NAVIGATION, notificationTarget } from "./app/lib/base"

declare const self: ServiceWorkerGlobalScope

self.skipWaiting()
cleanupOutdatedCaches()
// PLT-10 R1: "/" is the landing page, so the precached /index.html (the app shell)
// must not answer for it (Workbox maps "/" to "/index.html" by default).
precacheAndRoute(self.__WB_MANIFEST, { directoryIndex: "" })
// PLT-10 R1/R2: the landing page at / is never replaced by the app shell; only /app/* is.
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html"), { allowlist: [APP_NAVIGATION], denylist: [/^\/api\//] }))

// Approved lesson content and Quran passages: usable offline. Same origin only.
registerRoute(
  ({ url }) => url.origin === self.location.origin && (url.pathname.startsWith("/api/content") || url.pathname.startsWith("/api/scripture")),
  new NetworkFirst({ cacheName: "rafeeq-content", networkTimeoutSeconds: 4 }),
)
// Images from Rafeeq itself only (issue #9 item 12). Audio and video bypass the
// worker: other origins (IslamHouse, Quranpedia verse recitations) are loaded by the browser under media-src
// (the worker's connect-src 'self' cannot fetch them), and cached responses
// would break the range requests players need for seeking.
registerRoute(
  ({ url }) => url.origin === self.location.origin && (url.pathname.startsWith("/api/content/media/") || /\.(jpg|jpeg|png|webp)$/.test(url.pathname)),
  new StaleWhileRevalidate({ cacheName: "rafeeq-media" }),
)

self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

self.addEventListener("push", (event) => {
  const data = (() => {
    try {
      return event.data?.json() ?? {}
    } catch {
      return { body: event.data?.text() }
    }
  })() as { title?: string; body?: string; url?: string; tag?: string }
  // PLT-05 R3 / PLT-06 R6: in discreet mode a plain note icon, not the flower.
  event.waitUntil(
    readDiscreet().then((discreet) =>
      self.registration.showNotification(data.title ?? "", {
        body: data.body ?? "",
        ...notificationLook(discreet),
        tag: data.tag ?? "rafeeq",
        data: { url: notificationTarget(data.url) },
      }),
    ),
  )
})

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
