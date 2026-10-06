/**
 * KNW-01 R7 (docs/domains/knowledge/features/KNW-01-sourced-answer.md): the
 * Ask conversation stays for the whole visit. A reload (an app update, a
 * manual refresh) does not empty it; it never goes to local storage or the
 * server; quick exit, erase-this-device and sign-out still clear it; with
 * quick exit or discreet mode on, nothing is written to the device at all.
 *
 * A reload is simulated by loading the modules afresh over the same
 * sessionStorage and localStorage, which is what the browser does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
const Q1 = "TEST_QUESTION_ONE"
const Q2 = "TEST_QUESTION_TWO"
const THREAD_KEY = "rafeeq.ask.thread"

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const hanging = (_url: string, init?: RequestInit) =>
  new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
  })

let askBodies: Record<string, unknown>[] = []
function stubFetch(reply: (url: string, init?: RequestInit) => Promise<Response> = async () => json({})) {
  askBodies = []
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (url !== "/api/ask") return Promise.resolve(new Response(null, { status: 204 }))
      const body = JSON.parse(String(init?.body))
      askBodies.push(body)
      if (reply === hanging) return hanging(url, init)
      return Promise.resolve(json({ ...ANSWER, ask_id: `a${askBodies.length}`, answer: `ANSWER_TO ${body.question}` }))
    }),
  )
}

/** The page as it is after a (re)load: fresh modules over the same browser storage. */
async function load() {
  vi.resetModules()
  const { useAsk, conversationHoldsUpdate } = await import("./store")
  const { useDevice } = await import("@/app/stores/device")
  const pwa = await import("@/app/lib/pwa")
  const privacy = await import("@/app/lib/privacy")
  return { useAsk, useDevice, pwa, privacy, conversationHoldsUpdate }
}
type Page = Awaited<ReturnType<typeof load>>

async function ask(page: Page, text: string) {
  const r = page.useAsk.getState().submitQuestion({ text, lang: "ar", entrypoint: "typed" })
  if (!r.accepted) throw new Error(`not accepted: ${r.reason}`)
  await r.done
}
const shown = (page: Page) =>
  page.useAsk.getState().turns.map((t: Turn) => (t.role === "user" ? `Q:${t.text}` : t.state === "done" ? `A:${t.response.answer}` : `${t.state}`))
const BOTH = [`Q:${Q1}`, `A:ANSWER_TO ${Q1}`, `Q:${Q2}`, `A:ANSWER_TO ${Q2}`]

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  stubFetch()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("knw-01 r7: the conversation stays for the whole visit", () => {
  it("knw01_r7_a_reload_keeps_the_questions_and_answers_in_order", async () => {
    const before = await load()
    await ask(before, Q1)
    await ask(before, Q2)
    expect(shown(before)).toEqual(BOTH)

    const after = await load() // app update, manual refresh, or the phone dropped the tab
    expect(shown(after)).toEqual(BOTH)
    expect(after.useAsk.getState().busy).toBe(false)
  })

  it("knw01_r7_a_reload_keeps_the_typed_draft (PLT-15 R5)", async () => {
    const before = await load()
    before.useAsk.getState().setDraft("TEST_DRAFT_TEXT")
    const after = await load()
    expect(after.useAsk.getState().draft).toBe("TEST_DRAFT_TEXT")
    after.useAsk.getState().setDraft("")
    expect((await load()).useAsk.getState().draft).toBe("")
  })

  it("knw01_r7_an_answer_cut_by_a_reload_becomes_a_retry_in_the_same_message", async () => {
    const before = await load()
    await ask(before, Q1)
    stubFetch(hanging)
    const pending = before.useAsk.getState().submitQuestion({ text: Q2, lang: "ar", entrypoint: "typed" })
    expect(pending.accepted).toBe(true)

    const after = await load()
    expect(shown(after)).toEqual([`Q:${Q1}`, `A:ANSWER_TO ${Q1}`, `Q:${Q2}`, "error"]) // never a pending bubble forever
    const cut = after.useAsk.getState().turns[3]
    expect(cut).toMatchObject({ state: "error", code: "cancelled" })

    stubFetch()
    const retry = after.useAsk.getState().retry(cut.id)
    if (!retry.accepted) throw new Error("retry refused")
    await retry.done
    expect(askBodies).toHaveLength(1)
    expect(askBodies[0].question).toBe(Q2)
    expect(shown(after)).toEqual([`Q:${Q1}`, `A:ANSWER_TO ${Q1}`, `Q:${Q2}`, `A:ANSWER_TO ${Q2}`])
  })

  it("knw01_r7_a_learning_guide_reply_not_yet_written_is_not_left_pending_after_a_reload", async () => {
    const turns: Turn[] = [
      { id: "u1", role: "user", text: Q1 },
      {
        id: "t1",
        role: "assistant",
        state: "done",
        response: { ...ANSWER, outcome: "learning_guide", answer: "" },
        snapshot: { question: Q1, lang: "ar", consent_objectives: false, entrypoint: "typed" },
      },
    ]
    sessionStorage.setItem(THREAD_KEY, JSON.stringify({ v: 1, at: Date.now(), data: turns }))
    const page = await load()
    expect(page.useAsk.getState().turns[1]).toMatchObject({ id: "t1", state: "error", code: "cancelled" })
  })

  it("knw01_r7_a_failed_answer_and_its_retry_leave_the_earlier_messages", async () => {
    const page = await load()
    await ask(page, Q1)
    vi.stubGlobal("fetch", vi.fn(async () => json({ detail: "down" }, 500)))
    await ask(page, Q2)
    expect(shown(page)).toEqual([`Q:${Q1}`, `A:ANSWER_TO ${Q1}`, `Q:${Q2}`, "error"])
    stubFetch()
    const retry = page.useAsk.getState().retry(page.useAsk.getState().turns[3].id)
    if (!retry.accepted) throw new Error("retry refused")
    await retry.done
    expect(shown(page)).toEqual(BOTH)
    expect(shown(await load())).toEqual(BOTH)
  })

  it("knw01_r7_a_second_question_sent_before_the_first_answer_removes_nothing", async () => {
    const page = await load()
    await ask(page, Q1)
    stubFetch(hanging)
    const first = page.useAsk.getState().submitQuestion({ text: Q2, lang: "ar", entrypoint: "typed" })
    const second = page.useAsk.getState().submitQuestion({ text: "TEST_QUESTION_THREE", lang: "ar", entrypoint: "typed" })
    expect(first.accepted).toBe(true)
    expect(second).toEqual({ accepted: false, reason: "busy" })
    expect(askBodies).toHaveLength(1)
    expect(shown(page)).toEqual([`Q:${Q1}`, `A:ANSWER_TO ${Q1}`, `Q:${Q2}`, "pending"])
    page.useAsk.getState().cancel()
  })
})

