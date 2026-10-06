/**
 * Client-side examples of the rewritten companion documents (PR #21):
 * CMP-01 R1/R3, CMP-02 R5/R6, CMP-04 R3, CMP-06 R1–R5, and the danger case's
 * verified helplines (companion README, research/08). The server side is in
 * backend/tests/test_cmp0*.py and test_cmp_danger.py.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"

import { translate } from "@/app/i18n"
import { useAsk } from "@/app/ask/store"
import type { AskResponse } from "@/app/ask/types"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import Ask from "@/app/pages/Ask"
import { REASONS, REFERRAL_NOTICE } from "./api"
import HelpScreen, { awaitingText, composeHelpBody, questionOf } from "./HelpScreen"
import { learnerChatItem } from "./HelpThread"
import { Helplines } from "./Helplines"
import { HELPLINES, countryFromTimeZone } from "./helplines"
import { requesterName } from "./mentor/InboxThread"
import Notebook from "./Notebook"
import { NOTEBOOK_KEY, OfflineError, assistantHandOff, sendToMentor, useNotebook } from "./notebook"
import { useCompanion } from "./store"

const ar = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate("ar", k, v)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

type Call = { url: string; body: unknown }
let calls: Call[] = []

function stubFetch(handler: (url: string, body: unknown) => Response | Promise<Response> = () => json({ detail: "not found" }, 404)) {
  calls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ url, body })
      return handler(url, body)
    }),
  )
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { value, configurable: true })
}

const wrap = (ui: React.ReactNode, entries: Parameters<typeof MemoryRouter>[0]["initialEntries"] = ["/"]) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={entries}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn() // jsdom has none; chat screens scroll to the end
  useDevice.getState().set({ locale: "ar" })
  useAuth.getState().set({ token: null, me: null, ready: true })
  useCompanion.getState().set({ helpToken: null, helpGender: null })
  useNotebook.setState({ notes: [], introSeen: false })
  useAsk.getState().reset()
  setOnline(true)
  stubFetch()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

// --- Danger case: verified helplines, offline -------------------------------

const telLinks = (root: HTMLElement) => Array.from(root.querySelectorAll("a[href^='tel:']")).map((a) => a.getAttribute("href"))

describe("Danger case helplines (README fixed rule, research/08)", () => {
  it("cmp_danger_saudi_panel_lists_only_the_verified_numbers", () => {
    const { container } = wrap(<Helplines initialCountry="sa" />)
    expect(telLinks(container)).toEqual(["tel:911", "tel:999", "tel:997", "tel:998", "tel:1919", "tel:937"])
    expect(container.textContent).toContain("الشرطة")
    expect(container.textContent).toContain("الهلال الأحمر (الإسعاف)")
  })

  it("cmp_danger_philippines_panel_lists_911_and_1553", () => {
    const { container } = wrap(<Helplines initialCountry="ph" />)
    expect(telLinks(container)).toEqual(["tel:911", "tel:1553"])
  })

  it("cmp_danger_other_country_shows_no_number", () => {
    const { container } = wrap(<Helplines initialCountry="other" />)
    expect(telLinks(container)).toEqual([])
    expect(container.textContent).toContain("اتصل برقم الطوارئ في بلدك")
    expect(container.textContent).not.toMatch(/\d/)
  })

  it("cmp_danger_never_shows_an_unverified_number", () => {
    // sources.md helpline row: Saudi Arabia 911, 999, 997, 998, 1919, 937; Philippines 911, 1553.
    const all = [...HELPLINES.sa, ...HELPLINES.ph].map((l) => l.number)
    expect(new Set(all)).toEqual(new Set(["911", "999", "997", "998", "1919", "937", "1553"]))
    for (const unverified of ["920033360", "1348", "19911", "116111"]) expect(all).not.toContain(unverified)
  })

  it("cmp_danger_country_is_guessed_on_the_device_and_can_change", () => {
    expect(countryFromTimeZone("Asia/Riyadh")).toBe("sa")
    expect(countryFromTimeZone("Asia/Manila")).toBe("ph")
    expect(countryFromTimeZone("Europe/London")).toBe("other")
    const { container } = wrap(<Helplines initialCountry="other" />)
    fireEvent.click(screen.getByRole("radio", { name: "السعودية" }))
    expect(telLinks(container)).toContain("tel:1919")
  })

  it("cmp_danger_helplines_show_without_any_network_call", () => {
    stubFetch(() => {
      throw new TypeError("offline")
    })
    setOnline(false)
    const { container } = wrap(<Helplines initialCountry="sa" />)
    expect(telLinks(container)).toHaveLength(6)
    expect(calls).toEqual([])
  })
})

// --- CMP-01 -----------------------------------------------------------------

const doneTurn = (askId: string, question: string) =>
  ({
    id: "t1",
    role: "assistant",
    state: "done",
    response: { ask_id: askId } as AskResponse,
    snapshot: { question, lang: "ar", consent_objectives: false, entrypoint: "typed" },
  }) as const

const created = (gender: "m" | "f") =>
  json(
    {
      request: {
        id: "r1",
        kind: "escalation",
        topic: null,
        source: "ask",
        status: "open",
        created_at: "2026-10-06T10:00:00Z",
        last_activity_at: "2026-10-06T10:00:00Z",
        unread: 0,
        preview: null,
        responder_name: null,
        gender,
        awaiting_same_gender: false,
      },
      guest_token: "g".repeat(43),
    },
    201,
  )

describe("CMP-01 «أريد إنسانًا»", () => {
  it("cmp01_r1_assistant_question_is_found_on_the_device_only", () => {
    const turns = [doneTurn("a1", "هل تصح صلاتي؟")]
    expect(questionOf(turns as never, "a1")).toBe("هل تصح صلاتي؟")
    expect(questionOf(turns as never, "other")).toBeNull()
    expect(composeHelpBody("أريد أن أفهم", null, "سؤالي للمساعد:")).toBe("أريد أن أفهم")
    expect(composeHelpBody("أريد أن أفهم", "هل تصح صلاتي؟", "سؤالي للمساعد:")).toBe("سؤالي للمساعد:\nهل تصح صلاتي؟\n\nأريد أن أفهم")
  })

  it("cmp01_r1_question_is_not_attached_unless_chosen", async () => {
    useCompanion.getState().set({ helpGender: "m" })
    useAsk.setState({ turns: [doneTurn("a1", "سؤال خاص للمساعد") as never] })
    stubFetch((url) => (url === "/api/help/requests" ? created("m") : json({ detail: "x" }, 404)))
    wrap(<HelpScreen />, ["/mentor/help?kind=escalation&from=ask&ask=a1"])
    const box = screen.getByRole("checkbox", { name: ar("cmp.help.attach") })
    expect(box.getAttribute("aria-checked")).toBe("false")
    expect(screen.queryByText("سؤال خاص للمساعد")).toBeNull()
    fireEvent.change(screen.getByLabelText(ar("cmp.help.message")), { target: { value: "أحتاج من يفهمني" } })
    fireEvent.click(screen.getByRole("button", { name: ar("human.send") }))
    await waitFor(() => expect(calls.some((c) => c.url === "/api/help/requests")).toBe(true))
    const sent = calls.find((c) => c.url === "/api/help/requests")!.body as Record<string, unknown>
    expect(sent.body).toBe("أحتاج من يفهمني")
    expect(JSON.stringify(sent)).not.toContain("سؤال خاص للمساعد")
    expect(sent.source).toBe("ask")
  })

  it("cmp01_r1_question_travels_when_chosen", async () => {
    useCompanion.getState().set({ helpGender: "m" })
    useAsk.setState({ turns: [doneTurn("a1", "سؤال خاص للمساعد") as never] })
    stubFetch((url) => (url === "/api/help/requests" ? created("m") : json({ detail: "x" }, 404)))
    wrap(<HelpScreen />, ["/mentor/help?kind=escalation&from=ask&ask=a1"])
    fireEvent.click(screen.getByRole("checkbox", { name: ar("cmp.help.attach") }))
    fireEvent.click(screen.getByRole("button", { name: ar("human.send") }))
    await waitFor(() => expect(calls.some((c) => c.url === "/api/help/requests")).toBe(true))
    const sent = calls.find((c) => c.url === "/api/help/requests")!.body as Record<string, unknown>
    expect(sent.body).toContain("سؤال خاص للمساعد")
  })

  it("cmp01_r3_guest_is_asked_brother_or_sister_once", async () => {
    stubFetch((url) => (url === "/api/help/requests" ? created("f") : json([], 200)))
    const first = wrap(<HelpScreen />, ["/mentor/help?from=home"])
    const fieldset = document.querySelector("[data-slot=ask-gender]") as HTMLElement
    expect(fieldset.textContent).toContain("أخ أم أخت؟")
    fireEvent.click(within(fieldset).getByRole("radio", { name: ar("cmp.help.sister") }))
    fireEvent.change(screen.getByLabelText(ar("cmp.help.message")), { target: { value: "أحتاج أختًا تسمعني" } })
    fireEvent.click(screen.getByRole("button", { name: ar("human.send") }))
    await waitFor(() => expect(useCompanion.getState().helpGender).toBe("f"))
    expect((calls.find((c) => c.url === "/api/help/requests")!.body as Record<string, unknown>).gender).toBe("f")
    first.unmount()
    // the next request: not asked again
    wrap(<HelpScreen />, ["/mentor/help?from=home"])
    expect(document.querySelector("[data-slot=ask-gender]")).toBeNull()
    expect(screen.getByText(ar("cmp.help.replyBySister"))).toBeTruthy()
  })

  it("cmp01_r3_cannot_send_before_answering", () => {
    wrap(<HelpScreen />, ["/mentor/help?from=home"])
    fireEvent.change(screen.getByLabelText(ar("cmp.help.message")), { target: { value: "مرحبا" } })
    fireEvent.click(screen.getByRole("button", { name: ar("human.send") }))
    expect(screen.getByText(ar("cmp.err.gender"))).toBeTruthy()
    expect(calls.filter((c) => c.url === "/api/help/requests")).toEqual([])
  })

  it("cmp01_r3_no_sister_free_says_a_sister_will_reply", () => {
    const t = (k: Parameters<typeof translate>[1]) => translate("ar", k)
    expect(awaitingText(t, "f")).toContain("سترد عليك أخت حين تتاح")
    expect(awaitingText(t, "m")).toContain("سيرد عليك أخ حين يتاح")
  })

  it("cmp01_r5_contact_refusal_says_the_reply_arrives_here", () => {
    expect(ar("cmp.err.contact")).toContain("سيصلك الرد في هذه المحادثة")
  })

})

// --- CMP-02 -----------------------------------------------------------------

describe("CMP-02 mentor inbox", () => {
  it("cmp02_r6_guest_shows_as_zaira_with_a_short_number_to_a_sister", () => {
    const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate("ar", k, v)
    expect(requesterName(t, { is_guest: true, handle: "4821", kind: "human" }, "f")).toBe("زائرة 4821")
    expect(requesterName(t, { is_guest: true, handle: "4821", kind: "human" }, "m")).toBe("زائر 4821")
    expect(requesterName(t, { is_guest: true, handle: "4821", kind: "urgent" }, "f")).toBe("زائر 4821")
    expect(requesterName(t, { is_guest: false, handle: "نخلة الهادئ", kind: "human" }, "f")).toBe("نخلة الهادئ")
  })

  it("cmp02_r5_learner_knows_scholars_will_answer_and_sees_their_answer_unsigned_by_name", () => {
    const t = (k: Parameters<typeof translate>[1]) => translate("ar", k)
    const notice = learnerChatItem({ id: "s", author: "system", name: null, body: REFERRAL_NOTICE, created_at: "2026-10-06T10:00:00Z" }, t, () => {})
    expect(notice.body).toBe("أُحيل سؤالك إلى أهل العلم، وسيجيبونك هنا.")
    const answer = learnerChatItem({ id: "a", author: "scholar", name: null, body: "نعم، صحيحة.", created_at: "2026-10-06T11:00:00Z" }, t, () => {})
    expect(answer.name).toBe("أهل العلم")
    expect(answer.actions?.length).toBe(1) // it can be reported like any reply
  })
})

// --- CMP-04 -----------------------------------------------------------------

describe("CMP-04 report", () => {
  it("cmp04_r3_danger_to_someone_is_a_report_reason", () => {
    expect(REASONS).toContain("danger")
    expect(ar("cmp.reason.danger")).toBe("خطر على أحد")
  })
})

// --- CMP-06 -----------------------------------------------------------------

describe("CMP-06 private questions notebook", () => {
  it("cmp06_r1_saved_on_this_device_without_any_request", () => {
    wrap(<Notebook />, ["/mentor/notebook"])
    fireEvent.change(screen.getByLabelText(ar("cmp.notebook.label")), { target: { value: "لماذا نصلي بالعربية؟" } })
    fireEvent.click(screen.getByRole("button", { name: ar("cmp.notebook.save") }))
    expect(screen.getByText("لماذا نصلي بالعربية؟")).toBeTruthy()
    expect(localStorage.getItem(NOTEBOOK_KEY)).toContain("لماذا نصلي بالعربية؟")
    expect(calls).toEqual([]) // nothing uploaded, and so nothing a mentor could see
  })

  it("cmp06_r1_first_use_says_it_does_not_move_between_devices", () => {
    wrap(<Notebook />, ["/mentor/notebook"])
    const intro = document.querySelector("[data-slot=notebook-intro]")!
    expect(intro.textContent).toContain("لا ينتقل إلى جهاز آخر")
    fireEvent.click(screen.getByRole("button", { name: ar("cmp.notebook.introOk") }))
    expect(document.querySelector("[data-slot=notebook-intro]")).toBeNull()
    expect(useNotebook.getState().introSeen).toBe(true)
  })

  it("cmp06_r2_only_the_chosen_question_reaches_the_mentor", async () => {
    const notes = ["q1", "q2", "q3", "q4", "q5"].map((q) => useNotebook.getState().add(q)!)
    stubFetch((url) => {
      if (url === "/api/mentors/mine/thread") return json({ id: "t1" })
      if (url === "/api/help/requests/t1/messages") return json({}, 201)
      return json({ detail: "x" }, 404)
    })
    await sendToMentor(notes[2])
    const posted = calls.filter((c) => c.url === "/api/help/requests/t1/messages").map((c) => c.body)
    expect(posted).toEqual([{ body: "q3" }])
    expect(useNotebook.getState().notes.filter((n) => n.sentTo).map((n) => n.text)).toEqual(["q3"])
  })

  it("cmp06_r2_offline_question_stays_and_is_marked_not_sent", async () => {
    const note = useNotebook.getState().add("سؤال لمرشدي")!
    setOnline(false)
    await expect(sendToMentor(note)).rejects.toBeInstanceOf(OfflineError)
    expect(() => assistantHandOff(note)).toThrow(OfflineError)
    expect(calls).toEqual([])
    expect(useNotebook.getState().notes).toEqual([note])
  })

  it("cmp06_r2_question_to_the_assistant_is_an_ordinary_question", async () => {
    const note = useNotebook.getState().add("لماذا نصلي بالعربية؟")!
    const { state } = assistantHandOff(note)
    const asked: Record<string, unknown>[] = []
    stubFetch((url, body) => {
      if (url === "/api/ask") {
        asked.push(body as Record<string, unknown>)
        return json({ ask_id: "a9", outcome: "answered", answer: "x", sources: [], notes: [], route: "general", level: "A", should_escalate: false, handoff: null, objective_id: null, lang: "ar" })
      }
      return json({ detail: "x" }, 404)
    })
    wrap(<Ask />, [{ pathname: "/ask", state }])
    await waitFor(() => expect(asked).toHaveLength(1))
    expect(asked[0].question).toBe("لماذا نصلي بالعربية؟")
    expect(asked[0].entrypoint).toBe("typed")
  })

  it("cmp06_r3_no_code_outside_the_notebook_screen_reads_it", () => {
    const sources = import.meta.glob(["/src/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}"], { query: "?raw", import: "default", eager: true }) as Record<string, string>
    const readers = Object.entries(sources)
      .filter(([, code]) => /from "(\.\/|@\/app\/companion\/)notebook"|useNotebook|rafeeq\.notebook/.test(code))
      .map(([path]) => path)
      .sort()
    expect(readers).toEqual(["/src/app/companion/Notebook.tsx", "/src/app/companion/notebook.ts"])
  })

  it("cmp06_r4_delete_one_or_all_and_cleared_site_data_leaves_nothing", () => {
    const a = useNotebook.getState().add("أ")!
    useNotebook.getState().add("ب")
    useNotebook.getState().remove(a.id)
    expect(useNotebook.getState().notes.map((n) => n.text)).toEqual(["ب"])
    useNotebook.getState().clear()
    expect(useNotebook.getState().notes).toEqual([])
    useNotebook.getState().add("ج")
    expect(localStorage.getItem(NOTEBOOK_KEY)).toContain("ج")
    localStorage.clear() // the browser's "clear site data"
    expect(localStorage.getItem(NOTEBOOK_KEY)).toBeNull()
  })

  it("cmp06_r5_reassures_in_one_line_and_offers_a_human", () => {
    wrap(<Notebook />, ["/mentor/notebook"])
    expect(document.querySelector("[data-slot=notebook-reassure]")!.textContent).toBe("لا يوجد سؤال صغير أو بسيط. اكتب ما يخطر لك")
    expect(screen.getByRole("button", { name: "أريد إنسانًا" })).toBeTruthy()
  })
})
