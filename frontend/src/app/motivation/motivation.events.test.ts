/** MOT-05 R2 (learned day queued offline, account-wide) and MOT-09 R4
 * (the random fifth flagged apart from offline card text). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.fn(async (..._args: unknown[]) => ({}) as unknown)
const sendEvent = vi.fn()
vi.mock("@/app/lib/api", () => ({ api: (...a: unknown[]) => api(...a), sendEvent: (e: unknown) => sendEvent(e) }))

const { reportLearnedToday } = await import("@/app/lib/push")
const { askWhy } = await import("@/app/lesson/why")
const { useAuth } = await import("@/app/stores/auth")

let online = true
Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online })

beforeEach(() => {
  api.mockClear()
  sendEvent.mockClear()
  online = true
  localStorage.clear()
})
afterEach(() => useAuth.setState({ token: null }))

describe("mot-05 r2 a learning day stops the reminder", () => {
  it("mot05_r2_learned_offline_is_sent_when_back_online", async () => {
    useAuth.setState({ token: "t" })
    online = false
    await reportLearnedToday("2026-10-10")
    expect(api).not.toHaveBeenCalled()
    online = true
    window.dispatchEvent(new Event("online"))
    await vi.waitFor(() => expect(api).toHaveBeenCalledWith("/api/push/learned", { method: "POST", body: { endpoint: null, day: "2026-10-10" } }))
    expect(localStorage.getItem("rafeeq.push.learnedDay")).toBeNull()
  })

  it("mot05_r2_signed_in_device_without_push_still_tells_the_account", async () => {
    useAuth.setState({ token: "t" })
    await reportLearnedToday("2026-10-11")
    expect(api).toHaveBeenCalledWith("/api/push/learned", { method: "POST", body: { endpoint: null, day: "2026-10-11" } })
  })

  it("mot05_r2_guest_without_push_sends_nothing", async () => {
    await reportLearnedToday("2026-10-11")
    expect(api).not.toHaveBeenCalled()
    expect(localStorage.getItem("rafeeq.push.learnedDay")).toBeNull()
  })
})

describe("mot-09 r4 the «لماذا؟» experiment", () => {
  const exercise = { id: "e1", objectives: ["o1"] } as never

  it("mot09_r4_random_fifth_is_flagged_as_the_holdout", async () => {
    const r = await askWhy("l1", exercise, "ar", "a", () => 0.1)
    expect(r).toEqual({ text: null, ai: false })
    expect(sendEvent).toHaveBeenCalledWith({ type: "why_shown", shown: "card_holdout", exercise_id: "e1", objective_id: "o1" })
    expect(api).not.toHaveBeenCalled()
  })

  it("mot09_r4_offline_card_text_is_not_the_holdout", async () => {
    online = false
    await askWhy("l1", exercise, "ar", "a", () => 0.9)
    expect(sendEvent).toHaveBeenCalledWith({ type: "why_shown", shown: "card_only", exercise_id: "e1", objective_id: "o1" })
  })

  it("mot09_r4_explanation_shown_is_the_other_group", async () => {
    api.mockResolvedValueOnce({ text: "شرح" })
    const r = await askWhy("l1", exercise, "ar", "a", () => 0.9)
    expect(r).toEqual({ text: "شرح", ai: true })
    expect(sendEvent).toHaveBeenCalledWith({ type: "why_shown", shown: "ai_explanation", exercise_id: "e1", objective_id: "o1" })
  })
})
