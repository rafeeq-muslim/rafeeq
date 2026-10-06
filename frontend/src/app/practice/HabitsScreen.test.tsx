/** PRC-02 R1 on the screen: a suggested habit's type is shown before it is saved. */
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router"

import { translate, type Key } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import HabitsScreen from "./HabitsScreen"
import { SUGGESTED } from "./habits"
import { usePractice } from "./store"

afterEach(cleanup)

useDevice.setState({ locale: "ar" })

describe("PRC-02 R1: type known before saving", () => {
  it("prc-02-r1 each suggestion shows «worship, private» or «daily life» before it is added", async () => {
    usePractice.setState({ habits: [], log: {} })
    render(
      <MemoryRouter>
        <HabitsScreen />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole("button", { name: translate("ar", "practice.habits.add") }))
    for (const s of SUGGESTED) {
      const title = translate("ar", `practice.habits.s.${s.key}` as Key)
      const row = (await screen.findByText(title)).closest("button") as HTMLElement
      const tag = translate("ar", s.worship ? "practice.habits.kindTagWorship" : "practice.habits.kindLife")
      expect(within(row).getByText(tag)).toBeTruthy()
    }
    expect(usePractice.getState().habits).toEqual([]) // nothing saved yet
  })
})
