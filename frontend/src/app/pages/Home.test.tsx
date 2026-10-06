/** Issue #9 item 19 (LRN-02): while the content is not here yet, home never
 * says the lessons are with the Sharia reviewer. */
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { translate } from "@/app/i18n"
import type { Content } from "@/app/learning/types"
import { useDevice } from "@/app/stores/device"

const state: { content: Content | undefined; isError: boolean } = { content: undefined, isError: false }
vi.mock("@/app/learning/useContent", () => ({
  useContent: () => ({
    content: state.content,
    isLoading: false, // e.g. paused offline or between retries: not "loading", still no content
    isError: state.isError,
    refetch: () => undefined,
    lessons: [],
    preview: false,
  }),
}))
const { default: Home } = await import("./Home")

afterEach(cleanup)

useDevice.setState({ locale: "ar" })

const view = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    </QueryClientProvider>,
  )

describe("lrn-02 home while the content loads (issue #9 item 19)", () => {
  it("shows no reviewer message before the content arrives", () => {
    view()
    expect(screen.queryByText(translate("ar", "home.preparing"))).toBeNull()
  })

  it("shows the reviewer message only for loaded content with no lesson", () => {
    state.content = { lang: "ar", preview: false, units: [], lessons: {} }
    view()
    expect(screen.getByText(translate("ar", "home.preparing"))).toBeTruthy()
    state.content = undefined
  })
})
