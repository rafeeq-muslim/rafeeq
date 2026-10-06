/**
 * The Ask thread for this visit. Remembering conversations across sessions
 * is out of scope (KNW-01) and no question text goes to the server; within
 * the visit the thread and the draft survive a reload through the tab's
 * session storage (KNW-01 R7, ask/session.ts), and an app update waits
 * while a conversation is open (lib/pwa.ts).
 *
 * KNW-01 reliability R1, R6, §14.3:
 * - one submission contract for typed questions and suggestions
 *   (`submitQuestion`); a suggestion sends its shown text, with an id for
 *   tracing only;
 * - the request lock is taken synchronously, before the first await, so a
 *   double tap or a fast Enter sends one request;
 * - every attempt ends: answer, error (network, timeout, 422, 429, 5xx,
 *   unreadable reply) or cancelled; never a pending bubble forever. The
 *   65-second deadline (PRD live v3 §9) covers the whole attempt, auth refresh included;
 * - a retry re-sends the original snapshot (question, language, consent,
 *   entry point) into the same assistant message, adds no user bubble and
 *   never touches the draft; a late reply of an older attempt is dropped.
 */
import { create } from "zustand"
import { ApiError, api } from "@/app/lib/api"
import { useDevice } from "@/app/stores/device"
import { holdUpdateWhile } from "@/app/lib/pwa"
import { clearSession, keepsOnDevice, loadSession, saveDraft, saveThread } from "./session"
import type { AskResponse, AskSnapshot, Entrypoint, ErrorCode, Turn } from "./types"

/**
 * Whole-attempt deadline in the app, auth refresh included. The server stops
 * at 45 s (ASK_DEADLINE_SECONDS), or 60 s with live sources on
 * (ASK_LIVE_DEADLINE_SECONDS, PRD live v3 §9: the app waits 65 s).
 */
export const ASK_CLIENT_DEADLINE_MS = 65_000
export const QUESTION_MIN = 2
export const QUESTION_MAX = 600

export type SubmitInput = { text: string; lang: string; entrypoint: Entrypoint; suggestionId?: string }
export type Submitted =
  | { accepted: true; turnId: string; done: Promise<AskResponse | null> }
  | { accepted: false; reason: "too_short" | "too_long" | "busy" }

type AskState = {
  turns: Turn[]
  busy: boolean
  /** The attempt that holds the lock. */
  active: string | null
  submitQuestion: (input: SubmitInput) => Submitted
  retry: (turnId: string) => Submitted
  cancel: () => void
  put: (id: string, turn: Turn) => void
  reset: () => void
  /** PLT-15 R5: the typed question stays here (kept like the thread) while
   * offline or on another screen, until its owner sends it. */
  draft: string
  setDraft: (v: string | ((d: string) => string)) => void
}

const newId = () => Math.random().toString(36).slice(2, 10)
const requestId = () => `${newId()}${newId()}`

type Running = { abort: (why: "timeout" | "cancelled") => void }
const running = new Map<string, Running>()

export function validateQuestion(text: string): "too_short" | "too_long" | null {
  const q = text.trim()
  if (q.length < QUESTION_MIN) return "too_short"
  if (q.length > QUESTION_MAX) return "too_long"
  return null
}

/** A 200 reply that does not match the contract is an error, never undefined in the UI. */
export function isAskResponse(r: unknown): r is AskResponse {
  const x = r as Partial<AskResponse> | null
  return (
    !!x &&
    typeof x === "object" &&
    typeof x.ask_id === "string" &&
    typeof x.outcome === "string" &&
    typeof x.answer === "string" &&
    Array.isArray(x.sources) &&
    Array.isArray(x.notes)
  )
}

function classify(e: unknown, why: "timeout" | "cancelled" | null): { code: ErrorCode; retryAfter: number | null } {
  if (why) return { code: why, retryAfter: null }
  if (e instanceof ApiError) {
    if (e.status === 429) return { code: "rate_limited", retryAfter: e.retryAfter }
    if (e.status === 422) return { code: "invalid", retryAfter: null }
    if (e.status >= 200 && e.status < 300) return { code: "invalid_response", retryAfter: null }
    return { code: "server", retryAfter: e.retryAfter }
  }
  if (e instanceof DOMException && e.name === "AbortError") return { code: "cancelled", retryAfter: null }
  return { code: "network", retryAfter: null }
}

