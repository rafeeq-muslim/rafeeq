import { describe, expect, it } from "vitest"

import { isolateArabic, isolateDeep } from "./bidi"

describe("issue #9 item 18: Arabic inside English or Filipino keeps its quotes in place", () => {
  it("isolates each Arabic run, spaces included", () => {
    expect(isolateArabic("Ano ang kahulugan ng “لا إله إلا الله”?")).toBe("Ano ang kahulugan ng “⁧لا إله إلا الله⁩”?")
  })
  it("leaves text without Arabic, and already isolated text, unchanged", () => {
    expect(isolateArabic("Wash the hands")).toBe("Wash the hands")
    const once = isolateArabic("say “بسم الله” first")
    expect(isolateArabic(once)).toBe(once)
  })
  it("reaches every string in the content, ids untouched", () => {
    const c = isolateDeep({ id: "e1", prompt: "What is “وضوء”?", options: [{ id: "a", text: "الوضوء" }] })
    expect(c).toEqual({ id: "e1", prompt: "What is “⁧وضوء⁩”?", options: [{ id: "a", text: "⁧الوضوء⁩" }] })
  })
})
