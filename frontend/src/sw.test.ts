/**
 * PLT-05 R3 / PLT-06 R6: the service worker's push handler. In discreet mode
 * the notification carries a plain note icon instead of the Rafeeq flower;
 * the text is shown as the server sent it (always neutral, PLT-06 R3).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { NEUTRAL_LOOK, RAFEEQ_LOOK, saveDiscreet } from "@/app/lib/discreetPref"

vi.mock("workbox-precaching", () => ({ cleanupOutdatedCaches: () => undefined, precacheAndRoute: () => undefined, createHandlerBoundToURL: () => () => undefined, getCacheKeyForURL: () => undefined }))
vi.mock("workbox-routing", () => ({ registerRoute: () => undefined, NavigationRoute: class {} }))
vi.mock("workbox-strategies", () => ({ NetworkFirst: class {}, StaleWhileRevalidate: class {}, CacheFirst: class {} }))
vi.mock("workbox-expiration", () => ({ ExpirationPlugin: class {} })) // PLT-11

function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>()
  return {
    open: async (name: string) => {
      const m = stores.get(name) ?? new Map<string, Response>()
      stores.set(name, m)
      return {
        put: async (k: string, r: Response) => void m.set(k, r),
        delete: async (k: string) => m.delete(k),
        match: async (k: string) => m.get(k),
      } as unknown as Cache
    },
  }
}

const showNotification = vi.fn(async () => undefined)
const store = fakeCaches()

beforeAll(async () => {
  Object.assign(globalThis, { skipWaiting: () => undefined, registration: { showNotification }, clients: { claim: async () => undefined } })
  vi.stubGlobal("caches", store)
  await import("./sw")
})

beforeEach(() => showNotification.mockClear())

async function push(payload: unknown) {
  const pending: Promise<unknown>[] = []
  const event = Object.assign(new Event("push"), { data: { json: () => payload, text: () => "" }, waitUntil: (p: Promise<unknown>) => pending.push(p) })
  self.dispatchEvent(event)
  await Promise.all(pending)
  return showNotification.mock.calls.at(-1) as unknown as [string, NotificationOptions]
}

describe("plt-06-r6 discreet mode makes every notification neutral, icon included", () => {
  it("plt06_r6_discreet_mode_shows_a_plain_note_icon", async () => {
    await saveDiscreet(true, store)
    const [title, options] = await push({ title: "لديك رد جديد", body: "", url: "/mentor" })
    expect(title).toBe("لديك رد جديد")
    expect(options).toMatchObject({ icon: NEUTRAL_LOOK.icon, badge: NEUTRAL_LOOK.badge, body: "" })
  })

  it("plt06_r6_without_discreet_mode_the_rafeeq_icon_stays", async () => {
    await saveDiscreet(false, store)
    const [, options] = await push({ title: "لحظة لك", body: "لديك درس قصير جاهز متى شئت" })
    expect(options).toMatchObject({ icon: RAFEEQ_LOOK.icon, badge: RAFEEQ_LOOK.badge })
  })
})
