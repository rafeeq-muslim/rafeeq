/**
 * Fetch wrapper: JSON, access token, one refresh retry on 401.
 * KNW-01 reliability §14.3: an AbortSignal covers the whole call, including
 * the refresh and the retry, without cancelling the shared refresh other
 * requests may be waiting on; a non-JSON body (an HTML 502 page) keeps its
 * HTTP status instead of becoming a parse error; Retry-After is kept.
 */
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"

export class ApiError extends Error {
  status: number
  detail: unknown
  /** Seconds from a Retry-After header (429/503), if the server sent one. */
  retryAfter: number | null
  constructor(status: number, detail: unknown, retryAfter: number | null = null) {
    super(typeof detail === "string" ? detail : `http_${status}`)
    this.status = status
    this.detail = detail
    this.retryAfter = retryAfter
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

/** Wait for `p`, but give up when `signal` aborts (without cancelling `p` itself). */
function untilAborted<T>(p: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return p
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"))
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"))
    signal.addEventListener("abort", onAbort, { once: true })
    p.then(
      (v) => {
        signal.removeEventListener("abort", onAbort)
        resolve(v)
      },
      (e) => {
        signal.removeEventListener("abort", onAbort)
        reject(e)
      },
    )
  })
}

function retryAfterSeconds(r: Response): number | null {
  const v = r.headers?.get?.("Retry-After")
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.ceil(n) : null
}

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
  if (r.status === 401 && token && !retried && (await untilAborted(refreshSession(), opts.signal))) return api<T>(path, opts, true)
  if (r.status === 204) return undefined as T
  const text = await r.text()
  let data: unknown
  let parsed = true
  try {
    data = text ? JSON.parse(text) : undefined
  } catch {
    parsed = false // e.g. an HTML error page from a proxy
  }
  if (!r.ok) {
    const detail = parsed ? ((data as { detail?: unknown } | undefined)?.detail ?? data) : "non_json_body"
    throw new ApiError(r.status, detail, retryAfterSeconds(r))
  }
  if (!parsed) throw new ApiError(r.status, "invalid_response")
  return data as T
}

/** Fire-and-forget anonymous event (MOT-07 R4). Queued offline, flushed later. */
const QUEUE_KEY = "rafeeq.eventQueue"

/** MOT-09 R4: a per-device order of events, so "the next answer after
 * «لماذا؟»" is right even when a whole offline queue arrives at once. */
const SEQ_KEY = "rafeeq.eventSeq"
let memSeq = 0
function nextSeq(): number {
  try {
    const n = Number(localStorage.getItem(SEQ_KEY) ?? "0") + 1
    localStorage.setItem(SEQ_KEY, String(n))
    return n
  } catch {
    return ++memSeq
  }
}

export function sendEvent(event: Record<string, unknown>) {
  if (!useDevice.getState().shareEvents && event.type !== "opt_out") return
  event = { at: new Date().toISOString(), ...(event.type === "opt_out" ? {} : { seq: nextSeq() }), ...event }
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
    const install_id = useDevice.getState().installId
    const r = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ install_id, events: q.slice(0, 500) }),
    })
    if (r.ok || r.status === 422) localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(500)))
  } catch {
    /* retried on next event or when back online */
  } finally {
    flushing = false
  }
}
