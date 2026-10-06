/**
 * LRN-10 R5 (with KNW-10 R5): after an answer the learner allowed to shape
 * their learning, and that the server tagged to one objective, one quick
 * exercise on that objective, taken from the approved lessons in the
 * learner's language. Its first answer updates mastery like any first answer
 * (R3) and is recorded as "quick_check"; a mistake is safe and shows the
 * correction from the card text (LRN-03 R3). Only the objective id was used;
 * the question text never reaches Learning.
 */
import * as React from "react"
import { IconBolt } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { useT } from "@/app/i18n"
import { useLearning } from "@/app/stores/learning"
import { useContent } from "@/app/learning/useContent"
import { recordFirstAnswer } from "@/app/learning/answers"
import { ExerciseView, check, emptyValue, incorrectKey, quotesCard, ready, type Result, type Value } from "@/app/lesson/Exercises"
import { pickQuickCheck } from "./quick"

/** Answers already recorded in this app session, so a re-render never counts twice. */
const answered = new Set<string>()

export function QuickCheck({ askId, objectiveId }: { askId: string; objectiveId: string }) {
  const { t } = useT()
  const { content } = useContent()
  // Picked once, when the content is there, so it does not change under the learner.
  const [exercise, setExercise] = React.useState(() => pickQuickCheck(content, objectiveId, useLearning.getState().mastery[objectiveId]))
  React.useEffect(() => {
    if (!exercise && content) setExercise(pickQuickCheck(content, objectiveId, useLearning.getState().mastery[objectiveId]))
  }, [content]) // eslint-disable-line react-hooks/exhaustive-deps
  const [value, setValue] = React.useState<Value>(() => (exercise ? emptyValue(exercise) : null))
  const [result, setResult] = React.useState<Result>(null)

  if (!exercise) return null

  const onCheck = () => {
    if (!ready(exercise, value)) return
    const correct = check(exercise, value)
    if (!answered.has(askId)) {
      answered.add(askId)
      recordFirstAnswer(exercise, correct, "quick_check")
    }
    setResult(correct ? "correct" : "incorrect")
  }

  const lesson = content && Object.values(content.lessons).find((l) => l.exercises.some((e) => e.id === exercise.id))
  const cardText = lesson?.cards
    .filter((c) => exercise.cards.includes(c.id))
    .map((c) => c.text)
    .join("\n")

  return (
    <section aria-labelledby={`quick-${askId}`} className="flex flex-col gap-4 rounded-card border-2 bg-card p-4">
      <p id={`quick-${askId}`} className="flex items-center gap-2 text-label font-bold text-primary">
        <IconBolt className="size-4" stroke={1.75} aria-hidden="true" />
        {t("ask.quickCheck")}
      </p>
      <h2 className="font-heading text-h3 font-bold text-balance">{exercise.prompt}</h2>
      <ExerciseView exercise={exercise} value={value} onChange={setValue} result={result} />
      {result === null ? (
        <Button className="w-full" disabled={!ready(exercise, value)} onClick={onCheck}>
          {t("lesson.check")}
        </Button>
      ) : (
        <div role="status" className="flex flex-col gap-2">
          <p className={result === "correct" ? "text-label font-bold text-success" : "text-label font-bold text-destructive"}>
            {t(result === "correct" ? "lesson.correct" : incorrectKey(exercise))}
          </p>
          {result === "incorrect" && quotesCard(exercise) && cardText && (
            <p className="text-label whitespace-pre-line text-muted-foreground">
              <span className="font-bold">{t("lesson.cardText")}:</span> {cardText}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
