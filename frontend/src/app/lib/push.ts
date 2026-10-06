/** PLT-06 web push on this device. Two types travel by push, each with its
 * own switch: the learning reminder (MOT-05) and replies from a person
 * (CMP-01). Both are off until the person turns one on (R1); the browser's
 * permission is asked only then, after their tap, and never again once it
 * was refused (R5). On an iPhone, push reaches only an app added to the
 * Home Screen (R4). The third type, the prayer reminder, stays on the device
 * (practice/reminders.ts). */
import { api } from "@/app/lib/api"
import { useDevice } from "@/app/stores/device"
import { localDay } from "@/app/motivation/streak"

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window

export type PushState = "ok" | "ios-home-screen" | "unsupported" | "denied"

type Env = { userAgent: string; platform: string; maxTouchPoints: number; standalone: boolean; supported: boolean; permission: string }

function currentEnv(): Env {
  const nav = typeof navigator !== "undefined" ? navigator : undefined
  const standalone =
    (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches) ||
    (nav as (Navigator & { standalone?: boolean }) | undefined)?.standalone === true
  return {
    userAgent: nav?.userAgent ?? "",
    platform: nav?.platform ?? "",
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    standalone: !!standalone,
    supported: pushSupported(),
    permission: typeof Notification !== "undefined" ? Notification.permission : "default",
  }
}

export const isIOS = (e: Pick<Env, "userAgent" | "platform" | "maxTouchPoints">) =>
  /iPhone|iPad|iPod/.test(e.userAgent) || (e.platform === "MacIntel" && e.maxTouchPoints > 1)

/** What this device can do with push right now (R4, R5). */
export function pushState(env: Env = currentEnv()): PushState {
  if (isIOS(env) && !env.standalone) return "ios-home-screen"
  if (!env.supported) return "unsupported"
  if (env.permission === "denied") return "denied"
  return "ok"
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

/** R1/R5: ask the browser only while it has not answered yet; a refusal is final here. */
export async function askPermission(): Promise<boolean> {
  if (!pushSupported() || pushState() !== "ok") return false
  if (Notification.permission === "granted") return true
  return (await Notification.requestPermission()) === "granted"
}

/** Subscribe (asks permission the first time). Returns the endpoint, or null if refused or unsupported. */
export async function subscribe(): Promise<string | null> {
  if (!(await askPermission())) return null
  const { key } = await api<{ key: string | null }>("/api/push/public-key")
  if (!key) return null
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }))
  const { installId, locale } = useDevice.getState()
  await api("/api/push/subscribe", {
    method: "POST",
    body: { install_id: installId, subscription: sub.toJSON(), locale, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
  })
  return sub.endpoint
}

/** Minimum data: with both push types off, the subscription is removed here and on the server. */
async function dropIfUnused() {
  const { reminderOn, repliesOn } = useDevice.getState()
  if (reminderOn || repliesOn) return
  const sub = await currentSubscription()
  if (!sub) return
  await api("/api/push/unsubscribe", { method: "POST", body: { endpoint: sub.endpoint } }).catch(() => undefined)
  await sub.unsubscribe().catch(() => undefined)
}

export async function setReminder(enabled: boolean, time?: string) {
  const endpoint = enabled ? await subscribe() : (await currentSubscription())?.endpoint
  if (!endpoint) return null
  const { locale } = useDevice.getState()
  const r = await api<{ enabled: boolean; time: string | null }>("/api/push/reminder", {
    method: "PUT",
    body: { endpoint, enabled, time, locale, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
  })
  if (!r.enabled) {
    useDevice.getState().set({ reminderOn: false })
    await dropIfUnused()
  }
  return r
}

/** R2: replies from a person, on or off for this device. */
export async function setReplies(enabled: boolean) {
  const endpoint = enabled ? await subscribe() : (await currentSubscription())?.endpoint
  if (!endpoint) return null
  const r = await api<{ enabled: boolean }>("/api/push/replies", { method: "PUT", body: { endpoint, enabled } })
  useDevice.getState().set({ repliesOn: r.enabled })
  if (!r.enabled) await dropIfUnused()
  return r
}

/** Show the switches as the server holds them (a refused or revoked permission shows them off). */
export async function syncPushSwitches() {
  const sub = await currentSubscription().catch(() => null)
  if (!sub || pushState() !== "ok") {
    useDevice.getState().set({ reminderOn: false, repliesOn: false })
    return
  }
  const s = await api<{ subscribed: boolean; reminder: boolean; time: string | null; replies: boolean }>("/api/push/state", {
    method: "POST",
    body: { endpoint: sub.endpoint },
  })
  const time = s.time ?? useDevice.getState().reminderTime
  useDevice.getState().set({ reminderOn: s.reminder, reminderTime: time, repliesOn: s.replies })
}

/** MOT-05 R2: tell the server only the date this device learned on. */
export async function reportLearnedToday() {
  try {
    const sub = await currentSubscription()
    if (sub) await api("/api/push/learned", { method: "POST", body: { endpoint: sub.endpoint, day: localDay() } })
  } catch {
    /* offline: the reminder may arrive; harmless */
  }
}
