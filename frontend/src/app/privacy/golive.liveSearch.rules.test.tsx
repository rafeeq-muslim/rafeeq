/**
 * PLT-05 R1 (go-live, owner 2026-10-06): the assistant reads islamqa.info and
 * binbaz.org.sa live by default, so the policy says what leaves the server:
 * up to 12 search words from the question, nothing that identifies the person.
 */
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"

import { translate, type Key } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"

const { default: Privacy } = await import("@/app/pages/Privacy")

afterEach(cleanup)

describe("go-live plt-05-r1 the policy names the live search", () => {
  it("golive_privacy_live_search_block_is_shown", () => {
    useDevice.setState({ onboarded: false, locale: "ar" })
    render(
      <MemoryRouter initialEntries={["/privacy"]}>
        <Privacy />
      </MemoryRouter>,
    )
    expect(screen.getByRole("heading", { name: translate("ar", "policy.live.title") })).toBeTruthy()
    expect(screen.getByText(translate("ar", "policy.live.body"))).toBeTruthy()
  })

  it("golive_privacy_live_search_line_is_factual_in_every_language", () => {
    for (const code of ["ar", "en", "tl"] as const) {
      const body = translate(code, "policy.live.body" as Key)
      expect(body).toContain("12")
      expect(body).toContain("islamqa.info")
      expect(body).toContain("binbaz.org.sa")
      expect(body).toContain("cookies")
      // The encyclopedia is not searched (robots.txt): the policy must not name it.
      expect(body).not.toMatch(/islamenc/i)
    }
  })
})
