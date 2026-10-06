/** Issue #9 item 17 (LRN-04): the review opened by its link or after a reload
 * shows the objectives that are due, not «nothing to review». */
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"

import { translate } from "@/app/i18n"
import { useLearning } from "@/app/stores/learning"
import type { Content } from "@/app/learning/types"

const state: { content: Content | undefined; isLoading: boolean } = { content: undefined, isLoading: true }
vi.mock("@/app/learning/useContent", () => ({
  useContent: () => ({ content: state.content, isLoading: state.isLoading, lessons: state.content ? Object.values(state.content.lessons) : [], preview: false }),
}))
const { default: Review } = await import("./Review")

afterEach(cleanup)

const content = {
  lang: "ar",
  preview: false,
  units: [{ id: "u1", order: 1, title: "U", lessons: ["l1"] }],
  lessons: {
    l1: {
      id: "l1",
      unit: "u1",
      order: 1,
      title: "L1",
      approved: true,
      cards: [{ id: "c1", text: "CARD" }],
      objectives: [{ id: "o1", text: "O1", cards: ["c1"] }],
      exercises: [{ id: "e1", type: "choose", prompt: "PROMPT_E1", objectives: ["o1"], cards: ["c1"], options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], answer: "a" }],
    },
  },
} as unknown as Content

describe("lrn-04 review opened by its link (issue #9 item 17)", () => {
  it("builds the session once the content arrives", () => {
    const hourAgo = new Date(Date.now() - 2 * 3_600_000).toISOString()
    useLearning.setState({
      completed: { l1: { first: hourAgo, last: hourAgo, times: 1 } },
      mastery: { o1: { p: 0.4, seen: true, answered: true, lastAnswerAt: hourAgo, checksDone: 0 } },
    } as never)
    const view = render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    )
    expect(screen.queryByText(translate("ar", "review.empty"))).toBeNull() // still loading, not "empty"
    state.content = content
    state.isLoading = false
    view.rerender(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    )
    expect(screen.getByText("PROMPT_E1")).toBeTruthy()
  })
})
