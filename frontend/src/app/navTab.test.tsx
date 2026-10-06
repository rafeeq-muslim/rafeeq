/**
 * The bottom bar lights the tab a screen belongs to (route -> active tab).
 * Bug found with PLT-04: on the KNW-05 review desk, and the other team
 * screens opened from «حسابي», the bar fell back to «الرئيسية».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router"

import { translate, type Key } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import type { NavKey } from "@/components/rafeeq"

vi.mock("@/app/learning/useContent", () => ({
  useContent: () => ({ content: undefined, isLoading: false, isError: false, refetch: () => undefined, lessons: [], preview: false }),
}))

const { default: AppLayout, activeKey } = await import("@/app/AppLayout")

const LABEL: Record<NavKey, Key> = { home: "nav.home", learn: "nav.learn", ask: "nav.ask", mentor: "nav.mentor", account: "nav.me" }

/** The label of the lit tab in the bottom bar, or null when none is lit. */
function litTab() {
  const bar = document.querySelector<HTMLElement>('[data-slot="bottom-nav"]')!
  const on = within(bar).queryAllByRole("button").filter((b) => b.getAttribute("aria-current") === "page")
  expect(on.length).toBeLessThanOrEqual(1)
  return on[0]?.textContent ?? null
}

function at(entry: string, basename?: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entry]} basename={basename}>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<p>screen</p>} />
            <Route path="*" element={<p>screen</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  expect(screen.getByText("screen")).toBeTruthy()
}

beforeEach(() => {
  useDevice.setState({ locale: "ar", onboarded: true, quickExit: false, discreet: false })
})
afterEach(cleanup)

const CASES: [string, NavKey][] = [
  ["/", "home"],
  ["/guide", "home"],
  ["/learn", "learn"],
  ["/ask", "ask"],
  ["/mentor", "mentor"],
  ["/mentor/group", "mentor"],
  ["/me", "account"],
  ["/me/account", "account"],
  ["/practice/qibla", "account"],
  ["/discover/library", "account"],
  // Team screens: their entries live in «حسابي» (Me.tsx), so they are not Home.
  ["/review-desk", "account"],
  ["/review-desk/unit/unit-01", "account"],
  ["/review-desk/explanations", "account"],
  ["/inbox", "account"],
  ["/inbox/r/42", "account"],
  ["/referrals", "account"],
  ["/team", "account"],
  ["/admin", "account"],
  ["/org", "account"],
]

describe("knw-05 / plt-04 bottom bar: route -> active tab", () => {
  it.each(CASES)("activeKey(%s) is %s", (path, tab) => {
    expect(activeKey(path)).toBe(tab)
  })

  it("matches whole path segments only (/mentor is not «حسابي», /organic is not /org)", () => {
    expect(activeKey("/mentor")).toBe("mentor")
    expect(activeKey("/organic")).toBe("home")
    expect(activeKey("/teams")).toBe("home")
  })

  it("knw05_review_desk_lights_my_account_not_home", () => {
    at("/review-desk")
    expect(litTab()).toBe(translate("ar", "nav.me"))
    expect(litTab()).not.toBe(translate("ar", "nav.home"))
  })

  it.each(["/review-desk/unit/unit-01", "/inbox", "/referrals", "/team", "/admin", "/org"])("%s lights «حسابي» in the rendered bar", (path) => {
    at(path)
    expect(litTab()).toBe(translate("ar", LABEL.account))
  })

  it("follows the router's path, so it holds under the /app basename (PLT-10)", () => {
    at("/app/review-desk", "/app")
    expect(litTab()).toBe(translate("ar", LABEL.account))
    cleanup()
    at("/app/", "/app")
    expect(litTab()).toBe(translate("ar", LABEL.home))
  })
})
