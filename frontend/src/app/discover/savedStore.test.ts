/** KNW-09 saved items: the device store (the account side is backend/tests/test_knw09_saved.py). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useAuth } from "@/app/stores/auth"
import { mergeSaved, pruneAnswers, pushSaved, savedAnswer, useSaved, type AnswerText, type SavedEntry } from "./savedStore"
import { resolveAnswer, resolveSaved } from "./resolve"

const e = (ref: string, at: string, kind: SavedEntry["kind"] = "card"): SavedEntry => ({ kind, ref, saved_at: at })
const ANSWER: AnswerText = { lang: "en", answer: "Rafeeq's wording. {{q:quranenc:english_saheeh:1:2}}", source_ids: ["quranenc:english_saheeh:1:2"] }
const stored = () => localStorage.getItem("rafeeq.savedAnswers") ?? ""
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })

beforeEach(() => {
  localStorage.clear()
  useAuth.setState({ token: null })
  useSaved.setState({ items: [] })
})
afterEach(() => vi.unstubAllGlobals())

describe("knw-09-r1 save any card or answer, once", () => {
  it("knw09_r1_saving_twice_keeps_one_entry", () => {
    useSaved.getState().save("card", "hadeethenc-5866", new Date("2026-10-05T08:00:00Z"))
    useSaved.getState().save("card", "hadeethenc-5866", new Date("2026-10-06T08:00:00Z"))
    expect(useSaved.getState().items).toHaveLength(1)
    expect(useSaved.getState().has("card", "hadeethenc-5866")).toBe(true)
  })
})

describe("knw-09-r2 a saved answer keeps its text, sources and date, not the question", () => {
  it("knw09_r2_answer_text_sources_and_date_are_kept_without_the_question", () => {
    useSaved.getState().save("answer", "ask-1", new Date("2026-10-05T08:00:00Z"), { ...ANSWER, question: "secret question" } as AnswerText)
    expect(savedAnswer("ask-1")).toEqual(ANSWER)
    expect(useSaved.getState().items).toEqual([e("ask-1", "2026-10-05T08:00:00.000Z", "answer")])
    expect(stored()).not.toContain("secret question")
  })
})

describe("knw-09-r3 guest items move to the account", () => {
  it("knw09_r3_merge_is_a_union_without_duplicates", () => {
    const device = [e("c1", "2026-10-02"), e("c2", "2026-10-01")]
    const account = [e("c1", "2026-10-01"), e("l1", "2026-10-03", "library")]
    const merged = mergeSaved(device, account)
    expect(merged.map((x) => `${x.kind}:${x.ref}`).sort()).toEqual(["card:c1", "card:c2", "library:l1"])
    expect(merged.find((x) => x.ref === "c1")?.saved_at).toBe("2026-10-01")
  })

  it("knw09_r3_saved_answer_text_moves_to_the_account_and_back_without_the_question", async () => {
    useSaved.getState().save("answer", "ask-1", new Date("2026-10-05T08:00:00Z"), ANSWER)
    const sent: unknown[] = []
    const fromOtherDevice = { kind: "answer", ref: "ask-9", saved_at: "2026-10-01T08:00:00Z", answer: { ...ANSWER, answer: "Other device." } }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { items: unknown[] }
        sent.push(body)
        return json({ items: [...body.items, fromOtherDevice] })
      }),
    )
    useAuth.setState({ token: "t" })
    await pushSaved()
    expect(sent[0]).toEqual({ items: [{ kind: "answer", ref: "ask-1", saved_at: "2026-10-05T08:00:00.000Z", answer: ANSWER }] })
    expect(JSON.stringify(sent)).not.toContain("question")
    expect(savedAnswer("ask-9")?.answer).toBe("Other device.")
    expect(useSaved.getState().items.map((x) => x.ref).sort()).toEqual(["ask-1", "ask-9"])
    expect(useSaved.getState().items.every((x) => !("answer" in x))).toBe(true) // the list keeps ids only
  })
})

describe("knw-09-r5 delete one or all", () => {
  it("knw09_r5_delete_one_and_delete_all", () => {
    useSaved.getState().save("card", "a")
    useSaved.getState().save("library", "b")
    useSaved.getState().remove("card", "a")
    expect(useSaved.getState().items.map((x) => x.ref)).toEqual(["b"])
    useSaved.getState().clear()
    expect(useSaved.getState().items).toEqual([])
  })

  it("knw09_r5_a_deleted_answer_leaves_no_text_on_the_device", () => {
    useSaved.getState().save("answer", "ask-1", undefined, ANSWER)
    useSaved.getState().save("answer", "ask-2", undefined, { ...ANSWER, answer: "Second answer." })
    useSaved.getState().remove("answer", "ask-1")
    expect(stored()).not.toContain("Rafeeq's wording")
    expect(savedAnswer("ask-2")).toBeDefined()
    useSaved.getState().clear()
    expect(localStorage.getItem("rafeeq.savedAnswers")).toBeNull()
  })

  it("knw09_r5_text_left_by_an_older_build_is_removed", () => {
    localStorage.setItem("rafeeq.savedAnswers", JSON.stringify({ gone: { ...ANSWER, ask_id: "gone" }, kept: ANSWER }))
    pruneAnswers([e("kept", "2026-10-01", "answer")])
    expect(stored()).not.toContain("gone")
    expect(savedAnswer("kept")).toEqual(ANSWER)
  })
})

describe("knw-09-r6 withdrawn content is not shown", () => {
  it("knw09_r6_an_id_missing_from_approved_content_is_unavailable", () => {
    const approved = { cards: new Map([["c1", { title: "Ease" }]]), library: new Map<string, { title: string }>() }
    const out = resolveSaved([e("c1", "2026-10-02"), e("c9", "2026-10-01"), e("l1", "2026-10-01", "library")], approved)
    expect(out.map((x) => x.available)).toEqual([true, false, false])
    expect(out[1]).not.toHaveProperty("content") // no old text kept or shown
  })

  it("knw09_r6_an_answer_whose_source_is_no_longer_served_is_not_shown", () => {
    const records = new Map([["quranenc:english_saheeh:1:2", { id: "quranenc:english_saheeh:1:2" }]])
    expect(resolveAnswer(ANSWER, records)?.sources).toHaveLength(1)
    expect(resolveAnswer({ ...ANSWER, source_ids: [...ANSWER.source_ids, "hadeethenc:en:1"] }, records)).toBeUndefined()
    expect(resolveAnswer(undefined, records)).toBeUndefined()
  })
})
