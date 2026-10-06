/**
 * PLT-05 R7: sign-out saves progress to the account, then erases this device
 * like R4 (keeping only the app shell cache); nothing account-side changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"

import { translate, type Key } from "@/app/i18n"
import { useAuth, type Me as MeUser } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { useLearning } from "@/app/stores/learning"
import { useMotivation } from "@/app/stores/motivation"
import { useCompanion } from "@/app/companion/store"
import { useOrgLink } from "@/app/org/store"
import { signOutAndErase } from "@/app/lib/privacy"
import { DISCREET_PREF, PREF_CACHE } from "@/app/lib/discreetPref"
import { SignOutButton } from "@/app/privacy/SignOutButton"
import { useNotebook, type Note } from "@/app/companion/notebook"
import { usePractice, type Habit } from "@/app/practice/store"
import { useSaved, type SavedEntry } from "@/app/discover/savedStore"
import { ar } from "@/app/i18n/ar"
import { en } from "@/app/i18n/en"
import { tl } from "@/app/i18n/tl"

const { default: Privacy, POLICY_SECTIONS } = await import("@/app/pages/Privacy")

const ar_ = (k: Key) => translate("ar", k)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const ME: MeUser = {
  id: "u1",
  display_name: "نخلة الهادئ",
  username: "layla-1",
  roles: ["learner"],
  locale: "ar",
  two_factor_enabled: false,
  email_hint: null,
  gender: null,
  languages: ["ar"],
}

type Call = { url: string; method: string; body: unknown }
let calls: Call[] = []
let deviceDataAtLogout: string | null | undefined

function stubFetch(handler: (url: string, method: string) => Response | undefined = () => undefined) {
  calls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET"
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url === "/api/auth/logout") deviceDataAtLogout = localStorage.getItem("rafeeq.learning")
      return handler(url, method) ?? new Response(null, { status: 204 })
    }),
  )
}

const merged = (url: string) => {
  if (url === "/api/me/learning") return json({ completed: { "u1-l1": { first: "2026-10-06", last: "2026-10-06", times: 1 } }, unlockedUnits: ["u1"], mastery: {} })
  if (url === "/api/me/motivation") return json({ days: ["2026-10-06"], badges: {} })
  if (url === "/api/me/saved") return json({ items: [] })
  return undefined
}

/** A Cache Storage with the caches the app really creates. */
function fakeCaches(names: string[]) {
  const store = new Map<string, Map<string, Response>>(names.map((n) => [n, new Map()]))
  const caches = {
    keys: async () => [...store.keys()],
    delete: async (n: string) => store.delete(n),
    open: async (n: string) => {
      if (!store.has(n)) store.set(n, new Map())
      const c = store.get(n)!
      return { put: async (k: string, r: Response) => void c.set(k, r), match: async (k: string) => c.get(k) }
    },
  }
  vi.stubGlobal("caches", caches)
  return store
}

function fakePush() {
  const endpoint = "https://fcm.googleapis.com/fcm/send/this-device"
  const sub = { endpoint, unsubscribe: vi.fn(async () => true) }
  const reg = { pushManager: { getSubscription: vi.fn(async () => sub) } }
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistrations: async () => [reg] } })
  return sub
}

const setOnline = (on: boolean) => vi.spyOn(navigator, "onLine", "get").mockReturnValue(on)

function learnedOneLesson() {
  useLearning.setState({ completed: { "u1-l1": { first: "2026-10-06", last: "2026-10-06", times: 1 } }, unlockedUnits: ["u1"], mastery: {} })
  useMotivation.setState({ days: ["2026-10-06"], badges: {} })
}

beforeEach(() => {
  useDevice.setState({ locale: "ar", onboarded: true, placementOffered: true })
  useAuth.setState({ token: "t", me: ME })
  useLearning.setState({ completed: {}, unlockedUnits: [], mastery: {} })
  useMotivation.setState({ days: [], badges: {} })
  useNotebook.setState({ notes: [] })
  usePractice.setState({ habits: [] })
  useSaved.setState({ items: [] })
  deviceDataAtLogout = undefined
  setOnline(true)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete (navigator as { serviceWorker?: unknown }).serviceWorker
  localStorage.clear()
  sessionStorage.clear()
})

