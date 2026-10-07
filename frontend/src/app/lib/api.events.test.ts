/**
 * Security review 2026-10-07 (A-H5): the server takes at most 100 anonymous
 * events in one request, so a long offline queue is sent in batches of 100
 * and a refusal keeps the rest. Server side: backend/tests/test_sec_a_h5_events.py.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useDevice } from "@/app/stores/device"
import { EVENT_BATCH, flushEvents } from "./api"

const QUEUE = "rafeeq.eventQueue"
let sizes: number[] = []

function stubFetch(statusOf: (call: number) => number) {
  sizes = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      sizes.push((JSON.parse(String(init.body)) as { events: unknown[] }).events.length)
      return new Response("{}", { status: statusOf(sizes.length) })
    }),
  )
}

function queued(): { seq: number }[] {
  return JSON.parse(localStorage.getItem(QUEUE) ?? "[]")
}

beforeEach(() => {
  useDevice.setState({ shareEvents: true })
  localStorage.setItem(QUEUE, JSON.stringify(Array.from({ length: 250 }, (_, i) => ({ type: "first_answer", seq: i + 1 }))))
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.removeItem(QUEUE)
})

describe("A-H5: the event queue goes in batches of 100", () => {
  it("sec_a_h5_a_long_queue_is_sent_100_at_a_time", async () => {
    stubFetch(() => 202)
    await flushEvents()
    expect(EVENT_BATCH).toBe(100)
    expect(sizes).toEqual([100, 100, 50])
    expect(queued()).toEqual([])
  })

  it("sec_a_h5_a_refused_batch_keeps_the_rest_in_order", async () => {
    stubFetch((call) => (call === 1 ? 202 : 429))
    await flushEvents()
    expect(sizes).toEqual([100, 100])
    expect(queued()).toHaveLength(150)
    expect(queued()[0].seq).toBe(101)
  })
})
