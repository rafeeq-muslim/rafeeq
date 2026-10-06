/**
 * KNW-01 reliability (docs/domains/knowledge/features/KNW-01-chatbot-reliability-prd.md):
 * the request cycle of the Ask store — one contract, one request per action,
 * every attempt ends, retries in place, late replies dropped (T01, T14, T15,
 * T17, T18, T27, T31). The server side is in backend/tests/test_knw01_reliability.py.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { ASK_CLIENT_DEADLINE_MS, useAsk } from "./store"
import { requestGuide } from "./guide"
import type { AskResponse, Turn } from "./types"

const ANSWER: AskResponse = {
  ask_id: "a1",
  outcome: "answered",
  reason_code: null,
  retryable: false,
  route: "general",
  level: "A",
  answer: "TEST_ANSWER",
  sources: [],
  notes: [],
  should_escalate: false,
  handoff: null,
  objective_id: null,
  lang: "ar",
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } })

/** A request that never answers but, like a real fetch, rejects when aborted. */
const hanging = (_url: string, init?: RequestInit) =>
  new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
  })

type Call = { url: string; body: Record<string, unknown> | undefined }
let calls: Call[] = []
function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  calls = []
  const fn = vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return impl(url, init)
  })
  vi.stubGlobal("fetch", fn)
  return fn
}
const askCalls = () => calls.filter((c) => c.url === "/api/ask")
const assistant = () => useAsk.getState().turns.filter((t) => t.role === "assistant") as Exclude<Turn, { role: "user" }>[]
const users = () => useAsk.getState().turns.filter((t) => t.role === "user")

