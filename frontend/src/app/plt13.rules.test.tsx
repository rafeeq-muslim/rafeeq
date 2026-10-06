/**
 * PLT-13 notifications on iPhone, device side: one test per example where it
 * can run without a real iPhone. The worker's push handler (R2) is in
 * src/sw/plt13-push.test.ts; the server side in backend/tests/test_plt13_ios_push.py.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router"

import { translate, type Key } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { lastEndpoint, permissionRevoked, pushState, sendTestPush, setReplies, syncPushSwitches } from "@/app/lib/push"

vi.mock("@/app/learning/useContent", () => ({
  useContent: () => ({ content: undefined, isLoading: false, isError: false, refetch: () => undefined, lessons: [], preview: false }),
}))

const { default: Me } = await import("@/app/pages/Me")

const ar_ = (k: Key) => translate("ar", k)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

type Call = { url: string; method: string; body: unknown }
let calls: Call[] = []
function stubFetch(handler: (url: string, body: unknown) => Response | undefined = () => undefined) {
  calls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ url, method: init?.method ?? "GET", body })
      return handler(url, body) ?? json({ detail: "not found" }, 404)
    }),
  )
}

const OLD = "https://web.push.apple.com/QOLD-device"
const NEW = "https://web.push.apple.com/QNEW-device"

function mockPush(permission: NotificationPermission, existing: string | null = OLD) {
  const make = (endpoint: string) => ({ endpoint, toJSON: () => ({ endpoint, keys: { p256dh: "k", auth: "a" } }), unsubscribe: vi.fn(async () => true) })
  let current = existing ? make(existing) : null
  const reg = {
    pushManager: { getSubscription: vi.fn(async () => current), subscribe: vi.fn(async () => (current = make(NEW))) },
  }
  const N = {
    permission,
    requestPermission: vi.fn(async () => {
      N.permission = "granted"
      return "granted"
    }),
  }
  vi.stubGlobal("Notification", N)
  vi.stubGlobal("PushManager", function PushManager() {})
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration: async () => reg, ready: Promise.resolve(reg), getRegistrations: async () => [reg] },
  })
  return { reg, N }
}

const pushApi = (url: string, body: unknown): Response | undefined => {
  if (url === "/api/push/public-key") return json({ key: "BAAA" })
  if (url === "/api/push/subscribe" || url === "/api/push/unsubscribe") return new Response(null, { status: 204 })
  if (url === "/api/push/state") return json({ subscribed: true, reminder: false, time: null, replies: true })
  if (url === "/api/push/replies") return json({ enabled: (body as { enabled: boolean }).enabled })
  if (url === "/api/push/reminder") return json({ enabled: true, time: "21:00" })
  if (url === "/api/push/resubscribe") {
    const b = body as { reminder: boolean; time: string | null; replies: boolean }
    return json({ subscribed: true, reminder: b.reminder, time: b.time, replies: b.replies })
  }
  return undefined
}

const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/me"]}>
        <Routes>
          <Route path="*" element={<Me />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

const switchFor = (label: string) => screen.getByRole("switch", { name: label }) as HTMLButtonElement
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.2 Mobile/15E148 Safari/604.1"
const JSDOM_UA = navigator.userAgent
const setUserAgent = (ua: string) => Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true })

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
  useDevice.setState({ locale: "ar", onboarded: true, placementOffered: true, discreet: false, reminderOn: false, repliesOn: false, reminderTime: "21:00" })
  useAuth.getState().set({ token: null, me: null, ready: true })
  stubFetch()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (navigator as { serviceWorker?: unknown }).serviceWorker
  setUserAgent(JSDOM_UA)
  localStorage.clear()
})

describe("plt-13-r1 permission asked straight from the tap; unsupported iPhones are told so", () => {
  it("plt13_r1_turning_replies_on_asks_permission_inside_the_tap_before_any_network", () => {
    const p = mockPush("default", null)
    stubFetch(pushApi)
    wrap()
    calls = []
    fireEvent.click(switchFor(ar_("notif.replies")))
    // Synchronously, still inside the click: the prompt is up and nothing went to the network first.
    expect(p.N.requestPermission).toHaveBeenCalledOnce()
    expect(calls).toEqual([])
  })

  it("plt13_r1_choosing_the_reminder_time_asks_permission_at_once", () => {
    const p = mockPush("default", null)
    stubFetch(pushApi)
    wrap()
    fireEvent.click(switchFor(ar_("reminder.toggle")))
    expect(p.N.requestPermission).not.toHaveBeenCalled() // MOT-05 R1: the time comes first
    calls = []
    fireEvent.click(screen.getByRole("button", { name: ar_("mot.reminder.confirm" as Key) }))
    expect(p.N.requestPermission).toHaveBeenCalledOnce()
    expect(calls).toEqual([])
  })

  it("plt13_r1_the_key_is_fetched_after_the_permission_not_before", async () => {
    const p = mockPush("default", null)
    const order: string[] = []
    p.N.requestPermission.mockImplementation(async () => {
      order.push("permission")
      p.N.permission = "granted"
      return "granted"
    })
    stubFetch((url, body) => {
      order.push(url)
      return pushApi(url, body)
    })
    await setReplies(true)
    expect(order[0]).toBe("permission")
  })

  it("plt13_r1_iphone_on_ios_16_2_is_told_it_needs_16_4_and_the_switch_stays_off", () => {
    expect(pushState({ userAgent: IPHONE, platform: "iPhone", maxTouchPoints: 5, standalone: true, supported: false, permission: "default" })).toBe("ios-update")
    setUserAgent(IPHONE)
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("standalone"), media: q, addEventListener() {}, removeEventListener() {} }))
    useDevice.setState({ repliesOn: true })
    wrap()
    expect(screen.getByText(ar_("plt13.iosUpdateTitle"))).toBeTruthy()
    expect(screen.getByText(ar_("plt13.iosUpdateBody"))).toBeTruthy()
    const s = switchFor(ar_("notif.replies"))
    expect(s.getAttribute("aria-checked")).toBe("false")
    expect(s.disabled).toBe(true)
  })

  it("plt13_r1_iphone_safari_tab_still_gets_the_home_screen_steps", () => {
    expect(pushState({ userAgent: IPHONE, platform: "iPhone", maxTouchPoints: 5, standalone: false, supported: false, permission: "default" })).toBe("ios-home-screen")
    setUserAgent(IPHONE)
    wrap()
    expect(screen.getByText(ar_("notif.iosTitle"))).toBeTruthy()
    expect(screen.queryByText(ar_("plt13.iosUpdateTitle"))).toBeNull()
  })
})

describe("plt-13-r4 a lost subscription is renewed silently while permission holds", () => {
  it("plt13_r4_lost_after_an_update_renews_with_the_same_reminder_time_without_asking", async () => {
    const p = mockPush("granted", null) // the device lost its subscription
    localStorage.setItem("rafeeq.push.endpoint", OLD)
    useDevice.setState({ reminderOn: true, reminderTime: "21:00", repliesOn: false })
    stubFetch(pushApi)
    await syncPushSwitches()
    expect(p.N.requestPermission).not.toHaveBeenCalled()
    expect(p.reg.pushManager.subscribe).toHaveBeenCalledOnce()
    const re = calls.find((c) => c.url === "/api/push/resubscribe")
    expect(re?.body).toMatchObject({ old_endpoint: OLD, reminder: true, time: "21:00", replies: false, subscription: { endpoint: NEW } })
    expect(lastEndpoint()).toBe(NEW)
    expect(useDevice.getState()).toMatchObject({ reminderOn: true, reminderTime: "21:00" })
  })

  it("plt13_r4_a_changed_endpoint_is_moved_on_the_server", async () => {
    const p = mockPush("granted", NEW) // Safari handed out a new endpoint
    localStorage.setItem("rafeeq.push.endpoint", OLD)
    useDevice.setState({ repliesOn: true })
    stubFetch(pushApi)
    await syncPushSwitches()
    expect(p.reg.pushManager.subscribe).not.toHaveBeenCalled()
    expect(calls.find((c) => c.url === "/api/push/resubscribe")?.body).toMatchObject({ old_endpoint: OLD, replies: true, subscription: { endpoint: NEW } })
  })

  it("plt13_r4_nothing_is_renewed_when_every_switch_is_off", async () => {
    const p = mockPush("granted", null)
    stubFetch(pushApi)
    await syncPushSwitches()
    expect(p.reg.pushManager.subscribe).not.toHaveBeenCalled()
    expect(calls.some((c) => c.url === "/api/push/resubscribe")).toBe(false)
  })

  it("plt13_r4_permission_taken_back_turns_the_switches_off_explains_and_never_asks", async () => {
    const p = mockPush("default", null) // revoked in the iPhone's settings
    useDevice.setState({ reminderOn: true, repliesOn: true })
    stubFetch(pushApi)
    wrap()
    expect(await screen.findByText(ar_("plt13.revokedTitle"))).toBeTruthy()
    expect(screen.getByText(ar_("plt13.revokedBody"))).toBeTruthy()
    expect(useDevice.getState()).toMatchObject({ reminderOn: false, repliesOn: false })
    expect(permissionRevoked()).toBe(true)
    expect(p.N.requestPermission).not.toHaveBeenCalled()
    expect(p.reg.pushManager.subscribe).not.toHaveBeenCalled()
  })
})

describe("plt-13-r5 try a notification on this device", () => {
  it("plt13_r5_with_replies_on_the_try_button_sends_to_this_device_only", async () => {
    mockPush("granted", OLD)
    localStorage.setItem("rafeeq.push.endpoint", OLD)
    useDevice.setState({ repliesOn: true })
    stubFetch((url, body) => (url === "/api/push/test" ? json({ sent: true }) : pushApi(url, body)))
    wrap()
    fireEvent.click(await screen.findByRole("button", { name: ar_("plt13.test") }))
    await waitFor(() => expect(calls.find((c) => c.url === "/api/push/test")?.body).toEqual({ endpoint: OLD }))
  })

  it("plt13_r5_no_try_button_while_every_switch_is_off", () => {
    mockPush("granted", null)
    stubFetch(pushApi)
    wrap()
    expect(screen.queryByRole("button", { name: ar_("plt13.test") })).toBeNull()
  })

  it("plt13_r5_a_fourth_try_today_is_told_to_wait_for_tomorrow", async () => {
    mockPush("granted", OLD)
    stubFetch((url) => (url === "/api/push/test" ? json({ detail: "rate_limited" }, 429) : undefined))
    expect(await sendTestPush()).toBe("limit")
    expect(ar_("plt13.testLimit")).toContain("غدًا")
  })
})

describe("plt-13-r6 one worker at /sw.js with scope /", () => {
  it("plt13_r6_the_worker_registers_at_the_root_scope_so_subscriptions_survive_the_app_move", async () => {
    const register = vi.fn(async () => ({ update: async () => undefined }))
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register, controller: null, addEventListener() {} } })
    vi.stubEnv("DEV", false)
    vi.resetModules()
    const { registerServiceWorker } = await import("@/app/lib/pwa")
    registerServiceWorker()
    window.dispatchEvent(new Event("load"))
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" })
    vi.unstubAllEnvs()
  })
})