describe("knw-01 r7: this visit only, on this device only", () => {
  it("knw01_r7_question_text_never_goes_to_local_storage_and_the_request_carries_no_history", async () => {
    const page = await load()
    await ask(page, Q1)
    await ask(page, Q2)
    const local = Object.keys(localStorage).map((k) => localStorage.getItem(k) ?? "").join("\n")
    expect(local).not.toContain(Q1)
    expect(local).not.toContain("ANSWER_TO")
    expect(Object.keys(askBodies[1]).sort()).toEqual(["client_request_id", "consent_objectives", "entrypoint", "lang", "question"])
    expect(JSON.stringify(askBodies[1])).not.toContain(Q1)
  })

  it("knw01_r7_a_copy_idle_for_a_day_is_dropped (a browser restoring yesterday's tabs)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-06T10:00:00Z"))
    const before = await load()
    await ask(before, Q1)
    vi.setSystemTime(new Date("2026-10-07T09:59:00Z"))
    expect(shown(await load())).toHaveLength(2)
    vi.setSystemTime(new Date("2026-10-07T10:00:01Z"))
    expect(shown(await load())).toEqual([])
    expect(sessionStorage.getItem(THREAD_KEY)).toBeNull()
  })

  it("knw01_r7_an_unknown_or_broken_stored_format_opens_an_empty_chat_without_an_error", async () => {
    const turns = [{ id: "u1", role: "user", text: Q1 }]
    sessionStorage.setItem(THREAD_KEY, JSON.stringify({ v: 1, at: Date.now(), data: turns }))
    expect(shown(await load())).toEqual([`Q:${Q1}`]) // the current version reads its own format
    sessionStorage.setItem(THREAD_KEY, JSON.stringify({ v: 999, at: Date.now(), data: turns }))
    expect(shown(await load())).toEqual([])
    sessionStorage.setItem(THREAD_KEY, "{not json")
    expect(shown(await load())).toEqual([])
    const mixed = [{ id: "u1", role: "user", text: Q1 }, { role: "assistant" }, null, { id: "x", role: "assistant", state: "done" }]
    sessionStorage.setItem(THREAD_KEY, JSON.stringify({ v: 1, at: Date.now(), data: mixed }))
    expect(shown(await load())).toEqual([`Q:${Q1}`])
  })

  it("knw01_r7_when_storage_is_full_the_page_keeps_every_message_and_the_copy_keeps_the_latest", async () => {
    const page = await load()
    await ask(page, Q1)
    const setItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === THREAD_KEY && v.includes(Q1)) throw new DOMException("full", "QuotaExceededError")
      setItem.call(this, k, v)
    })
    await ask(page, Q2)
    expect(shown(page)).toEqual(BOTH)
    vi.restoreAllMocks()
    expect(shown(await load())).toEqual(BOTH.slice(2))
  })
})