export const useAsk = create<AskState>()((set, get) => {
  /** Start one attempt for `turnId`. The caller has already set the pending turn and the lock. */
  const start = (turnId: string, attemptId: string, snapshot: AskSnapshot): Promise<AskResponse | null> => {
    const ctrl = new AbortController()
    let why: "timeout" | "cancelled" | null = null
    const abort = (reason: "timeout" | "cancelled") => {
      why ??= reason
      ctrl.abort()
    }
    const timer = setTimeout(() => abort("timeout"), ASK_CLIENT_DEADLINE_MS)
    running.set(attemptId, { abort })
    const current = () => {
      const t = get().turns.find((x) => x.id === turnId)
      return !!t && t.role === "assistant" && t.state === "pending" && t.attemptId === attemptId
    }
    return (async () => {
      try {
        const body: Record<string, unknown> = {
          question: snapshot.question,
          lang: snapshot.lang,
          consent_objectives: snapshot.consent_objectives,
          client_request_id: requestId(),
          entrypoint: snapshot.entrypoint,
        }
        if (snapshot.suggestion_id) body.suggestion_id = snapshot.suggestion_id
        // The attempt ends at abort even if a reply is still on its way; that late reply is dropped.
        const aborted = new Promise<never>((_, reject) =>
          ctrl.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }),
        )
        aborted.catch(() => undefined)
        const r = await Promise.race([api<unknown>("/api/ask", { method: "POST", body, signal: ctrl.signal }), aborted])
        if (!isAskResponse(r)) throw new ApiError(200, "invalid_response")
        if (!current()) return null // a newer attempt or a reset owns this message now
        get().put(turnId, { id: turnId, role: "assistant", state: "done", response: r, snapshot })
        return r
      } catch (e) {
        if (!current()) return null
        const { code, retryAfter } = classify(e, why)
        get().put(turnId, { id: turnId, role: "assistant", state: "error", code, retryAfter, snapshot })
        return null
      } finally {
        clearTimeout(timer)
        running.delete(attemptId)
        // Release the lock only if this attempt still holds it.
        if (get().active === attemptId) set({ busy: false, active: null })
      }
    })()
  }

  const kept = loadSession() // KNW-01 R7: what this visit already held before a reload
  return {
    turns: kept.turns,
    busy: false,
    active: null,
    draft: kept.draft,
    setDraft: (v) => set({ draft: typeof v === "function" ? v(get().draft) : v }),
    put: (id, turn) => set({ turns: get().turns.map((t) => (t.id === id ? turn : t)) }),

    submitQuestion: ({ text, lang, entrypoint, suggestionId }) => {
      const invalid = validateQuestion(text)
      if (invalid) return { accepted: false, reason: invalid }
      if (get().busy) return { accepted: false, reason: "busy" }
      const snapshot: AskSnapshot = {
        question: text.trim(),
        lang,
        consent_objectives: useDevice.getState().askConsent,
        entrypoint,
        ...(suggestionId ? { suggestion_id: suggestionId } : {}),
      }
      const turnId = newId()
      const attemptId = newId()
      // Lock and bubbles in one synchronous update, before any await.
      set({
        busy: true,
        active: attemptId,
        turns: [
          ...get().turns,
          { id: newId(), role: "user", text: snapshot.question },
          { id: turnId, role: "assistant", state: "pending", startedAt: Date.now(), attemptId, snapshot },
        ],
      })
      return { accepted: true, turnId, done: start(turnId, attemptId, snapshot) }
    },

    retry: (turnId) => {
      if (get().busy) return { accepted: false, reason: "busy" }
      const t = get().turns.find((x) => x.id === turnId)
      if (!t || t.role !== "assistant" || !("snapshot" in t) || t.state === "pending") return { accepted: false, reason: "busy" }
      if (t.state === "done" && !t.response.retryable) return { accepted: false, reason: "busy" }
      const snapshot = t.snapshot
      const attemptId = newId()
      set({
        busy: true,
        active: attemptId,
        turns: get().turns.map((x) =>
          x.id === turnId ? { id: turnId, role: "assistant", state: "pending", startedAt: Date.now(), attemptId, snapshot } : x,
        ),
      })
      return { accepted: true, turnId, done: start(turnId, attemptId, snapshot) }
    },

    cancel: () => {
      const a = get().active
      if (a) running.get(a)?.abort("cancelled")
    },

    reset: () => {
      for (const r of running.values()) r.abort("cancelled")
      running.clear()
      set({ turns: [], busy: false, active: null, draft: "" })
      clearSession()
    },
  }
})

// KNW-01 R7: keep the visit's copy in step with the thread and the draft.
useAsk.subscribe((s, prev) => {
  if (s.turns !== prev.turns) saveThread(s.turns)
  if (s.draft !== prev.draft) saveDraft(s.draft)
})
// Quick exit or discreet mode turned on: the copy goes at once; turned off: it is written again.
useDevice.subscribe((d, prev) => {
  if (d.quickExit === prev.quickExit && d.discreet === prev.discreet) return
  const { turns, draft } = useAsk.getState()
  saveThread(turns)
  saveDraft(draft)
})

const ON_ASK = /^\/ask(\/|$)/
/** KNW-01 R7: an app update never reloads the page under an open conversation
 * (on the Ask screen, while an answer is on its way, or when the conversation
 * lives in memory only); the update bar offers it instead. */
export function conversationHoldsUpdate(path: string): boolean {
  const { turns, draft, busy } = useAsk.getState()
  if (turns.length === 0 && !draft.trim()) return false
  return busy || ON_ASK.test(path) || !keepsOnDevice()
}
holdUpdateWhile(conversationHoldsUpdate)
