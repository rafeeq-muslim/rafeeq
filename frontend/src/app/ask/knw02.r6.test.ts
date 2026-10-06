import { describe, expect, it } from "vitest"

import { sourceLabel } from "@/app/ask/answer"

describe("KNW-02 R6 approved team cards as an answer source", () => {
  it("knw02_r6_ex1_card_source_is_named_in_the_reader_language", () => {
    const card = { source_id: "rafeeq_cards", source_name: "بطاقات رفيق المعتمدة" }
    expect(sourceLabel(card, "ar")).toBe("دروس رفيق")
    expect(sourceLabel(card, "en")).toBe("Rafeeq lessons")
    expect(sourceLabel(card, "tl")).toBe("Mga aralin ng Rafeeq")
  })
})
