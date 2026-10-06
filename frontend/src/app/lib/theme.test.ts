/** PLT-04 appearance: light by default whatever the device says; dark only
 * by the learner's choice, kept on the device; night moments stay night. */
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { JourneySky, ThemeSwitcher } from "@/components/rafeeq"
import { useDevice } from "@/app/stores/device"
import { BAR_COLOR, applyTheme } from "./theme"
import themeScript from "../../../public/theme.js?raw"

const root = document.documentElement
const bar = () => document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!.content

beforeEach(() => {
  document.head.innerHTML = '<meta name="theme-color" content="#f7f6fb" />'
  root.className = ""
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("plt-04 appearance", () => {
  it("is light by default, even when the device is set to dark", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("dark"), media: q, addEventListener() {}, removeEventListener() {} }))
    expect(useDevice.getInitialState().theme).toBe("light")
    applyTheme(useDevice.getInitialState().theme)
    expect(root.classList.contains("dark")).toBe(false)
    expect(bar()).toBe(BAR_COLOR.light)
  })

  it("turns dark when the learner picks dark, and keeps the choice on the device", () => {
    useDevice.getState().set({ theme: "dark" })
    applyTheme(useDevice.getState().theme)
    expect(root.classList.contains("dark")).toBe(true)
    expect(bar()).toBe(BAR_COLOR.dark)
    expect(JSON.parse(localStorage.getItem("rafeeq.device")!).state.theme).toBe("dark")
  })

  it("goes back to light when the learner picks light", () => {
    applyTheme("dark")
    applyTheme("light")
    expect(root.classList.contains("dark")).toBe(false)
    expect(bar()).toBe(BAR_COLOR.light)
  })

  it("applies a saved dark choice before the app loads (public/theme.js)", () => {
    localStorage.setItem("rafeeq.device", JSON.stringify({ state: { theme: "dark" }, version: 1 }))
    new Function(themeScript)()
    expect(root.classList.contains("dark")).toBe(true)
    expect(bar()).toBe(BAR_COLOR.dark)
  })

  it("stays light before the app loads when nothing is saved or storage is unreadable", () => {
    localStorage.setItem("rafeeq.device", "{not json")
    new Function(themeScript)()
    expect(root.classList.contains("dark")).toBe(false)
  })

  it("keeps the Home sky a night moment in the light theme", () => {
    applyTheme("light")
    render(createElement(JourneySky, { day: 1, month: 0, monthLabel: "الشهر 1", streakDays: 0 }))
    expect(screen.getByRole("region").classList.contains("dark")).toBe(true)
  })

  it("offers light and dark in «حسابي» and reports the choice", () => {
    const onValueChange = vi.fn()
    render(createElement(ThemeSwitcher, { value: "light", onValueChange }))
    fireEvent.click(screen.getByRole("radio", { name: "داكن" }))
    expect(onValueChange).toHaveBeenCalledWith("dark")
  })
})
