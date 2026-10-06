/**
 * PLT-05 privacy actions on this device.
 *
 * - Quick exit (R2), as GOV.UK's «Exit this page»: the page is covered at
 *   once (so nothing shows on a slow connection), then replaced by a neutral
 *   weather page. Pressing Shift three times does the same. A page cannot
 *   erase browser history, so the setting says how to (privacy.historyNote).
 * - Erase this device (R4): everything Rafeeq keeps in this browser, plus a
 *   guest's conversations with a person and the push subscription on the
 *   server; then the first-run language screen.
 * - Sign out (R7): progress is saved to the account first (SignOutButton),
 *   then this browser is erased like R4, keeping only the app shell cache.
 *   Nothing account-side changes (organisation link, conversations).
 * - Download a copy of my data (R6): one JSON file with this device's data
 *   and, for an account, what the server keeps (GET /api/me/export), plus
 *   the server's copy of this device's organisation link if it has one
 *   (ORG-01). Erasing the device also removes that link.
 */
import { api } from "@/app/lib/api"
import { appUrl } from "@/app/lib/base"
import { useAuth } from "@/app/stores/auth"
import { helpHeaders } from "@/app/companion/store"
import { linkState, unlinkOrg } from "@/app/org/api"
import { useOrgLink } from "@/app/org/store"

export const EXIT_URL = "https://www.bbc.com/weather"
const PREFIX = "rafeeq."

export function exitNow(go: (url: string) => void = (url) => window.location.replace(url)) {
  if (typeof document !== "undefined") {
    const cover = document.createElement("div")
    cover.setAttribute("data-quick-exit", "")
    cover.className = "fixed inset-0 z-[2147483647] bg-background"
    document.body.appendChild(cover)
    document.title = ""
  }
  go(EXIT_URL)
}

/** R2 ex2: Shift pressed three times in a row (within 5 seconds, no other key between). */
export function shiftTimesThree(onExit: () => void, windowMs = 5000) {
  let presses: number[] = []
  return (e: KeyboardEvent) => {
    if (e.key !== "Shift") {
      presses = []
      return
    }
    if (e.repeat) return
    const now = Date.now()
    presses = [...presses.filter((t) => now - t < windowMs), now]
    if (presses.length >= 3) {
      presses = []
      onExit()
    }
  }
}

function readJson(raw: string | null): unknown {
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/** Everything Rafeeq keeps in this browser, by key (R6, device part). */
export function deviceData(storage: Storage = localStorage): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(storage).sort()) if (k.startsWith(PREFIX)) out[k.slice(PREFIX.length)] = readJson(storage.getItem(k))
  // The guest help token is a secret that only proves ownership of the conversations; leave it out.
  const companion = out["companion"] as { state?: { helpToken?: unknown } } | undefined
  if (companion?.state && "helpToken" in companion.state) companion.state.helpToken = companion.state.helpToken ? "(kept on this device)" : null
  return out
}

export async function myData(): Promise<{
  format: string
  exported_at: string
  device: Record<string, unknown>
  account: unknown
  organization_link?: unknown
}> {
  const account = useAuth.getState().me ? await api<unknown>("/api/me/export") : null
  const out = { format: "rafeeq-my-data/1", exported_at: new Date().toISOString(), device: deviceData(), account }
  // ORG-01: what the server keeps about this device's organisation link (asked only when there is one).
  if (useOrgLink.getState().link) return { ...out, organization_link: await linkState().catch(() => null) }
  return out
}

export async function downloadMyData() {
  const data = await myData()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `rafeeq-my-data-${data.exported_at.slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** What Rafeeq keeps in this browser outside Cache Storage: this device's push
 * subscription (server row and browser), every rafeeq.* key, the session. */
async function clearBrowserStorage() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? []
    for (const r of regs) {
      const sub = await r.pushManager?.getSubscription()
      if (!sub) continue
      await api("/api/push/unsubscribe", { method: "POST", body: { endpoint: sub.endpoint } }).catch(() => undefined)
      await sub.unsubscribe().catch(() => undefined)
    }
  } catch {
    /* no service worker here */
  }
  for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k)
  try {
    sessionStorage.clear()
  } catch {
    /* blocked storage */
  }
}

/** The service worker's app shell; keeping it lets Rafeeq still open after sign-out. */
export const isAppShellCache = (name: string) => name.startsWith("workbox-precache")

/** R4: erase this device, then start again from the language screen. */
export async function wipeDevice(go: (url: string) => void = (url) => window.location.replace(url)) {
  const guest = !useAuth.getState().me
  const headers = helpHeaders()
  if (guest && headers["X-Help-Token"]) await api("/api/help/guest", { method: "DELETE", headers }).catch(() => undefined)
  await unlinkOrg().catch(() => undefined) // ORG-01 R4: an organisation link goes with the device
  await api("/api/auth/logout", { method: "POST" }).catch(() => undefined)
  await clearBrowserStorage()
  if (typeof caches !== "undefined") for (const k of await caches.keys()) await caches.delete(k)
  go(appUrl("/welcome"))
}

/** R7: sign out, then erase this device like R4 but keep the app shell. Only
 * what lives in the browser goes: the account keeps its organisation link,
 * its conversations with a person and its progress (saved by the caller). */
export async function signOutAndErase(go: (url: string) => void = (url) => window.location.replace(url)) {
  await api("/api/auth/logout", { method: "POST" }).catch(() => undefined)
  useAuth.getState().set({ token: null, me: null })
  await clearBrowserStorage()
  // Runtime caches (content, media) and the discreet-mode copy (rafeeq-prefs) go.
  if (typeof caches !== "undefined") for (const k of await caches.keys()) if (!isAppShellCache(k)) await caches.delete(k)
  go(appUrl("/welcome")) // PLT-10 R2
}
