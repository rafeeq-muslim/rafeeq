/**
 * LRN-05 placement test, full screen on the night surface. One optional
 * question about time since embracing Islam (kept only in this screen's
 * memory, R2; "this week" asks nothing), then adaptive questions with no
 * marking (R5), at most 6 a round with «اختبر وحدات أخرى؟» after a round
 * answered all right (R3), then a short message saying where the learner
 * starts. Passed units open, not complete.
 */
import * as React from "react"
import { useNavigate } from "react-router"
import { IconArrowLeft, IconX } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Halo, UnitBloom } from "@/components/rafeeq"
import { num, useT } from "@/app/i18n"
import { sendEvent } from "@/app/lib/api"
import { scheduleSync } from "@/app/lib/sync"
import { useLearning } from "@/app/stores/learning"
import { useContent } from "@/app/learning/useContent"
import {
  MAX_QUESTIONS,
  asksQuestions,
  begin,
  passedUnits,
  probes,
  question,
  record,
  stop,
  testMore,
  type PlacementState,
  type Since,
} from "@/app/learning/placement"
import { nextLesson, visibleUnits } from "@/app/learning/path"
import { recordFirstAnswer } from "@/app/learning/answers"
import { ExerciseView, check, emptyValue, ready, type Value } from "@/app/lesson/Exercises"

