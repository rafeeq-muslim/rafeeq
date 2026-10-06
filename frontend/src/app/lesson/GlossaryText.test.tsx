/**
 * PLT-03 R5 (KNW-03 R3 lesson side, R4, R5): a lesson shows a Sharia term
 * with its approved glossary entry, never changes the text, and shows the
 * card as it is when no term is approved in that language.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { useDevice } from "@/app/stores/device"
import { GlossaryText, splitTerms, useGlossary, type GlossaryTerm, type Piece } from "./GlossaryText"

const TAWHID: GlossaryTerm = {
  concept: "التوحيد",
  term: "Tawhid",
  alternates: ["Tawheed"],
  definition: "Worshipping Allah alone, as the approved glossary explains it.",
  source_ids: ["s1"],
}
const LESSON = "Tawhid is the first thing a Muslim learns. Tawhid is not only counting."
const joined = (pieces: Piece[]) => pieces.map((p) => (typeof p === "string" ? p : p.text)).join("")

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("plt-03-r5 the approved glossary term in a lesson", () => {
  it("plt03_r5_tawhid_is_shown_with_its_approved_explanation", () => {
    useDevice.setState({ locale: "en" })
    render(<GlossaryText text={LESSON} terms={[TAWHID]} />)
    const term = screen.getByRole("button", { name: "Tawhid" })
    fireEvent.click(term)
    expect(screen.getByText(TAWHID.definition)).toBeTruthy()
  })

  it("plt03_r5_the_lesson_text_is_never_changed", () => {
    const pieces = splitTerms(LESSON, [TAWHID])
    expect(joined(pieces)).toBe(LESSON)
    // Only the first occurrence is marked, so the card stays calm.
    expect(pieces.filter((p) => typeof p !== "string")).toHaveLength(1)
  })

  it("plt03_r5_an_approved_alternate_is_marked_and_whole_words_only", () => {
    expect(splitTerms("About tawheed.", [TAWHID])).toEqual(["About ", { text: "tawheed", term: TAWHID }, "."])
    expect(splitTerms("Tawhidic thought", [TAWHID])).toEqual(["Tawhidic thought"])
  })

  it("plt03_r5_arabic_terms_match_as_whole_words", () => {
    const ar: GlossaryTerm = { ...TAWHID, term: "التوحيد", alternates: [] }
    expect(joined(splitTerms("أول ما يتعلمه المسلم التوحيد.", [ar]))).toBe("أول ما يتعلمه المسلم التوحيد.")
    expect(splitTerms("أول ما يتعلمه المسلم التوحيد.", [ar]).some((p) => typeof p !== "string")).toBe(true)
  })

  it("plt03_r5_no_approved_term_shows_the_card_as_it_is", () => {
    const { container } = render(<GlossaryText text={LESSON} terms={[]} />)
    expect(container.textContent).toBe(LESSON)
    expect(screen.queryByRole("button")).toBeNull()
    cleanup()
    const r = render(<GlossaryText text={LESSON} terms={undefined} />)
    expect(r.container.textContent).toBe(LESSON)
  })

  it("plt03_r5_terms_come_from_the_approved_glossary_in_the_learners_language", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ lang: "en", terms: [TAWHID] }), { headers: { "Content-Type": "application/json" } }))
    vi.stubGlobal("fetch", fetch)
    const Probe = () => {
      const { data } = useGlossary("en")
      return <p>{data?.map((t) => t.term).join(",")}</p>
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Probe />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByText("Tawhid")).toBeTruthy())
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toContain("/api/glossary?lang=en")
  })
})
