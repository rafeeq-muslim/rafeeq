/** Fetch wrapper: JSON, access token, one refresh retry on 401. */
import { useAuth } from "@/app/stores/auth"

export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : `http_${status}`)
    this.status = status
    this.detail = detail
  }
  get code(): string {
    const d = this.detail as { code?: string } | string | undefined
    return typeof d === "string" ? d : d?.code ?? this.message
  }
}

let refreshing: Promise<boolean> | null = null

export async function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const r = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
      if (!r.ok) {
        useAuth.getState().set({ token: null, me: null, ready: true })
        return false
      }
      const body = await r.json()
      useAuth.getState().set({ token: body.access_token, me: body.user, ready: true })
      return true
    } catch {
      useAuth.getState().set({ ready: true })
      return false
    } finally {
      setTimeout(() => (refreshing = null), 0)
    }
  })()
  return refreshing
}

type Opts = Omit<RequestInit, "body"> & { body?: unknown; auth?: boolean }

export async function api<T = unknown>(path: string, opts: Opts = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...(opts.headers as Record<string, string>) }
  const token = useAuth.getState().token
  if (token) headers.Authorization = `Bearer ${token}`
  let body: BodyInit | undefined
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json"
    body = JSON.stringify(opts.body)
  }
  const r = await fetch(path, { ...opts, headers, body, credentials: "include" })
  if (r.status === 401 && token && !retried && (await refreshSession())) return api<T>(path, opts, true)
  if (r.status === 204) return undefined as T
  const text = await r.text()
  const data = text ? JSON.parse(text) : undefined
  if (!r.ok) throw new ApiError(r.status, data?.detail ?? data)
  return data as T
}

/** Fire-and-forget anonymous event (MOT-07 R4). Queued offline, flushed later. */
const QUEUE_KEY = "rafeeq.eventQueue"

export function sendEvent(event: Record<string, unknown>) {
  try {
    const q: unknown[] = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]")
    q.push(event)
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-500)))
  } catch {
    /* storage blocked */
  }
  void flushEvents()
}

let flushing = false
export async function flushEvents() {
  if (flushing || (typeof navigator !== "undefined" && !navigator.onLine)) return
  flushing = true
  try {
    const q: unknown[] = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]")
    if (q.length === 0) return
    const r = await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: q }) })
    if (r.ok) localStorage.setItem(QUEUE_KEY, "[]")
  } catch {
    /* retried on next event or when back online */
  } finally {
    flushing = false
  }
}
