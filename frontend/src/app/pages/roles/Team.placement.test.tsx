/**
 * MOT-09 R6 on the placement figures: a figure under 10 people reads
 * «لا تكفي البيانات بعد»; the server hides it (null), the page never shows a number.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { translate } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { Placement } from "./Team"

const ar = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate("ar", k, v)

beforeEach(() => useDevice.setState({ locale: "ar" }))
afterEach(cleanup)

describe("MOT-09 R6 placement", () => {
  it("under 10 people in all: one «not enough data» line, no number", () => {
    const { container } = render(<Placement placement={{ distribution: {}, skipped: null }} />)
    expect(screen.getByText(ar("team.notEnough"))).toBeTruthy()
    expect(container.textContent).not.toMatch(/\d/)
  })

  it("10 or more: the buckets and the skipped count; a hidden bucket reads «not enough data»", () => {
    render(<Placement placement={{ distribution: { "0": 60, "1": 30, "2": null }, skipped: null }} />)
    expect(screen.getByText(ar("team.placementRow", { n: "0", c: "60" }))).toBeTruthy()
    expect(screen.getByText(ar("team.placementRow", { n: "1", c: "30" }))).toBeTruthy()
    expect(screen.getByText(ar("team.placementRow", { n: "2", c: ar("team.notEnough") }))).toBeTruthy()
    expect(screen.getByText(ar("team.skipped", { n: ar("team.notEnough") }))).toBeTruthy()
  })

  it("shows the skipped count when it has 10 people", () => {
    render(<Placement placement={{ distribution: { "0": 12 }, skipped: 15 }} />)
    expect(screen.getByText(ar("team.skipped", { n: "15" }))).toBeTruthy()
  })
})
