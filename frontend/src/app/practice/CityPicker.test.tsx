/**
 * PRC-01 R2 on the city screen: the empty state when nothing is typed, and
 * the honest answer when the located position is far from every listed city.
 * The position stays on the device (no fetch) and no city is saved.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"

import { translate } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"

const tz = { value: "Europe/London" }
vi.mock("./cities", async (orig) => ({ ...(await orig<typeof import("./cities")>()), deviceTimeZone: () => tz.value }))
const { default: CityPicker } = await import("./CityPicker")

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

useDevice.setState({ locale: "ar", city: null })

const view = () =>
  render(
    <MemoryRouter>
      <CityPicker />
    </MemoryRouter>,
  )

function stubPosition(latitude: number, longitude: number) {
  const getCurrentPosition = (ok: PositionCallback) => ok({ coords: { latitude, longitude } } as GeolocationPosition)
  Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true })
}

describe("PRC-01 R2: city list", () => {
  it("prc-01-r2 nothing typed and no listed city in the device zone: invites a search, not «not found»", async () => {
    tz.value = "Europe/London"
    view()
    expect(await screen.findByText(translate("ar", "practice.city.typeToSearch"))).toBeTruthy()
    expect(screen.queryByText(translate("ar", "practice.city.none"))).toBeNull()
  })

  it("prc-01-r2 a typed name that is not listed still says it was not found", async () => {
    tz.value = "Europe/London"
    view()
    await screen.findByText(translate("ar", "practice.city.typeToSearch"))
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Zzyzxville" } })
    expect(screen.getByText(translate("ar", "practice.city.none"))).toBeTruthy()
  })

  it("prc-01-r2 location in London: no far city is chosen, the area is said to be unsupported yet", async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    stubPosition(51.507, -0.128)
    view()
    const button = await screen.findByRole("button", { name: translate("ar", "practice.city.useLocation") })
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(button)
    expect(await screen.findByText(translate("ar", "practice.city.farAwayHigh"))).toBeTruthy()
    expect(useDevice.getState().city).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
