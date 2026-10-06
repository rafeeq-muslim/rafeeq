/**
 * PRC-04 R1: the Hijri date is seen when the app opens (Home), computed on
 * the device: 5 Oct 2026 is 24 Rabi' al-Akhir 1448, offline, and the same in
 * Riyadh and Manila.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { translate } from "@/app/i18n"
import { useDevice, type City } from "@/app/stores/device"

vi.mock("@/app/learning/useContent", () => ({
  useContent: () => ({ content: undefined, isLoading: false, isError: false, refetch: () => undefined, lessons: [], preview: false }),
}))
const { default: Home } = await import("./Home")

const riyadh: City = { id: "108410", name: { en: "Riyadh", ar: "الرياض" }, country: "SA", lat: 24.68773, lng: 46.72185, tz: "Asia/Riyadh" }
const manila: City = { id: "1701668", name: { en: "Manila" }, country: "PH", lat: 14.6042, lng: 120.9822, tz: "Asia/Manila" }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-05T09:00:00Z"))
  vi.stubGlobal("fetch", () => Promise.reject(new TypeError("offline")))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const view = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    </QueryClientProvider>,
  )

const expected = () =>
  translate("ar", "practice.hijriDate", { d: 24, m: translate("ar", "practice.month.4"), y: 1448 })

describe("PRC-04 R1: Hijri date on opening the app", () => {
  it.each([
    ["Riyadh", riyadh],
    ["Manila", manila],
  ])("prc-04-r1 Home shows 24 Rabi' al-Akhir 1448 on 5 Oct 2026, offline, in %s", (_, city) => {
    useDevice.setState({ locale: "ar", city })
    view()
    expect(screen.getByText(expected(), { exact: false })).toBeTruthy()
  })

  it("prc-04-r1 Home shows it with no city chosen too", () => {
    useDevice.setState({ locale: "ar", city: null })
    view()
    expect(screen.getByText(expected(), { exact: false })).toBeTruthy()
  })
})
