/// <reference lib="webworker" />
/**
 * Service worker: precached app shell (offline lessons after first load,
 * LRN-03 R5), cached approved content, and Web Push (PLT-06, MOT-05).
 * Notification texts arrive neutral from the server; nothing religious.
 */
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching"
import { registerRoute, NavigationRoute } from "workbox-routing"
import { NetworkFirst, StaleWhileRevalidate } from "workbox-strategies"
import { createHandlerBoundToURL } from "workbox-precaching"

declare const self: ServiceWorkerGlobalScope

self.skipWaiting()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html"), { denylist: [/^\/api\//] }))

// Approved lesson content and Quran passages: usable offline.
registerRoute(({ url }) => url.pathname.startsWith("/api/content") || url.pathname.startsWith("/api/scripture"), new NetworkFirst({ cacheName: "rafeeq-content", networkTimeoutSeconds: 4 }))
registerRoute(({ url }) => url.pathname.startsWith("/content-media/") || /\.(mp3|mp4|jpg|jpeg|png|webp)$/.test(url.pathname), new StaleWhileRevalidate({ cacheName: "rafeeq-media" }))

self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

self.addEventListener("push", (event) => {
  const data = (() => {
    try {
      return event.data?.json() ?? {}
    } catch {
      return { body: event.data?.text() }
    }
  })() as { title?: string; body?: string; url?: string; tag?: string }
  event.waitUntil(
    self.registration.showNotification(data.title ?? "", {
      body: data.body ?? "",
      icon: "/brand/rafeeq-app-icon-180.png",
      badge: "/brand/favicon-48.png",
      tag: data.tag ?? "rafeeq",
      data: { url: data.url ?? "/" },
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string })?.url ?? "/"
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