beforeEach(() => {
  useAsk.getState().reset()
  useDevice.getState().set({ locale: "ar", askConsent: false })
  useAuth.getState().set({ token: null })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("knw-01 r1 one submission contract", () => {
  it("t01: a suggestion and the same typed text send the same question, language and consent", async () => {
    mockFetch(async () => json(ANSWER))
    const typed = useAsk.getState().submitQuestion({ text: "ما معنى الشهادتين؟", lang: "ar", entrypoint: "typed" })
    expect(typed.accepted).toBe(true)
    if (typed.accepted) await typed.done
    const clicked = useAsk.getState().submitQuestion({ text: "ما معنى الشهادتين؟", lang: "ar", entrypoint: "suggestion", suggestionId: "shahada_meaning" })
    if (clicked.accepted) await clicked.done
    const [a, b] = askCalls().map((c) => c.body!)
    const semantic = (x: Record<string, unknown>) => ({ question: x.question, lang: x.lang, consent_objectives: x.consent_objectives })
    expect(askCalls()).toHaveLength(2)
    expect(semantic(a)).toEqual(semantic(b))
    expect([a.entrypoint, b.entrypoint, b.suggestion_id]).toEqual(["typed", "suggestion", "shahada_meaning"])
    expect(a.suggestion_id).toBeUndefined()
    expect(a.client_request_id).not.toEqual(b.client_request_id)
  })

  it("validates the trimmed text before any bubble or request", () => {
    mockFetch(async () => json(ANSWER))
    expect(useAsk.getState().submitQuestion({ text: "  ا ", lang: "ar", entrypoint: "typed" })).toEqual({ accepted: false, reason: "too_short" })
    expect(useAsk.getState().submitQuestion({ text: "x".repeat(601), lang: "ar", entrypoint: "typed" })).toEqual({ accepted: false, reason: "too_long" })
    expect(useAsk.getState().turns).toEqual([])
    expect(askCalls()).toHaveLength(0)
  })

  it("t17: a double tap or fast Enter sends one request (lock before the first await)", async () => {
    mockFetch(async () => json(ANSWER))
    const first = useAsk.getState().submitQuestion({ text: "ما فضل الوضوء؟", lang: "ar", entrypoint: "suggestion", suggestionId: "wudu_virtue" })
    const second = useAsk.getState().submitQuestion({ text: "ما فضل الوضوء؟", lang: "ar", entrypoint: "suggestion", suggestionId: "wudu_virtue" })
    expect(second).toEqual({ accepted: false, reason: "busy" })
    expect(useAsk.getState().busy).toBe(true)
    if (first.accepted) await first.done
    expect(askCalls()).toHaveLength(1)
    expect(users()).toHaveLength(1)
    expect(useAsk.getState().busy).toBe(false)
  })

  it("t17: changing the app language while waiting does not change the question's language", async () => {
    mockFetch(async () => json(ANSWER))
    const r = useAsk.getState().submitQuestion({ text: "ما معنى الشهادتين؟", lang: "ar", entrypoint: "typed" })
    useDevice.getState().set({ locale: "en" })
    if (r.accepted) await r.done
    expect(askCalls()[0].body!.lang).toBe("ar")
  })
})

describe("knw-01 r6 every attempt ends", () => {
  it("t14: the 50 s deadline ends a request that never answers", async () => {
    vi.useFakeTimers()
    mockFetch(hanging)
    const r = useAsk.getState().submitQuestion({ text: "ما معنى الشهادتين؟", lang: "ar", entrypoint: "typed" })
    await vi.advanceTimersByTimeAsync(ASK_CLIENT_DEADLINE_MS - 1)
    expect(assistant()[0].state).toBe("pending")
    await vi.advanceTimersByTimeAsync(1)
    if (r.accepted) await r.done
    expect(assistant()[0]).toMatchObject({ state: "error", code: "timeout" })
    expect(useAsk.getState().busy).toBe(false)
  })

  it("t14: a dropped connection is a network error and frees the composer", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch")
    })
    const r = useAsk.getState().submitQuestion({ text: "ما معنى الشهادتين؟", lang: "ar", entrypoint: "typed" })
    if (r.accepted) await r.done
    expect(assistant()[0]).toMatchObject({ state: "error", code: "network" })
    expect(useAsk.getState().busy).toBe(false)
  })

  it("t14/t31: an HTML 502 page keeps its status; a 200 that is not the contract is an unreadable reply", async () => {
    mockFetch(async () => new Response("<html><body>Bad gateway</body></html>", { status: 502, headers: { "Content-Type": "text/html" } }))
    let r = useAsk.getState().submitQuestion({ text: "سؤال أول", lang: "ar", entrypoint: "typed" })
    if (r.accepted) await r.done
    expect(assistant()[0]).toMatchObject({ state: "error", code: "server" })

    mockFetch(async () => new Response("<html>ok</html>", { status: 200 }))
    r = useAsk.getState().submitQuestion({ text: "سؤال ثان", lang: "ar", entrypoint: "typed" })
    if (r.accepted) await r.done
    expect(assistant()[1]).toMatchObject({ state: "error", code: "invalid_response" })

    mockFetch(async () => json({ ok: true }))
    r = useAsk.getState().submitQuestion({ text: "سؤال ثالث", lang: "ar", entrypoint: "typed" })
    if (r.accepted) await r.done
    expect(assistant()[2]).toMatchObject({ state: "error", code: "invalid_response" })
    expect(useAsk.getState().busy).toBe(false)
  })

  it("t15: 422, 429 (with Retry-After) and 5xx are told apart, with no automatic retry", async () => {
    const cases: [Response, string, number | null][] = [
      [json({ detail: [{ msg: "too short" }] }, 422), "invalid", null],
      [json({ detail: "rate_limited" }, 429, { "Retry-After": "30" }), "rate_limited", 30],
      [json({ detail: "effects_failed" }, 503), "server", null],
      [json({ detail: "internal_error" }, 500), "server", null],
    ]
    for (const [i, [resp, code, after]] of cases.entries()) {
      mockFetch(async () => resp)
      const r = useAsk.getState().submitQuestion({ text: `سؤال ${i}`, lang: "ar", entrypoint: "typed" })
      if (r.accepted) await r.done
      expect(assistant()[i]).toMatchObject({ state: "error", code, retryAfter: after })
      expect(askCalls()).toHaveLength(1)
    }
  })

  it("t18: retry re-sends the snapshot into the same message, with no new user bubble", async () => {
    mockFetch(async () => {
      throw new TypeError("offline")
    })
    const first = useAsk.getState().submitQuestion({ text: "ما فضل الوضوء؟", lang: "ar", entrypoint: "suggestion", suggestionId: "wudu_virtue" })
    if (first.accepted) await first.done
    const turnId = assistant()[0].id
    useDevice.getState().set({ locale: "en", askConsent: true }) // the UI changed since
    mockFetch(async () => json(ANSWER))
    const again = useAsk.getState().retry(turnId)
    expect(again.accepted).toBe(true)
    if (again.accepted) await again.done
    expect(users()).toHaveLength(1)
    expect(assistant()).toHaveLength(1)
    expect(assistant()[0]).toMatchObject({ id: turnId, state: "done" })
    expect(askCalls()[0].body).toMatchObject({
      question: "ما فضل الوضوء؟",
      lang: "ar",
      consent_objectives: false,
      entrypoint: "suggestion",
      suggestion_id: "wudu_virtue",
    })
  })

  it("t17: a late reply of an older attempt never replaces the newer one", async () => {
    let lateResolve: (r: Response) => void = () => undefined
    mockFetch(() => new Promise<Response>((resolve) => (lateResolve = resolve))) // ignores abort, answers late
    const first = useAsk.getState().submitQuestion({ text: "ما معنى الشهادتين؟", lang: "ar", entrypoint: "typed" })
    useAsk.getState().cancel()
    if (first.accepted) await first.done
    const turnId = assistant()[0].id
    expect(assistant()[0]).toMatchObject({ state: "error", code: "cancelled" })
    expect(useAsk.getState().busy).toBe(false)

    const stale = lateResolve
    let newResolve: (r: Response) => void = () => undefined
    mockFetch(() => new Promise<Response>((resolve) => (newResolve = resolve)))
    const again = useAsk.getState().retry(turnId)
    stale(json({ ...ANSWER, ask_id: "OLD", answer: "OLD_ANSWER" }))
    await Promise.resolve()
    newResolve(json({ ...ANSWER, ask_id: "NEW", answer: "NEW_ANSWER" }))
    if (again.accepted) await again.done
    const t = assistant()[0]
    expect(t.state === "done" && t.response.ask_id).toBe("NEW")
  })

  it("only a retryable failure can be retried", async () => {
    mockFetch(async () => json({ ...ANSWER, outcome: "unavailable", reason_code: "service_limit", retryable: false }))
    const r = useAsk.getState().submitQuestion({ text: "ما معنى الشهادتين؟", lang: "ar", entrypoint: "typed" })
    if (r.accepted) await r.done
    expect(useAsk.getState().retry(assistant()[0].id).accepted).toBe(false)
  })

  it("t27: a refresh that hangs still ends within the attempt's deadline", async () => {
    vi.useFakeTimers()
    useAuth.getState().set({ token: "expired-token" })
    let releaseRefresh: (r: Response) => void = () => undefined
    mockFetch((url, init) => {
      if (url === "/api/auth/refresh") return new Promise<Response>((resolve) => (releaseRefresh = resolve))
      if (url === "/api/ask") return Promise.resolve(json({ detail: "expired" }, 401))
      return hanging(url, init)
    })
    const r = useAsk.getState().submitQuestion({ text: "ما معنى الشهادتين؟", lang: "ar", entrypoint: "typed" })
    await vi.advanceTimersByTimeAsync(ASK_CLIENT_DEADLINE_MS)
    if (r.accepted) await r.done
    expect(assistant()[0]).toMatchObject({ state: "error", code: "timeout" })
    expect(useAsk.getState().busy).toBe(false)
    // the shared refresh was not cancelled by this attempt: it still completes its own work
    releaseRefresh(json({ detail: "no session" }, 401))
    await vi.advanceTimersByTimeAsync(1)
    expect(useAuth.getState().token).toBeNull()
    expect(useAuth.getState().ready).toBe(true)
  })

  it("t27: the learning guide gives up after its own timeout and the app uses its fixed message", async () => {
    vi.useFakeTimers()
    mockFetch(hanging)
    const p = requestGuide({ lang: "ar", mastered: ["o1"], reviewing: [], next: null })
    await vi.advanceTimersByTimeAsync(10_000)
    await expect(p).resolves.toBeNull()
  })
})
