/**
 * PLT-17 R14-R15 (organisation coordinator): the code cards stay inside a
 * phone screen, and an empty or failed screen says why.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"

import { translate, type Key } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import type { CodeRow } from "@/app/org/api"

const { default: Org, CodeList } = await import("@/app/pages/roles/Org")

const ar = (k: Key) => translate("ar", k)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

let mine: () => Response
beforeEach(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
  useDevice.setState({ locale: "ar", onboarded: true })
  useAuth.getState().set({ token: null, me: null, ready: true })
  mine = () => json([])
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => (url === "/api/org/mine" ? mine() : json({ detail: "not found" }, 404))),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )

describe("plt-17-r15 an empty or failed coordinator screen says why", () => {
  it("plt17_r15_no_active_organisation_is_said_not_a_blank_page", async () => {
    wrap(<Org />)
    expect(await screen.findByText(ar("plt17.org.none"))).toBeTruthy()
    expect(screen.getByText(ar("plt17.org.noneBody"))).toBeTruthy()
  })

  it("plt17_r15_a_failed_load_says_so_and_retries", async () => {
    mine = () => json({ detail: "boom" }, 500)
    wrap(<Org />)
    expect(await screen.findByText(ar("plt17.org.loadError"))).toBeTruthy()
    mine = () => json([])
    fireEvent.click(screen.getByRole("button", { name: ar("common.retry") }))
    expect(await screen.findByText(ar("plt17.org.none"))).toBeTruthy()
    await waitFor(() => expect(screen.queryByText(ar("plt17.org.loadError"))).toBeNull())
  })
})

describe("plt-17-r14 code cards stay inside a 390px screen", () => {
  it("plt17_r14_cards_may_shrink_and_the_long_link_is_cut_with_its_copy_button_kept", () => {
    const code = { code: "K7M2QX9P", lang: "tl", path: "/app/welcome?lang=tl&org=K7M2QX9P-a-very-long-path-that-would-widen-the-card" } as CodeRow
    const { container } = wrap(<CodeList codes={[code]} />)
    const list = container.querySelector("ul")!
    expect(list.className).toContain("grid-cols-1")
    const card = container.querySelector(`[data-code="${code.code}"]`)!
    expect(card.className).toContain("min-w-0")
    const link = Array.from(card.querySelectorAll("p")).find((p) => p.textContent?.includes(code.path))!
    expect(link.className).toContain("truncate")
    expect(link.className).toContain("min-w-0")
    expect(link.getAttribute("title")).toContain(code.path)
    expect(screen.getByRole("button", { name: new RegExp(ar("org.codes.copyLink")) })).toBeTruthy()
  })
})
