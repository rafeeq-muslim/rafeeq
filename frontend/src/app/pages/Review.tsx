/**
 * LRN-04 review session: up to five objectives, one exercise each (R2),
 * first answers update mastery (R3), wrong ones come back before the end,
 * and finishing counts as a learning day (R5). Never blocks lessons (R4).
 */
import * as React from "react"
import { useNavigate } from "react-router"
import { IconFlame, IconX } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { CelebrationScreen, ExerciseFeedback, SpotIllustration, UnitBloom } from "@/components/rafeeq"
import { num, useT } from "@/app/i18n"
import { sendEvent } from "@/app/lib/api"
import { reportLearnedToday } from "@/app/lib/push"
import { scheduleSync } from "@/app/lib/sync"
import { useLearning } from "@/app/stores/learning"
import { useMotivation } from "@/app/stores/motivation"
import { useContent } from "@/app/learning/useContent"
import { reviewItems } from "@/app/learning/reviewItems"
import { levelOf } from "@/app/learning/bkt"
import { recordFirstAnswer } from "@/app/learning/answers"
import { GuideNote, noteGuideFollowed } from "@/app/learning/GuideNote"
import type { Content, Exercise } from "@/app/learning/types"
import { LessonHelpButton } from "@/app/lesson/LessonHelpButton"
import { check, emptyValue, ExerciseView, incorrectKey, quotesCard, ready, useFooterSpace, type Result, type Value } from "@/app/lesson/Exercises"

export default function Review() {
  const { content, isError } = useContent()
  // Issue #9 item 17: opened by its link or after a reload, the content
  // arrives after the first render (or the request waits, offline).
  if (!content && !isError) {
    return (
      <div className="flex flex-col gap-4 p-5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    )
  }
  return <ReviewSession content={content} />
}

function ReviewSession({ content }: { content: Content | undefined }) {
  const { t } = useT()
  const navigate = useNavigate()
  const learning = useLearning()
  // Issue #9 item 17: the list follows the content and the progress (which
  // may arrive after the first render, e.g. from the account) until the
  // first answer; from then on it stays fixed for the session.
  const live = React.useMemo(
    () => (content ? reviewItems(content, learning.mastery, new Date(), learning.completed) : []),
    [content, learning.mastery, learning.completed],
  )
  const [frozen, setFrozen] = React.useState<typeof live | null>(null)
  const items = frozen ?? live
  const [queueState, setQueue] = React.useState<string[] | null>(null)
  const queue = queueState ?? items.map((i) => i.exercise.id)
  const [tried, setTried] = React.useState<string[]>([])
  const [value, setValue] = React.useState<Value>(null)
  const [result, setResult] = React.useState<Result>(null)
  const [attempt, setAttempt] = React.useState(0)
  const [footer, footerHeight] = useFooterSpace<HTMLElement>()
  const [finished, setFinished] = React.useState<string[] | null>(null)
  React.useEffect(() => noteGuideFollowed("/learn/review"), [])

  const byId = React.useMemo(() => new Map(items.map((i) => [i.exercise.id, i])), [items])
  const item = queue[0] ? byId.get(queue[0]) : undefined
  const exercise: Exercise | undefined = item?.exercise

  React.useEffect(() => {
    if (exercise) setValue(emptyValue(exercise))
  }, [exercise?.id, attempt]) // eslint-disable-line react-hooks/exhaustive-deps

  if (finished) return <ReviewDone badges={finished} objectives={items.map((i) => i.objectiveId)} />

  if (!content || items.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <SpotIllustration kind="saved" />
        <p className="text-body text-muted-foreground">{t("review.empty")}</p>
        <Button onClick={() => navigate("/")}>{t("lesson.backHome")}</Button>
      </div>
    )
  }

  const onCheck = () => {
    if (!exercise || !item || !ready(exercise, value)) return
    const correct = check(exercise, value)
    if (!frozen) setFrozen(items)
    if (!tried.includes(exercise.id)) {
      const wasMastered = levelOf(learning.mastery[item.objectiveId]) === "mastered"
      recordFirstAnswer(exercise, correct, "review")
      if (wasMastered && correct) learning.markChecked(item.objectiveId)
      setTried((x) => [...x, exercise.id])
    }
    setResult(correct ? "correct" : "incorrect")
  }

  const onContinue = () => {
    const rest = queue.slice(1)
    const next = result === "correct" ? rest : [...rest, queue[0]]
    setResult(null)
    setAttempt((a) => a + 1)
    if (next.length === 0) {
      const { newBadges } = useMotivation.getState().recordLearningDay()
      sendEvent({ type: "review_completed" })
      void reportLearnedToday()
      scheduleSync()
      setFinished(newBadges)
    }
    setQueue(next)
    const upcoming = next[0] ? byId.get(next[0])?.exercise : undefined
    if (upcoming) setValue(emptyValue(upcoming)) // reset before the next exercise renders
  }

  const cardText = exercise
    ? Object.values(content.lessons)
        .flatMap((l) => l.cards)
        .filter((c) => exercise.cards.includes(c.id))
        .map((c) => c.text)
        .join("\n")
    : ""
  const done = items.length - new Set(queue).size
  // CMP-01 R1: the assistant gets the topic of the lesson this exercise belongs to, nothing else.
  const topic = exercise ? (Object.values(content.lessons).find((l) => l.exercises.some((e) => e.id === exercise.id))?.title ?? "") : ""

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background px-3 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] pb-2">
        <Button variant="ghost" size="icon" aria-label={t("common.close")} onClick={() => navigate("/")}>
          <IconX />
        </Button>
        <Progress value={(done / items.length) * 100} aria-label={t("review.title")} className="h-3.5 flex-1" />
        <LessonHelpButton from="review" topic={topic} />
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-5 pt-3 pb-40" style={footerHeight ? { paddingBottom: footerHeight + 24 } : undefined}>
        {exercise && (
          <>
            <Badge variant="secondary" className="w-fit">
              {t("review.title")}
            </Badge>
            <h1 className="font-heading text-h2 font-bold text-balance">{exercise.prompt}</h1>
            <ExerciseView key={`${exercise.id}:${attempt}`} round={attempt} exercise={exercise} value={value} onChange={setValue} result={result} />
          </>
        )}
      </main>
      <footer ref={footer} className="fixed inset-x-0 bottom-0 z-20">
        {result ? (
          <ExerciseFeedback
            result={result}
            title={t(result === "correct" ? "lesson.correct" : exercise ? incorrectKey(exercise) : "lesson.incorrect")}
            explanation={result === "incorrect" && exercise && quotesCard(exercise) ? `${t("lesson.cardText")}: ${cardText}` : undefined}
            actionLabel={t("common.continue")}
            onContinue={onContinue}
            className="mx-auto max-w-xl"
          />
        ) : (
          <div className="mx-auto flex max-w-xl border-t bg-background px-5 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
            <Button size="lg" className="flex-1" disabled={!exercise || !ready(exercise, value)} onClick={onCheck}>
              {t("lesson.check")}
            </Button>
          </div>
        )}
      </footer>
    </div>
  )
}

