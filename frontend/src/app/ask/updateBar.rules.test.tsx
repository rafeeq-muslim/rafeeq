/**
 * KNW-01 R7 follow-up: the update bar under an open Ask conversation does not
 * say «تقدّمك في الدرس محفوظ» (that is the lesson's wording, LRN-03 R5); it
 * says a new version is there and to update when done. Lesson, review and
 * placement keep the lesson wording. In the three languages.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"

import { LOCALES, translate } from "@/app/i18n"
import { UpdateBar } from "@/app/AppLayout"
import { onNewVersion } from "@/app/lib/pwa"
import { useDevice } from "@/app/stores/device"
import { useAsk } from "./store"

const LESSON = "/learn/lesson/u01-l1"
const show = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <UpdateBar />
    </MemoryRouter>,
  )
const bar = () => screen.getByRole("status").textContent ?? ""

beforeAll(() => onNewVersion(LESSON)) // a new version took over while a lesson was open: it waits
beforeEach(() => {
  sessionStorage.clear()
  useAsk.getState().setDraft("TEST_DRAFT_TEXT") // an open conversation holds the reload on /ask
})
afterEach(() => {
  cleanup()
  useAsk.getState().setDraft("")
  useDevice.setState({ locale: "ar" })
})

describe("knw-01 r7: the update bar's wording on Ask", () => {
  for (const { code } of LOCALES) {
    it(`knw01_r7_update_bar_on_ask_is_neutral_${code}`, () => {
      useDevice.setState({ locale: code })
      show("/ask")
      expect(bar()).toContain(translate(code, "app.updateWaiting"))
      expect(bar()).not.toContain(translate(code, "app.updateReady"))
      expect(screen.getByRole("button", { name: translate(code, "app.updateNow") })).toBeTruthy()
    })

    for (const path of [LESSON, "/learn/review", "/learn/placement"]) {
      it(`lrn03_r5_update_bar_keeps_the_lesson_wording_${code}_${path}`, () => {
        useDevice.setState({ locale: code })
        show(path)
        expect(bar()).toContain(translate(code, "app.updateReady"))
        expect(bar()).not.toContain(translate(code, "app.updateWaiting"))
      })
    }
  }

  it("knw01_r7_the_neutral_wording_does_not_mention_a_lesson", () => {
    expect(translate("ar", "app.updateWaiting")).toBe("نسخة جديدة من رفيق. حدّث حين تنتهي.")
    expect(translate("ar", "app.updateWaiting")).not.toContain("الدرس")
    expect(translate("en", "app.updateWaiting")).not.toMatch(/lesson/i)
    expect(translate("tl", "app.updateWaiting")).not.toMatch(/aralin/i)
  })
})
