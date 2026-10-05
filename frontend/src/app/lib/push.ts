/** PLT-06 web push on this device. Asking for permission happens only when
 * the learner turns a reminder on (MOT-05 R1), never on first run. */
import { api } from "@/app/lib/api"
import { useDevice } from "@/app/stores/device"
import { localDay } from "@/app/motivation/streak"

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window

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

/** Subscribe (asks permission). Returns the endpoint, or null if refused or unsupported. */
export async function subscribe(): Promise<string | null> {
  if (!pushSupported()) return null
  if ((await Notification.requestPermission()) !== "granted") return null
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

export async function setReminder(enabled: boolean, time?: string) {
  const endpoint = enabled ? await subscribe() : (await currentSubscription())?.endpoint
  if (!endpoint) return null
  const { locale } = useDevice.getState()
  return api<{ enabled: boolean; time: string | null }>("/api/push/reminder", {
    method: "PUT",
    body: { endpoint, enabled, time, locale, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
  })
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