export function ReviewDone({ badges: initial, objectives }: { badges: string[]; objectives: string[] }) {
  const { t } = useT()
  const { lessons } = useContent()
  const navigate = useNavigate()
  const popPending = useMotivation((s) => s.popPending)
  const [badges, setBadges] = React.useState(initial)
  if (badges[0]) {
    const id = badges[0]
    const n = Number(id.slice(5))
    // MOT-03 R4: announced once; either button takes it off the queue.
    const dismiss = () => {
      popPending(id)
      setBadges((b) => b.slice(1))
    }
    return (
      <CelebrationScreen
        className="min-h-dvh"
        icon={IconFlame}
        badgeLabel={t("lesson.streakBadge", { n: num(n) })}
        title={t("lesson.streakTitle", { n: num(n) })}
        primaryLabel={t("common.continue")}
        onPrimary={dismiss}
        secondaryLabel={t("lesson.backHome")}
        onSecondary={() => {
          dismiss()
          navigate("/")
        }}
      />
    )
  }
  return (
    <section className="dark flex min-h-dvh flex-col items-center bg-[radial-gradient(120%_70%_at_50%_25%,var(--rf-deep)_0%,var(--rf-ink)_72%)] px-6 pt-[calc(env(safe-area-inset-top,0px)+4rem)] pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] text-center">
      <UnitBloom total={5} done={5} size={180} />
      <h1 className="mt-8 font-heading text-h1 font-bold text-white">{t("review.done")}</h1>
      <GuideNote lessons={lessons} objectives={objectives} />
      <Button size="lg" variant="celebrate" className="mt-auto w-full max-w-sm" onClick={() => navigate("/", { replace: true })}>
        {t("lesson.backHome")}
      </Button>
    </section>
  )
}