describe("plt-05 r7 sign-out erases this device", () => {
  it("plt05_r7_ex1_sign_out_erases_device_data_and_restarts_at_the_language_screen", async () => {
    learnedOneLesson()
    localStorage.setItem("rafeeq.practice", JSON.stringify({ state: { city: "riyadh" } }))
    localStorage.setItem("rafeeq.notebook", "[]")
    localStorage.setItem("other-site.key", "kept")
    sessionStorage.setItem("rafeeq.tab", "x")
    stubFetch()
    fakeCaches(["workbox-precache-v2-https://rafeeq.nan.sa/", "rafeeq-content", "rafeeq-media"])
    const go = vi.fn()

    await signOutAndErase(go)

    expect(Object.keys(localStorage).filter((k) => k.startsWith("rafeeq."))).toEqual([])
    expect(localStorage.getItem("other-site.key")).toBe("kept")
    expect(sessionStorage.length).toBe(0)
    expect(useAuth.getState().token).toBeNull()
    expect(useAuth.getState().me).toBeNull()
    expect(calls.some((c) => c.url === "/api/auth/logout" && c.method === "POST")).toBe(true)
    expect(go).toHaveBeenCalledWith("/app/welcome")
  })

  it("plt05_r7_ex1_app_shell_cache_survives_while_content_caches_and_the_discreet_copy_go", async () => {
    stubFetch()
    const store = fakeCaches(["workbox-precache-v2-https://rafeeq.nan.sa/", "rafeeq-content", "rafeeq-media"])
    await (await caches.open(PREF_CACHE)).put(DISCREET_PREF, new Response("1"))

    await signOutAndErase(vi.fn())

    expect([...store.keys()]).toEqual(["workbox-precache-v2-https://rafeeq.nan.sa/"])
    expect(await (await caches.open(PREF_CACHE)).match(DISCREET_PREF)).toBeUndefined()
  })

  it("plt05_r7_ex2_progress_is_saved_to_the_account_before_logout_and_erase", async () => {
    learnedOneLesson()
    stubFetch(merged)
    fakeCaches([])
    const go = vi.fn()
    render(<SignOutButton leave={() => signOutAndErase(go)} />)

    fireEvent.click(screen.getByRole("button", { name: ar_("me.signout") }))
    await waitFor(() => expect(go).toHaveBeenCalledWith("/app/welcome"))

    const order = calls.map((c) => c.url)
    const putLearning = order.indexOf("/api/me/learning")
    expect(putLearning).toBeGreaterThanOrEqual(0)
    expect(calls[putLearning].method).toBe("PUT")
    expect((calls[putLearning].body as { completed: object }).completed).toHaveProperty("u1-l1")
    expect(order.indexOf("/api/me/motivation")).toBeLessThan(order.indexOf("/api/auth/logout"))
    expect(putLearning).toBeLessThan(order.indexOf("/api/auth/logout"))
    expect(deviceDataAtLogout).not.toBeNull() // erased only after logout
    expect(localStorage.getItem("rafeeq.learning")).toBeNull()
    expect(screen.queryByText(ar_("acct.signOut.lostTitle"))).toBeNull()
  })

  it("plt05_r7_ex3_offline_with_unsaved_progress_asks_and_waiting_keeps_everything", async () => {
    learnedOneLesson()
    setOnline(false)
    stubFetch()
    fakeCaches(["rafeeq-content"])
    const leave = vi.fn(async () => undefined)
    render(<SignOutButton leave={leave} />)
    const before = localStorage.getItem("rafeeq.learning")

    fireEvent.click(screen.getByRole("button", { name: ar_("me.signout") }))
    expect(await screen.findByText(ar_("acct.signOut.lostTitle"))).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: ar_("acct.signOut.wait") }))

    await waitFor(() => expect(screen.queryByText(ar_("acct.signOut.lostTitle"))).toBeNull())
    expect(leave).not.toHaveBeenCalled()
    expect(calls).toEqual([])
    expect(useAuth.getState().token).toBe("t")
    expect(localStorage.getItem("rafeeq.learning")).toBe(before)
  })

  it("plt05_r7_ex3_offline_with_unsaved_progress_can_still_sign_out_and_erase", async () => {
    learnedOneLesson()
    setOnline(false)
    stubFetch(merged)
    const leave = vi.fn(async () => undefined)
    render(<SignOutButton leave={leave} />)

    fireEvent.click(screen.getByRole("button", { name: ar_("me.signout") }))
    fireEvent.click(await screen.findByRole("button", { name: ar_("acct.signOut.anyway") }))

    await waitFor(() => expect(leave).toHaveBeenCalledOnce())
  })

  it("plt05_r7_ex3_server_unreachable_with_progress_asks_too", async () => {
    learnedOneLesson()
    stubFetch((url) => (url.startsWith("/api/me/") ? json({ detail: "down" }, 503) : merged(url)))
    const leave = vi.fn(async () => undefined)
    render(<SignOutButton leave={leave} />)

    fireEvent.click(screen.getByRole("button", { name: ar_("me.signout") }))

    expect(await screen.findByText(ar_("acct.signOut.lostTitle"))).toBeTruthy()
    expect(leave).not.toHaveBeenCalled()
  })

  it("plt05_r7_offline_with_no_progress_on_the_device_signs_out_without_asking", async () => {
    setOnline(false)
    stubFetch(merged)
    const leave = vi.fn(async () => undefined)
    render(<SignOutButton leave={leave} />)

    fireEvent.click(screen.getByRole("button", { name: ar_("me.signout") }))

    await waitFor(() => expect(leave).toHaveBeenCalledOnce())
    expect(screen.queryByText(ar_("acct.signOut.lostTitle"))).toBeNull()
  })

  it("plt05_r7_ex4_permissions_org_link_and_conversations_stay_and_this_device_gets_no_more_pushes", async () => {
    useCompanion.setState({ helpToken: "guest-help-token" })
    useOrgLink.getState().set({ link: { name: "مكتب", lang: "tl", linkedAt: "2026-10-01T00:00:00Z" } })
    const sub = fakePush()
    stubFetch()
    fakeCaches([])

    await signOutAndErase(vi.fn())

    expect(calls.some((c) => c.url.startsWith("/api/org/"))).toBe(false)
    expect(calls.some((c) => c.url.startsWith("/api/help/") && c.method === "DELETE")).toBe(false)
    expect(calls.some((c) => c.url.startsWith("/api/me") && c.method === "DELETE")).toBe(false)
    expect(calls).toContainEqual({ url: "/api/push/unsubscribe", method: "POST", body: { endpoint: sub.endpoint } })
    expect(sub.unsubscribe).toHaveBeenCalledOnce()
  })

  // --- owner's follow-up on PR #42 ------------------------------------------

  const note: Note = { id: "n1", text: "سؤال", createdAt: "2026-10-06T10:00:00Z", sentTo: null, sentAt: null }
  const habit: Habit = { id: "h1", title: "المشي", worship: false, createdAt: "2026-10-06T10:00:00Z" }
  const savedItem: SavedEntry = { kind: "card", ref: "c1", saved_at: "2026-10-06T10:00:00Z" }
  const dialogText = () => screen.getByRole("alertdialog").textContent ?? ""

  it("plt05_r7_device_only_notebook_and_habits_are_named_in_one_dialog_with_cancel", async () => {
    useNotebook.setState({ notes: [note] })
    usePractice.setState({ habits: [habit] })
    stubFetch(merged)
    const leave = vi.fn(async () => undefined)
    render(<SignOutButton leave={leave} />)

    fireEvent.click(screen.getByRole("button", { name: ar_("me.signout") }))
    await screen.findByText(ar_("acct.signOut.lostTitle"))

    expect(screen.getAllByRole("alertdialog")).toHaveLength(1)
    expect(dialogText()).toContain(ar_("acct.signOut.deviceOnly"))
    expect(dialogText()).toContain(ar_("acct.signOut.lost.notebook"))
    expect(dialogText()).toContain(ar_("acct.signOut.lost.habits"))
    expect(dialogText()).not.toContain(ar_("acct.signOut.lost.progress"))
    expect(dialogText()).not.toContain(ar_("acct.signOut.lost.saved"))
    fireEvent.click(screen.getByRole("button", { name: ar_("common.cancel") }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(leave).not.toHaveBeenCalled()
    expect(useNotebook.getState().notes).toHaveLength(1)
  })

  it("plt05_r7_saved_items_that_reached_the_account_are_not_named", async () => {
    useSaved.setState({ items: [savedItem] })
    stubFetch((url) => (url === "/api/me/saved" ? json({ items: [savedItem] }) : merged(url)))
    const leave = vi.fn(async () => undefined)
    render(<SignOutButton leave={leave} />)

    fireEvent.click(screen.getByRole("button", { name: ar_("me.signout") }))

    await waitFor(() => expect(leave).toHaveBeenCalledOnce())
    expect(calls.some((c) => c.url === "/api/me/saved" && c.method === "PUT")).toBe(true)
  })

  it("plt05_r7_offline_progress_saved_items_and_notebook_share_one_dialog_that_offers_waiting", async () => {
    learnedOneLesson()
    useSaved.setState({ items: [savedItem] })
    useNotebook.setState({ notes: [note] })
    setOnline(false)
    stubFetch(merged)
    render(<SignOutButton leave={vi.fn(async () => undefined)} />)

    fireEvent.click(screen.getByRole("button", { name: ar_("me.signout") }))
    await screen.findByText(ar_("acct.signOut.lostTitle"))

    expect(screen.getAllByRole("alertdialog")).toHaveLength(1)
    for (const k of ["acct.signOut.offline", "acct.signOut.lost.progress", "acct.signOut.lost.saved", "acct.signOut.lost.notebook"] as Key[]) expect(dialogText()).toContain(ar_(k))
    expect(screen.getByRole("button", { name: ar_("acct.signOut.wait") })).toBeTruthy()
    expect(screen.getByRole("button", { name: ar_("acct.signOut.anyway") })).toBeTruthy()
  })

  it("plt05_r7_server_rejection_says_waiting_will_not_help_and_offers_cancel", async () => {
    learnedOneLesson()
    stubFetch((url) => (url === "/api/me/learning" ? json({ detail: "invalid" }, 422) : merged(url)))
    render(<SignOutButton leave={vi.fn(async () => undefined)} />)

    fireEvent.click(screen.getByRole("button", { name: ar_("me.signout") }))
    await screen.findByText(ar_("acct.signOut.lostTitle"))

    expect(dialogText()).toContain(ar_("acct.signOut.rejected"))
    expect(dialogText()).not.toContain(ar_("acct.signOut.offline"))
    expect(screen.getByRole("button", { name: ar_("common.cancel") })).toBeTruthy()
    expect(screen.queryByRole("button", { name: ar_("acct.signOut.wait") })).toBeNull()
  })

  it("plt05_r7_server_unavailable_is_treated_like_offline_not_as_a_rejection", async () => {
    learnedOneLesson()
    stubFetch((url) => (url === "/api/me/learning" ? json({ detail: "down" }, 503) : merged(url)))
    render(<SignOutButton leave={vi.fn(async () => undefined)} />)

    fireEvent.click(screen.getByRole("button", { name: ar_("me.signout") }))
    await screen.findByText(ar_("acct.signOut.lostTitle"))

    expect(dialogText()).toContain(ar_("acct.signOut.offline"))
    expect(screen.getByRole("button", { name: ar_("acct.signOut.wait") })).toBeTruthy()
  })

  it("plt05_r7_privacy_policy_says_sign_out_erases_the_device_in_all_three_languages", () => {
    expect(POLICY_SECTIONS).toContain("signout")
    for (const d of [ar, en, tl] as Record<string, string>[]) {
      expect(d["policy.signout.title"]).toBeTruthy()
      expect(d["policy.signout.body"]).toBeTruthy()
    }
    render(<MemoryRouter><Privacy /></MemoryRouter>)
    expect(screen.getByRole("heading", { name: ar_("policy.signout.title") })).toBeTruthy()
    expect(screen.getByText(ar_("policy.signout.body"))).toBeTruthy()
  })
})
