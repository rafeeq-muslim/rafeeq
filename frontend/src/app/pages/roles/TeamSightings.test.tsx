/**
 * PLT-17 R5: the team enters the announced month start (Saudi Arabia), with
 * a required source link and a confirmation, and can remove a wrong one;
 * Ramadan mode then follows the entry (PRC-04 R2). Only the team gets the screen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { translate } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { isRamadan, type Sighting } from "@/app/practice/hijri"
import mainTsx from "../../../main.tsx?raw"
import { TeamSightings, upcomingYear } from "./TeamSightings"

const ar = (k: Parameters<typeof translate>[1]) => translate("ar", k)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const SAVED = { country: "SA", hijri_year: 1448, hijri_month: 9, start: "2027-02-08", source_url: "https://www.spa.gov.sa/x" }
let calls: { url: string; method: string; body?: unknown }[] = []
let items: (Sighting & { source_url: string })[] = []

function stub() {
  calls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET"
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url.startsWith("/api/practice/sightings/expected")) return json({ expected: "2027-02-08", countries: ["SA"] })
      if (url === "/api/practice/sightings" && method === "POST") {
        items = [SAVED]
        return json({ start: SAVED.start }, 201)
      }
      if (url === "/api/practice/sightings") return json({ items })
      if (method === "DELETE") {
        items = []
        return new Response(null, { status: 204 })
      }
      return json({})
    }),
  )
}
const settle = () => act(async () => await new Promise((r) => setTimeout(r, 0)))
const view = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TeamSightings />
    </QueryClientProvider>,
  )

beforeEach(() => {
  useDevice.setState({ locale: "ar" })
  items = []
  stub()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("PLT-17 R5 team month-start announcements", () => {
  it("plt17 r5: team saves a Saudi Ramadan sighting after confirming, and Ramadan is then announced", async () => {
    view()
    await settle()
    expect(screen.getByText(ar("plt17.sight.intro"))).toBeTruthy()
    fireEvent.change(screen.getByLabelText(ar("plt17.sight.source")), { target: { value: SAVED.source_url } })
    fireEvent.click(screen.getByRole("button", { name: ar("plt17.sight.save") }))
    expect(screen.getByText(ar("plt17.sight.saveTitle"))).toBeTruthy()
    expect(calls.some((c) => c.method === "POST")).toBe(false) // nothing saved before confirming
    fireEvent.click(screen.getByRole("button", { name: ar("plt17.sight.confirmSave") }))
    await settle()
    await settle()
    const post = calls.find((c) => c.method === "POST")
    expect(post?.body).toEqual(SAVED)
    expect(screen.getByText(SAVED.source_url)).toBeTruthy()
    // PRC-04 R2: with this entry, 10 Feb 2027 is announced Ramadan in Saudi Arabia and in a country without its own entry.
    expect(isRamadan({ y: 2027, m: 2, d: 10 }, items, "SA")).toBe(true)
    expect(isRamadan({ y: 2027, m: 2, d: 10 }, items, "PH")).toBe(true)
  })

  it("plt17 r5 (error): an empty source link is refused and nothing is saved", async () => {
    view()
    await settle()
    fireEvent.click(screen.getByRole("button", { name: ar("plt17.sight.save") }))
    expect(screen.getByRole("alert").textContent).toBe(ar("plt17.sight.sourceRequired"))
    expect(calls.some((c) => c.method === "POST")).toBe(false)
  })

  it("plt17 r5: removing asks first; cancel keeps it, confirm removes it", async () => {
    items = [SAVED]
    view()
    await settle()
    fireEvent.click(screen.getByRole("button", { name: ar("plt17.sight.remove") }))
    expect(screen.getByText(ar("plt17.sight.removeTitle"))).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: ar("common.cancel") }))
    await settle()
    expect(calls.some((c) => c.method === "DELETE")).toBe(false)

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    fireEvent.click(screen.getByRole("button", { name: ar("plt17.sight.remove") }))
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: ar("plt17.sight.remove") }))
    await settle()
    await settle()
    expect(calls.find((c) => c.method === "DELETE")?.url).toBe("/api/practice/sightings/SA/1448/9")
    expect(screen.getByText(ar("plt17.sight.empty"))).toBeTruthy()
  })

  it("plt17 r5 (permissions): the Team page that holds the screen is team-only", () => {
    expect(mainTsx).toMatch(/path: "team", element: <RequireRole roles=\{\["team"\]\}><Team \/><\/RequireRole>/)
  })

  it("plt17 r5: the default year is the next start of the chosen month", () => {
    expect(upcomingYear(9, new Date(2026, 9, 6))).toBe(1448) // Rabi' al-Akhir 1448 → Ramadan 1448
    expect(upcomingYear(9, new Date(2027, 3, 1))).toBe(1449) // after Ramadan 1448 → 1449
  })
})
