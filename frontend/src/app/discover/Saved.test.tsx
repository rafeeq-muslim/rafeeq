/** KNW-09 saved answers on the Saved screen (R2 examples, R6). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"

import { translate } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import type { SourceCard } from "@/app/ask/types"
import Saved from "./Saved"
import { useSaved, type AnswerText } from "./savedStore"

const AYAH = "quranenc:english_saheeh:1:2"
// Dummy text only (never real scripture in tests). The saved copy has no verse words in it.
const ANSWER: AnswerText = { lang: "en", answer: "Praise belongs to God, as this verse says. {{q:" + AYAH + "}}", source_ids: [AYAH] }
const RECORD: SourceCard = {
  id: AYAH,
  source_id: "quranenc",
  source_name: "QuranEnc.com",
  kind: "quran_translation",
  lang: "en",
  ref: { sura: 1, aya: 2 },
  ref_key: "1:2",
  quote_text: "STORED MEANING FROM THE DATABASE",
  arabic_text: "نص عربي مخزن للاختبار",
  translation: "english_saheeh",
  grade: null,
  attribution: null,
  title: null,
  origin_url: "https://quranenc.com/en/browse/english_saheeh/1#2",
  version: "test-1",
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
let urls: string[] = []

function serve(records: SourceCard[]) {
  urls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url)
      if (url.startsWith("/api/discover/cards")) return json({ lang: "en", total: 0, cards: [], previous: null })
      if (url.startsWith("/api/scripture/passages")) return json({ cards: records })
      return json({ detail: "not found" }, 404)
    }),
  )
}

const show = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Saved />
      </MemoryRouter>
    </QueryClientProvider>,
  )

beforeEach(() => {
  localStorage.clear()
  useAuth.setState({ token: null })
  useDevice.setState({ locale: "en" })
  useSaved.setState({ items: [] })
  useSaved.getState().save("answer", "ask-1", new Date("2026-10-05T08:00:00Z"), ANSWER)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("knw-09-r2 a saved answer opens with its sources and date, not the question", () => {
  it("knw09_r2_saved_answer_shows_text_sources_and_date_without_the_question", async () => {
    serve([RECORD])
    show()
    const row = await screen.findByRole("button", { name: /Praise belongs to God/ })
    expect(row.textContent).toContain(translate("en", "discover.saved.answerOn", { d: "October 5, 2026" }))
    fireEvent.click(row)
    expect(await screen.findByText(/QuranEnc\.com/)).toBeTruthy() // the source strip
    expect(screen.queryByText(translate("en", "discover.saved.unavailable"))).toBeNull()
    // The question is never stored, so nothing on the screen can come from it.
    expect(localStorage.getItem("rafeeq.savedAnswers")).not.toMatch(/question/i)
  })

  it("knw09_r2_ayah_in_a_saved_answer_comes_from_the_stored_record_by_id", async () => {
    serve([RECORD])
    show()
    fireEvent.click(await screen.findByRole("button", { name: /Praise belongs to God/ }))
    expect(await screen.findByText("STORED MEANING FROM THE DATABASE")).toBeTruthy()
    expect(screen.getByText(/نص عربي مخزن للاختبار/)).toBeTruthy()
    expect(urls.some((u) => u === `/api/scripture/passages?ids=${encodeURIComponent(AYAH)}`)).toBe(true)
    expect(localStorage.getItem("rafeeq.savedAnswers")).not.toContain("STORED MEANING")
  })
})

describe("knw-09-r6 an answer whose source is no longer served is not shown", () => {
  it("knw09_r6_saved_answer_without_its_source_shows_no_longer_available_and_no_old_text", async () => {
    serve([])
    show()
    expect(await screen.findByText(translate("en", "discover.saved.unavailable"))).toBeTruthy()
    expect(screen.queryByText(/Praise belongs to God/)).toBeNull()
  })
})
