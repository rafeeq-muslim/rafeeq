/// <reference lib="webworker" />
/**
 * PLT-15 «رفيق دون اتصال» in the service worker: the small, shared API
 * answers listed in app/offline/paths.ts are kept for offline use.
 * NetworkFirst: online the learner always gets the current approved text;
 * offline (or after 4 s) the last copy on the device. The page also warms
 * this cache once online (app/offline/warmup.ts), so adhkar never opened
 * before still read offline (R3 ex1). Same origin only.
 */
import { registerRoute } from "workbox-routing"
import { NetworkFirst } from "workbox-strategies"

import { OFFLINE_CACHE, keptOffline } from "../app/offline/paths"
import { limitOf } from "./cache-limits"

declare const self: ServiceWorkerGlobalScope

export function registerPlt15Offline(origin: string) {
  registerRoute(
    ({ url, request }) => request.method === "GET" && url.origin === origin && keptOffline(url.pathname),
    new NetworkFirst({ cacheName: OFFLINE_CACHE, networkTimeoutSeconds: 4, plugins: [limitOf(OFFLINE_CACHE)] }),
  )
}

registerPlt15Offline(self.location.origin)
