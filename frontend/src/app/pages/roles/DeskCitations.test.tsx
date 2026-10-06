/** KNW-05 R2 and KNW-03 R3 ex2 in the review desk (texts are placeholders, never scripture). */
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { translate } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { GlossaryFlags, HadithCitations } from "./DeskCitations"

afterEach(cleanup)
const lc = () => useDevice.getState().locale

describe("KNW-05 R2: the reviewer sees each cited hadith from its stored record", () => {
  it("R2: shows the stored text, grade and reference beside the card, and names a missing record", () => {
    render(
      <HadithCitations
        ids={[1234, 99]}
        lang="en"
        records={{
          "1234": { text: "TEST_STORED_TEXT", grade: "TEST_GRADE", attribution: "TEST_ATTRIBUTION", reference: "TEST_REFERENCE", url: "https://hadeethenc.com/en/browse/hadith/1234", version: "v" },
          "99": null,
        }}
      />,
    )
    expect(screen.getByText("TEST_STORED_TEXT")).toBeTruthy()
    expect(screen.getByText("TEST_GRADE")).toBeTruthy()
    expect(screen.getByText("TEST_ATTRIBUTION · TEST_REFERENCE")).toBeTruthy()
    expect(screen.getByText(translate(lc(), "desk.cite.missing", { id: "99" }))).toBeTruthy()
  })
})

describe("KNW-03 R3: a non-approved spelling is flagged for the reviewer", () => {
  it("R3: lists the spelling found and the approved term; nothing when there is none", () => {
    const { container } = render(<GlossaryFlags flags={[]} />)
    expect(container.textContent).toBe("")
    render(<GlossaryFlags flags={[{ concept: "TEST_CONCEPT", found: "wudhu", term: "wudu" }]} />)
    expect(screen.getByText(translate(lc(), "desk.glossary.title"))).toBeTruthy()
    expect(screen.getByText(new RegExp(translate(lc(), "desk.glossary.flag", { found: "wudhu", term: "wudu" })))).toBeTruthy()
  })
})
