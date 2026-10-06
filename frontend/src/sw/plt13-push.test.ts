/**
 * PLT-13 R2: every push that reaches the device shows a notification with a
 * non-empty title (Apple drops subscriptions whose pushes stay invisible).
 * R6: a notification only ever opens an in-app path.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { NEUTRAL_LOOK, saveDiscreet } from "@/app/lib/discreetPref"
import { FALLBACK_TEXT, notificationFor, readLocale, registerPushHandler, saveLocale } from "./plt13-push"

function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>()
  return {
    open: async (name: string) => {
      const m = stores.get(name) ?? new Map<string, Response>()
      stores.set(name, m)
      return {
        put: async (k: string, r: Response) => void m.set(k, r),
        delete: async (k: string) => m.delete(k),
        match: async (k: string) => m.get(k)?.clone(),
      } as unknown as Cache
    },
  }
}

const showNotification = vi.fn(async (..._args: unknown[]) => undefined)
const target = new EventTarget()
const sw = Object.assign(target, { registration: { showNotification } }) as unknown as ServiceWorkerGlobalScope
registerPushHandler(sw)

async function push(data: { json: () => unknown } | null) {
  const pending: Promise<unknown>[] = []
  target.dispatchEvent(Object.assign(new Event("push"), { data, waitUntil: (p: Promise<unknown>) => pending.push(p) }))
  await Promise.all(pending)
  return showNotification.mock.calls.at(-1) as unknown as [string, NotificationOptions & { data: { url?: string } }]
}

let store: ReturnType<typeof fakeCaches>
beforeEach(() => {
  showNotification.mockClear()
  store = fakeCaches()
  vi.stubGlobal("caches", store)
})

describe("plt-13-r2 every push shows a non-empty notification", () => {
  it("plt13_r2_a_push_without_a_title_shows_a_moment_for_you_in_the_device_language", async () => {
    await saveLocale("ar", store)
    const [title, options] = await push({ json: () => ({ body: "" }) })
    expect(title).toBe("لحظة لك")
    expect(options.body).toBe(FALLBACK_TEXT.ar.body)
    await saveLocale("tl", store)
    expect((await push({ json: () => ({}) }))[0]).toBe(FALLBACK_TEXT.tl.title)
  })

  it("plt13_r2_a_broken_payload_still_shows_the_neutral_text", async () => {
    await saveLocale("en", store)
    const [title, options] = await push({
      json: () => {
        throw new SyntaxError("bad")
      },
    })
    expect(title).toBe("A moment for you")
    expect(options.body).toBe(FALLBACK_TEXT.en.body)
    expect((await push(null))[0]).toBe("A moment for you")
  })

  it("plt13_r2_without_a_saved_language_the_device_language_decides", async () => {
    expect(await readLocale(store, "fil-PH")).toBe("tl")
    expect(await readLocale(store, "de-DE")).toBe("ar")
  })

  it("plt13_r2_a_reply_keeps_its_title_only_on_the_lock_screen", () => {
    expect(notificationFor({ title: "لديك رد جديد", body: "", url: "/mentor", tag: "cmp-reply" }, "ar")).toEqual({
      title: "لديك رد جديد",
      body: "",
      url: "/mentor",
      tag: "cmp-reply",
    })
  })

  it("plt13_r2_in_discreet_mode_the_fallback_is_neutral_in_title_and_icon", async () => {
    await saveDiscreet(true, store)
    await saveLocale("ar", store)
    const [title, options] = await push({ json: () => ({ title: "" }) })
    expect(title).toBe(FALLBACK_TEXT.ar.title)
    expect(options).toMatchObject({ icon: NEUTRAL_LOOK.icon, badge: NEUTRAL_LOOK.badge })
  })
})

describe("plt-13-r6 a notification opens a screen inside the app", () => {
  it("plt13_r6_server_paths_are_kept_and_other_sites_are_never_opened", async () => {
    expect((await push({ json: () => ({ title: "x", url: "/next" }) }))[1].data.url).toBe("/next")
    expect(notificationFor({ title: "x", url: "https://evil.example/" }, "ar").url).toBeUndefined()
    expect(notificationFor({ title: "x", url: "//evil.example/" }, "ar").url).toBeUndefined()
  })
})
