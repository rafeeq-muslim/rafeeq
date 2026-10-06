/**
 * KNW-01 R7: the Ask conversation of this visit, kept in the tab's session
 * storage so that a reload (an app update, a manual refresh, the phone
 * dropping a background tab) does not empty the chat.
 *
 * - This visit only: session storage belongs to one tab and goes when the
 *   tab or the installed app is closed. A copy idle for a day is dropped, so
 *   a browser that restores yesterday's tabs does not bring it back.
 * - Nothing is written while quick exit or discreet mode is on (PLT-05: a
 *   learner hiding their Islam leaves no question text on the device); the
 *   conversation then lives in memory only, as before.
 * - Never local storage, never the server (rules.md §2.6, §4).
 * - Cleared by quick exit, «امسح بيانات هذا الجهاز» and sign-out
 *   (lib/privacy.ts clears the session storage).
 */
import { useDevice } from "@/app/stores/device"
import type { Turn } from "./types"

export const ASK_THREAD_KEY = "rafeeq.ask.thread"
export const ASK_DRAFT_KEY = "rafeeq.ask.draft"
/** Bump when the shape of a stored turn changes, and add a step to `migrate`. */
export const ASK_SESSION_VERSION = 1
export const ASK_SESSION_IDLE_MS = 24 * 60 * 60 * 1000

type Stored<T> = { v: number; at: number; data: T }

function storage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage
  } catch {
    return null // blocked storage
  }
}

/** False for a learner who turned on quick exit or discreet mode. */
export function keepsOnDevice(): boolean {
  const d = useDevice.getState()
  return !d.quickExit && !d.discreet
}

/** Older formats are brought forward here; an unknown one is dropped. */
function migrate(v: number, data: unknown): unknown {
  if (v === ASK_SESSION_VERSION) return data
  return null
}

function read(key: string, now: number): unknown {
  const s = storage()
  if (!s) return null
  try {
    const raw = s.getItem(key)
    if (raw === null) return null
    const x = JSON.parse(raw) as Partial<Stored<unknown>> | null
    const fresh = !!x && typeof x.v === "number" && typeof x.at === "number" && now - x.at < ASK_SESSION_IDLE_MS
    const data = fresh && keepsOnDevice() ? migrate(x.v as number, x.data) : null
    if (data === null) s.removeItem(key)
    return data
  } catch {
    return null
  }
}

function write(key: string, data: unknown, now: number): boolean {
  const s = storage()
  if (!s) return true
  try {
    s.setItem(key, JSON.stringify({ v: ASK_SESSION_VERSION, at: now, data } satisfies Stored<unknown>))
    return true
  } catch {
    return false // quota
  }
}

function remove(key: string) {
  try {
    storage()?.removeItem(key)
  } catch {
    /* blocked storage */
  }
}

const STATES = ["pending", "done", "error", "guide"]

/** A stored turn as the reloaded page can show it. An answer that was still
 * on its way when the page went (or a learning-guide reply not yet written)
 * becomes «توقف هذا السؤال» with a retry: never a pending bubble forever. */
function restore(raw: unknown): Turn | null {
  const x = raw as Record<string, unknown> | null
  if (!x || typeof x !== "object" || typeof x.id !== "string") return null
  if (x.role === "user") return typeof x.text === "string" ? (x as Turn) : null
  if (x.role !== "assistant" || !STATES.includes(x.state as string)) return null
  const turn = x as Extract<Turn, { role: "assistant" }>
  if (turn.state === "done" && (!turn.response || typeof turn.response !== "object")) return null
  const unfinished = turn.state === "pending" || (turn.state === "done" && turn.response.outcome === "learning_guide")
  if (unfinished) return { id: turn.id, role: "assistant", state: "error", code: "cancelled", retryAfter: null, snapshot: turn.snapshot }
  return turn
}

export function loadSession(now = Date.now()): { turns: Turn[]; draft: string } {
  const rawTurns = read(ASK_THREAD_KEY, now)
  const turns = Array.isArray(rawTurns) ? rawTurns.map(restore).filter((t): t is Turn => t !== null) : []
  const rawDraft = read(ASK_DRAFT_KEY, now)
  return { turns, draft: typeof rawDraft === "string" ? rawDraft : "" }
}

export function saveThread(turns: Turn[], now = Date.now()) {
  if (turns.length === 0 || !keepsOnDevice()) return remove(ASK_THREAD_KEY)
  // Out of room: the page keeps every message; the copy keeps the latest ones.
  for (let from = 0; from < turns.length; from += 2) if (write(ASK_THREAD_KEY, turns.slice(from), now)) return
  remove(ASK_THREAD_KEY)
}

export function saveDraft(draft: string, now = Date.now()) {
  if (!draft || !keepsOnDevice() || !write(ASK_DRAFT_KEY, draft, now)) remove(ASK_DRAFT_KEY)
}

export function clearSession() {
  remove(ASK_THREAD_KEY)
  remove(ASK_DRAFT_KEY)
}
