/**
 * PRD-LIVE-SOURCE-PRIORITY-AND-FALLBACK v3 in the app: only the sources
 * actually used are shown (A04), the live-search line comes only from the
 * attempt's real events (A06, A07, A13, §10), a live record says when it was
 * read and links to its page, a saved live answer keeps its link, identity
 * and read time without the source text (A20, step 6), and a late reply
 * never replaces a newer attempt (A24). Server side:
 * backend/tests/test_knw_live_source_access.py.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"

import { translate } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { useAuth } from "@/app/stores/auth"
import { liveSourceCard, resolveAnswer } from "@/app/discover/resolve"
import { savedAnswer, useSaved } from "@/app/discover/savedStore"
import { liveSummary } from "./answer"
import { LiveSearchNote, ResponseTurn } from "./parts"
import { useAsk } from "./store"
import type { AskResponse, SourceCard, Turn } from "./types"

const LIVE: SourceCard = {
  id: "live:binbaz:ar:3772:c1",
  source_id: "binbaz",
  source_name: "موقع الشيخ ابن باز",
  kind: "fatwa",
  lang: "ar",
  ref: { title: "TEST_TITLE", external_id: "3772" },
  ref_key: "3772",
  quote_text: "TEST_FETCHED_TEXT",
  arabic_text: null,
  translation: null,
  grade: null,
  attribution: "TEST_AUTHOR",
  title: "TEST_TITLE",
  origin_url: "https://binbaz.org.sa/fatwas/3772/test-slug",
  version: "live:2026-10-06T19:00:00Z",
  live: true,
  retrieved_at: "2026-10-06T19:00:00Z",
}

const RESPONSE: AskResponse = {
  ask_id: "a1",
  outcome: "answered",
  reason_code: null,
  retryable: false,
  route: "general",
  level: "B",
  answer: "TEST_WORDING {{q:live:binbaz:ar:3772:c1}}",
  sources: [LIVE],
  notes: [],
  should_escalate: false,
  handoff: null,
  objective_id: null,
  lang: "ar",
  source_policy: "live-enabled-sources-any-sufficient-v3",
  used_source_ids: ["binbaz"],
  live_search: [
    { source_id: "islamqa", attempted: true, status: "ok" },
    { source_id: "binbaz", attempted: true, status: "ok" },
    { source_id: "islamic_content", attempted: true, status: "unavailable" },
  ],
}

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string>) => translate("ar", key, vars)
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
const renderTurn = (r: AskResponse) =>
  render(
    <MemoryRouter>
      <ResponseTurn response={r} />
    </MemoryRouter>,
  )

beforeEach(() => {
  localStorage.clear()
  useDevice.getState().set({ locale: "ar", askConsent: false })
  useAuth.getState().set({ token: null })
  useSaved.setState({ items: [] })
  useAsk.getState().reset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("knw-live A04/A06 only used sources, honest search line", () => {
  it("knw_live_a04_shows_only_the_cited_source_card", () => {
    renderTurn(RESPONSE)
    expect(screen.getAllByText(/TEST_FETCHED_TEXT/)).toHaveLength(1)
    // islamqa was read but not used: no card, no link to it
    expect(document.querySelector('a[href*="islamqa.info"]')).toBeNull()
    expect(document.querySelector('a[href="https://binbaz.org.sa/fatwas/3772/test-slug"]')).not.toBeNull()
  })

  it("knw_live_a06_search_line_names_read_and_unreachable_sources_from_events", () => {
    renderTurn(RESPONSE)
    const note = screen.getByTestId("live-search-note")
    expect(note.textContent).toContain(t("ask.live.searched", { names: "الإسلام سؤال وجواب، binbaz.org.sa" }))
    expect(note.textContent).toContain(t("ask.live.unreachable", { names: "موسوعة المحتوى الإسلامي" }))
  })

  it("knw_live_a13_a_source_not_called_is_not_mentioned", () => {
    const s = liveSummary([
      { source_id: "islamqa", attempted: true, status: "no_results" },
      { source_id: "binbaz", attempted: false, status: "unsupported_language" },
      { source_id: "islamic_content", attempted: false, status: "unavailable" },
    ])
    expect(s).toEqual({ searched: ["islamqa"], unreachable: [] })
  })

  it("knw_live_a19_no_line_without_live_events", () => {
    render(<LiveSearchNote entries={undefined} />)
    expect(screen.queryByTestId("live-search-note")).toBeNull()
    render(<LiveSearchNote entries={[]} />)
    expect(screen.queryByTestId("live-search-note")).toBeNull()
  })

  it("knw_live_a07_unavailable_outcome_keeps_the_honest_line", () => {
    renderTurn({
      ...RESPONSE,
      outcome: "unavailable",
      reason_code: "temporarily_unavailable",
      retryable: true,
      answer: "",
      sources: [],
      live_search: RESPONSE.live_search!.map((e) => ({ ...e, status: "unavailable" })),
    })
    expect(screen.getByTestId("live-search-note").textContent).not.toContain(t("ask.live.searched", { names: "" }).trim())
  })

  it("knw_live_live_card_says_when_it_was_read_and_links_to_its_page", () => {
    renderTurn(RESPONSE)
    expect(screen.getByText(new RegExp(t("ask.live.fetchedAt", { d: "" }).trim()))).toBeTruthy()
    expect(screen.getByRole("link", { name: t("ask.live.openSource") }).getAttribute("href")).toBe(LIVE.origin_url)
  })
})

describe("knw-live A20 saved live answers (PRD step 6)", () => {
  it("knw_live_a20_saved_live_answer_keeps_link_identity_and_time_not_text", () => {
    const live_sources = [{ id: LIVE.id, source_id: "binbaz", title: "TEST_TITLE", origin_url: LIVE.origin_url, retrieved_at: LIVE.retrieved_at! }]
    useSaved.getState().save("answer", "a1", new Date("2026-10-06T19:01:00Z"), {
      lang: "ar",
      answer: RESPONSE.answer,
      source_ids: [LIVE.id],
      live_sources,
    })
    const text = savedAnswer("a1")!
    expect(text.live_sources).toEqual(live_sources)
    expect(localStorage.getItem("rafeeq.savedAnswers")).not.toContain("TEST_FETCHED_TEXT")
    const view = resolveAnswer(text, new Map(), liveSourceCard)!
    expect(view.sources[0]).toMatchObject({ id: LIVE.id, origin_url: LIVE.origin_url, retrieved_at: LIVE.retrieved_at, live: true, quote_text: "" })
  })

  it("knw_live_a20_a_live_ref_to_another_site_or_not_among_sources_is_dropped", () => {
    useSaved.getState().save("answer", "a2", new Date(), {
      lang: "ar",
      answer: "x",
      source_ids: [LIVE.id],
      live_sources: [
        { id: "live:binbaz:ar:9:c1", source_id: "binbaz", title: "", origin_url: LIVE.origin_url, retrieved_at: "2026-10-06T19:00:00Z" },
        { id: LIVE.id, source_id: "binbaz", title: "", origin_url: "http://evil.example/x", retrieved_at: "2026-10-06T19:00:00Z" },
      ],
    })
    expect(savedAnswer("a2")?.live_sources).toBeUndefined()
    expect(resolveAnswer(savedAnswer("a2"), new Map(), liveSourceCard)).toBeUndefined() // never shown half-sourced
  })

  it("knw_live_a20_older_saved_answers_are_unchanged", () => {
    useSaved.getState().save("answer", "a3", new Date(), { lang: "en", answer: "x", source_ids: ["hadeethenc:en:1"] })
    expect(savedAnswer("a3")).toEqual({ lang: "en", answer: "x", source_ids: ["hadeethenc:en:1"] })
  })
})

describe("knw-live A24 a late reply never replaces a newer attempt", () => {
  it("knw_live_a24_old_reply_after_new_attempt_is_dropped_and_lock_kept", async () => {
    let lateResolve: (r: Response) => void = () => undefined
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => (lateResolve = resolve))))
    const first = useAsk.getState().submitQuestion({ text: "هل النوم ينقض الوضوء؟", lang: "ar", entrypoint: "typed" })
    useAsk.getState().cancel()
    if (first.accepted) await first.done
    const turnId = (useAsk.getState().turns.find((x) => x.role === "assistant") as Turn).id
    const stale = lateResolve
    let newResolve: (r: Response) => void = () => undefined
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => (newResolve = resolve))))
    const again = useAsk.getState().retry(turnId)
    stale(json({ ...RESPONSE, ask_id: "OLD" }))
    await Promise.resolve()
    expect(useAsk.getState().busy).toBe(true) // the old reply does not free the newer attempt's lock
    newResolve(json({ ...RESPONSE, ask_id: "NEW" }))
    if (again.accepted) await again.done
    const turn = useAsk.getState().turns.find((x) => x.id === turnId)
    expect(turn && turn.role === "assistant" && turn.state === "done" && turn.response.ask_id).toBe("NEW")
    expect(useAsk.getState().busy).toBe(false)
  })
})
