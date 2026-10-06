/**
 * PLT-15 R6: progress made offline is kept on the device and sent by itself
 * once the connection is back, once (a burst of online events sends one copy).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.fn(async (path: string, opts?: { body?: Record<string, unknown> }) =>
  path === "/api/me/learning" ? { completed: opts?.body?.completed ?? {}, unlockedUnits: [], mastery: {} } : { days: opts?.body?.days ?? [], badges: {} },
)
vi.mock("@/app/lib/api", async (orig) => ({ ...(await orig<typeof import("@/app/lib/api")>()), api }))

const { scheduleSync } = await import("./sync")
const { useAuth } = await import("@/app/stores/auth")
const { useLearning } = await import("@/app/stores/learning")

let online = true
beforeEach(() => {
  online = true
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online })
  api.mockClear()
  useAuth.setState({ token: "t" })
  useLearning.setState({ completed: {}, sessions: {}, mastery: {}, unlockedUnits: [] })
})
afterEach(() => vi.useRealTimers())

describe("plt-15-r6 what is done offline is sent once the connection is back", () => {
  it("plt15_r6_two_lessons_finished_offline_reach_the_account_once_on_reconnect", async () => {
    vi.useFakeTimers()
    online = false
    const done = { first: "2026-10-06T08:00:00Z", last: "2026-10-06T08:00:00Z", times: 1 }
    useLearning.setState({ completed: { "u01-l1": done, "u01-l2": done } })
    scheduleSync(10)
    await vi.advanceTimersByTimeAsync(20)
    expect(api).not.toHaveBeenCalled() // kept on the device

    online = true
    window.dispatchEvent(new Event("online"))
    window.dispatchEvent(new Event("online")) // a flapping connection
    await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(2))
    const learning = api.mock.calls.filter(([p]) => p === "/api/me/learning")
    expect(learning).toHaveLength(1)
    expect(Object.keys((learning[0][1] as { body: { completed: object } }).body.completed)).toEqual(["u01-l1", "u01-l2"])
  })
})
