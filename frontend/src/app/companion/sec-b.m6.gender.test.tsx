/** Security review B-M6: the refusal to change gender under a mentor, a group or an open request is said in words. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"

import { translate } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"

const errors: string[] = []
vi.mock("sonner", () => ({ toast: { error: (m: string) => void errors.push(m), success: () => undefined } }))

const { MatchForm } = await import("./ChooseMentor")

beforeEach(() => {
  errors.length = 0
  useDevice.setState({ locale: "ar" })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("Security review B-M6: gender under a mentor, a group or an open request", () => {
  it("sec_b_m6_the_learner_is_told_why_the_choice_did_not_change", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "gender_in_use" }), { status: 409, headers: { "Content-Type": "application/json" } })),
    )
    let done = 0
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <MatchForm initialGender="m" initialLanguages={["ar"]} submitLabel="احفظ" onDone={() => void (done += 1)} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole("radio", { name: translate("ar", "cmp.choose.sister") }))
    fireEvent.click(screen.getByRole("button", { name: "احفظ" }))
    await waitFor(() => expect(errors).toEqual([translate("ar", "sec.gender.inUse")]))
    expect(done).toBe(0)
  })

  it("sec_b_m6_the_sentence_exists_in_all_three_languages", () => {
    for (const lang of ["ar", "en", "tl"] as const) expect(translate(lang, "sec.gender.inUse")).not.toBe("sec.gender.inUse")
    expect(translate("tl", "sec.gender.inUse")).not.toBe(translate("en", "sec.gender.inUse"))
  })
})
