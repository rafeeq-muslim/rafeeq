import { beforeEach, describe, expect, it } from "vitest"
import { mergeSaved, useSaved, type SavedEntry } from "./saved"
import { resolveSaved } from "./resolve"

const e = (ref: string, at: string, kind: SavedEntry["kind"] = "card"): SavedEntry => ({ kind, ref, saved_at: at })

describe("KNW-09 saved items", () => {
  beforeEach(() => useSaved.setState({ items: [] }))

  it("R1: saving twice keeps one entry", () => {
    useSaved.getState().save("card", "hadeethenc-5866", new Date("2026-10-05T08:00:00Z"))
    useSaved.getState().save("card", "hadeethenc-5866", new Date("2026-10-06T08:00:00Z"))
    expect(useSaved.getState().items).toHaveLength(1)
    expect(useSaved.getState().has("card", "hadeethenc-5866")).toBe(true)
  })

  it("R3: merge is a union without duplicates (earliest date kept)", () => {
    const device = [e("c1", "2026-10-02"), e("c2", "2026-10-01")]
    const account = [e("c1", "2026-10-01"), e("l1", "2026-10-03", "library")]
    const merged = mergeSaved(device, account)
    expect(merged.map((x) => `${x.kind}:${x.ref}`).sort()).toEqual(["card:c1", "card:c2", "library:l1"])
    expect(merged.find((x) => x.ref === "c1")?.saved_at).toBe("2026-10-01")
  })

  it("R5: delete one and delete all", () => {
    useSaved.getState().save("card", "a")
    useSaved.getState().save("library", "b")
    useSaved.getState().remove("card", "a")
    expect(useSaved.getState().items.map((x) => x.ref)).toEqual(["b"])
    useSaved.getState().clear()
    expect(useSaved.getState().items).toEqual([])
  })

  it("R6: an id missing from approved content is unavailable", () => {
    const approved = { cards: new Map([["c1", { title: "Ease" }]]), library: new Map<string, { title: string }>() }
    const out = resolveSaved([e("c1", "2026-10-02"), e("c9", "2026-10-01"), e("l1", "2026-10-01", "library")], approved)
    expect(out.map((x) => x.available)).toEqual([true, false, false])
    expect(out[1]).not.toHaveProperty("content") // no old text kept or shown
  })
})
