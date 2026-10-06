// @vitest-environment jsdom
/** LRN-03 R3 examples: what a learner sees after a mistake (PR #20). */
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import type { MatchExercise, OrderExercise } from "@/app/learning/types"
import { ExerciseView, incorrectKey, quotesCard } from "./Exercises"

afterEach(cleanup)

const order = {
  id: "e1",
  type: "order",
  prompt: "Order the first steps of wudu",
  objectives: [],
  cards: ["c1"],
  items: [
    { id: "intent", text: "Intention" },
    { id: "hands", text: "Wash the hands" },
    { id: "mouth", text: "Rinse the mouth" },
  ],
  answer: ["intent", "hands", "mouth"],
} as unknown as OrderExercise

const match = {
  id: "e2",
  type: "match",
  prompt: "Match each word with its meaning",
  objectives: [],
  cards: ["c1"],
  left: [
    { id: "m", text: "Madmada" },
    { id: "i", text: "Istinshaq" },
  ],
  right: [
    { id: "mm", text: "Rinsing the mouth" },
    { id: "nn", text: "Rinsing the nose" },
  ],
  answer: [
    ["m", "mm"],
    ["i", "nn"],
  ],
} as unknown as MatchExercise

describe("lrn-03-r3 after a mistake", () => {
  it("ordering keeps the learner's order and marks misplaced steps with their right number", () => {
    // Joseph put rinsing the mouth before washing the hands.
    render(<ExerciseView exercise={order} value={["intent", "mouth", "hands"]} onChange={() => {}} result="incorrect" />)
    const steps = screen.getAllByRole("listitem").map((li) => li.textContent ?? "")
    expect(steps[0]).toMatch(/^1Intention$/)
    expect(steps[1]).toMatch(/^3Rinse the mouth/) // his order, marked with its right place (3)
    expect(steps[2]).toMatch(/^2Wash the hands/) // marked with its right place (2)
    expect(quotesCard(order)).toBe(false)
    expect(incorrectKey(order)).toBe("lesson.incorrectOrder")
  })

  it("matching keeps the learner's pairs and shows the right partner of each wrong one", () => {
    render(
      <ExerciseView
        exercise={match}
        value={[
          ["m", "nn"],
          ["i", "mm"],
        ]}
        onChange={() => {}}
        result="incorrect"
      />,
    )
    expect(screen.getByText("Madmada").parentElement?.textContent).toContain("Rinsing the mouth")
    expect(screen.getByText("Istinshaq").parentElement?.textContent).toContain("Rinsing the nose")
    expect(incorrectKey(match)).toBe("lesson.incorrectMatch")
    expect(quotesCard(match)).toBe(true)
  })

  it("a correct pair is not marked wrong", () => {
    render(
      <ExerciseView
        exercise={match}
        value={[
          ["m", "mm"],
          ["i", "nn"],
        ]}
        onChange={() => {}}
        result="correct"
      />,
    )
    expect(screen.getByText("Madmada").closest("button")?.textContent).not.toContain("Rinsing")
  })
})
