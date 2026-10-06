import { describe, expect, it } from "vitest"
import { excerptOf } from "./VerseBlock"

// Al-Baqarah 222 exactly as stored from QuranEnc (production, 2026-10-06).
const V2_222 = "وَيَسۡـَٔلُونَكَ عَنِ ٱلۡمَحِيضِۖ قُلۡ هُوَ أَذٗى فَٱعۡتَزِلُواْ ٱلنِّسَآءَ فِي ٱلۡمَحِيضِ وَلَا تَقۡرَبُوهُنَّ حَتَّىٰ يَطۡهُرۡنَۖ فَإِذَا تَطَهَّرۡنَ فَأۡتُوهُنَّ مِنۡ حَيۡثُ أَمَرَكُمُ ٱللَّهُۚ إِنَّ ٱللَّهَ يُحِبُّ ٱلتَّوَّٰبِينَ وَيُحِبُّ ٱلۡمُتَطَهِّرِينَ"

describe("LRN-01 R2: only the part of a verse the book quotes (PR #14)", () => {
  it("u01-l2-c1 shows six words of 2:222 and nothing about menstruation", () => {
    const shown = excerptOf(V2_222, [22, 27])!
    expect(shown.split(" ")).toHaveLength(6)
    expect(shown).toBe(V2_222.split(" ").slice(21, 27).join(" "))
    expect(shown).not.toContain("ٱلۡمَحِيضِ")
  })
  it("a span outside the stored verse falls back to the whole verse", () => {
    expect(excerptOf(V2_222, [20, 99])).toBeNull()
    expect(excerptOf(V2_222, [0, 3])).toBeNull()
    expect(excerptOf(V2_222, undefined)).toBeNull()
  })
})