describe("knw-01 r7: what still clears the conversation (PLT-05)", () => {
  for (const mode of ["discreet", "quickExit"] as const) {
    it(`knw01_r7_with_${mode}_on_nothing_is_written_to_the_device`, async () => {
      const page = await load()
      page.useDevice.getState().set({ [mode]: true })
      await ask(page, Q1)
      page.useAsk.getState().setDraft("TEST_DRAFT_TEXT")
      expect(shown(page)).toHaveLength(2) // still on the screen
      expect(sessionStorage.length).toBe(0)
      expect(shown(await load())).toEqual([])
    })
  }

  it("knw01_r7_turning_discreet_mode_on_removes_the_copy_at_once_and_keeps_the_screen", async () => {
    const page = await load()
    await ask(page, Q1)
    expect(sessionStorage.getItem(THREAD_KEY)).toContain(Q1)
    page.useDevice.getState().set({ discreet: true })
    expect(sessionStorage.length).toBe(0)
    expect(shown(page)).toHaveLength(2)
    page.useDevice.getState().set({ discreet: false })
    expect(sessionStorage.getItem(THREAD_KEY)).toContain(Q1)
  })

  it("plt05_r2_quick_exit_clears_the_conversation_kept_for_the_visit", async () => {
    const page = await load()
    await ask(page, Q1)
    page.useAsk.getState().setDraft("TEST_DRAFT_TEXT")
    const go = vi.fn()
    page.privacy.exitNow(go)
    expect(go).toHaveBeenCalledWith(page.privacy.EXIT_URL)
    expect(sessionStorage.length).toBe(0)
    const back = await load() // «رجوع» from the weather page
    expect(shown(back)).toEqual([])
    expect(back.useAsk.getState().draft).toBe("")
  })

  it("plt05_r4_r7_erase_this_device_and_sign_out_clear_the_conversation", async () => {
    for (const leave of ["wipeDevice", "signOutAndErase"] as const) {
      const page = await load()
      await ask(page, Q1)
      expect(sessionStorage.getItem(THREAD_KEY)).toContain(Q1)
      const go = vi.fn()
      await page.privacy[leave](go)
      expect(go).toHaveBeenCalledOnce()
      expect(sessionStorage.length).toBe(0)
      expect(shown(await load())).toEqual([])
    }
  })
})

describe("knw-01 r7: an app update does not reload the page under a conversation", () => {
  it("knw01_r7_the_update_waits_on_the_ask_screen_while_a_conversation_or_a_draft_is_open", async () => {
    const page = await load()
    expect(page.pwa.updateMustWait("/ask")).toBe(false) // an empty chat reloads quietly, as before
    page.useAsk.getState().setDraft("TEST_DRAFT_TEXT")
    expect(page.pwa.updateMustWait("/ask")).toBe(true)
    page.useAsk.getState().setDraft("")
    await ask(page, Q1)
    expect(page.pwa.updateMustWait("/ask")).toBe(true)
    // Away from Ask the reload is safe: the visit's copy brings the conversation back.
    expect(page.pwa.updateMustWait("/")).toBe(false)
    expect(page.pwa.updateMustWait("/learn/lesson/u01-l1")).toBe(true) // LRN-03 R5 unchanged
  })

  it("knw01_r7_the_update_waits_everywhere_while_an_answer_is_on_its_way", async () => {
    const page = await load()
    stubFetch(hanging)
    page.useAsk.getState().submitQuestion({ text: Q1, lang: "ar", entrypoint: "typed" })
    expect(page.pwa.updateMustWait("/")).toBe(true)
    page.useAsk.getState().cancel()
  })

  it("knw01_r7_with_discreet_mode_on_the_update_waits_everywhere_because_a_reload_would_empty_the_chat", async () => {
    const page = await load()
    page.useDevice.getState().set({ discreet: true })
    expect(page.pwa.updateMustWait("/")).toBe(false)
    await ask(page, Q1)
    expect(page.pwa.updateMustWait("/")).toBe(true)
    expect(page.pwa.updateMustWait("/me")).toBe(true)
  })
})