export default function Placement() {
  const { t } = useT()
  const navigate = useNavigate()
  const { content, isLoading, lessons } = useContent()
  const learning = useLearning()
  const all = React.useMemo(() => (content ? probes(content) : []), [content])
  const [state, setState] = React.useState<PlacementState | null>(null)
  const [value, setValue] = React.useState<Value>(null)

  const q = state ? question(state, all) : null
  React.useEffect(() => {
    if (q) setValue(emptyValue(q))
  }, [q?.id, state?.asked]) // eslint-disable-line react-hooks/exhaustive-deps

  const units = content ? visibleUnits(content.units) : []
  const goHome = () => navigate("/", { replace: true })

  const skip = () => {
    sendEvent({ type: "placement_skipped" })
    learning.set({ placementDone: true })
    goHome()
  }

  const finish = (done: PlacementState) => {
    const passed = passedUnits(done, all)
    learning.unlockUnits(passed)
    // LRN-02 R2: the first path visit after the test lands on the starting unit.
    const start = passed.length ? units.find((u) => !passed.includes(u.id)) : undefined
    learning.set({ placementDone: true, landingUnit: start?.id ?? null })
    sendEvent({ type: "placement_done", value: passed.length }) // R6: the count only
    scheduleSync()
    setState(done)
  }

  const choose = (since: Since) => {
    const s = begin(since, all.length)
    if (!asksQuestions(since)) {
      // R2: "this week" starts at the first lesson, as if the test was skipped.
      sendEvent({ type: "placement_skipped" })
      learning.set({ placementDone: true })
    }
    setState(s)
  }

  const answer = (correct: boolean) => {
    if (!state || !q) return
    if (q.objectives.length) recordFirstAnswer(q, correct, "placement") // R4
    const next = record(state, all, correct)
    if (next.done) finish(next)
    else setState(next)
  }

  // Closing mid-test skips it; on the offer it keeps what was passed; after the result it only leaves.
  const close = () => {
    if (state?.done) return goHome()
    if (state?.offer) {
      finish(stop(state))
      return goHome()
    }
    skip()
  }

  const shell = (children: React.ReactNode, progress?: number) => (
    <main className="dark relative isolate flex min-h-dvh flex-col bg-[linear-gradient(180deg,var(--rf-ink)_0%,var(--rf-deep)_120%)] px-5 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] text-foreground">
      <header className="flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label={t("common.close")} onClick={close} className="text-white">
          <IconX />
        </Button>
        {progress !== undefined && <Progress value={progress} aria-label={t("lesson.progress")} className="h-3 flex-1 bg-white/10" />}
      </header>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 pt-6">{children}</div>
    </main>
  )

  if (isLoading && !content) return shell(null)

  if (all.length === 0) {
    return shell(
      <>
        <p className="text-body text-white/80">{t("placement.unavailable")}</p>
        <Button size="lg" variant="celebrate" className="mt-auto" onClick={skip}>
          {t("placement.go")}
        </Button>
      </>,
    )
  }

  if (!state) {
    const options: [Since, Parameters<typeof t>[0]][] = [
      ["week", "placement.time.week"],
      ["month", "placement.time.month"],
      ["more", "placement.time.more"],
      ["skip", "placement.time.skip"],
    ]
    return shell(
      <>
        <h1 className="font-heading text-h1 font-bold text-balance text-white">{t("placement.time.title")}</h1>
        <p className="text-body text-white/70">{t("placement.time.hint")}</p>
        <ul className="flex flex-col gap-3">
          {options.map(([since, key]) => (
            <li key={since}>
              <button
                type="button"
                onClick={() => choose(since)}
                className="tactile flex h-14 w-full items-center justify-between rounded-card border-2 border-white/15 bg-white/8 px-5 text-start text-body font-bold text-white [--lip:rgb(0_0_0/0.35)]"
              >
                {t(key)}
                <IconArrowLeft className="size-5 ltr:rotate-180" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-auto text-label text-white/60">{t("placement.noScore")}</p>
      </>,
    )
  }

  const passed = passedUnits(state, all)
  const startUnit = units.find((u) => !passed.includes(u.id))
  const bloom = (
    <div className="relative grid place-items-center pt-4">
      <Halo className="absolute -z-10 size-80 text-white/10" />
      <UnitBloom total={Math.max(passed.length, 1) + 1} done={passed.length} size={180} />
    </div>
  )

  if (state.offer) {
    return shell(
      <>
        {bloom}
        <h1 className="font-heading text-h1 font-bold text-balance text-white">{t("placement.more.title")}</h1>
        <p className="text-body text-white/80">{t("placement.more.body", { n: num(MAX_QUESTIONS), unit: startUnit?.title ?? "" })}</p>
        <div className="mt-auto flex flex-col gap-2">
          <Button size="lg" variant="celebrate" onClick={() => setState(testMore(state))}>
            {t("placement.more.yes")}
          </Button>
          <Button size="lg" variant="ghost" className="text-white" onClick={() => finish(stop(state))}>
            {t("placement.more.no")}
          </Button>
        </div>
      </>,
    )
  }

  if (state.done || !q) {
    // R5 and LRN-02 R2: where the learner starts once these units are open.
    const first = nextLesson(lessons, { completed: learning.completed, unlockedUnits: [...learning.unlockedUnits, ...passed] })
    const message = !passed.length
      ? t("placement.result.none", { lesson: first?.title ?? "" })
      : startUnit
        ? t("placement.result.some", { unit: startUnit.title })
        : t("placement.result.all", { lesson: first?.title ?? "" })
    return shell(
      <>
        {bloom}
        <h1 className="font-heading text-h1 font-bold text-balance text-white">{message}</h1>
        <Button size="lg" variant="celebrate" className="mt-auto" onClick={goHome}>
          {t("placement.go")}
        </Button>
      </>,
    )
  }

  return shell(
    <>
      <p className="text-label text-white/60 tabular-nums">{t("placement.question", { i: num(state.asked + 1), n: num(state.limit) })}</p>
      <h1 className="font-heading text-h2 font-bold text-balance text-white">{q.prompt}</h1>
      <div className="rounded-panel bg-background p-3 text-foreground">
        <ExerciseView key={`${q.id}:${state.asked}`} exercise={q} value={value} onChange={setValue} result={null} />
      </div>
      <div className="mt-auto flex flex-col gap-2">
        <Button size="lg" disabled={!ready(q, value)} onClick={() => answer(check(q, value))}>
          {t("lesson.next")}
        </Button>
        <Button variant="ghost" className="text-white/80" onClick={() => answer(false)}>
          {t("placement.notSure")}
        </Button>
      </div>
    </>,
    (state.asked / state.limit) * 100,
  )
}
