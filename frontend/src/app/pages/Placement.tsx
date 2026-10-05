/**
 * LRN-05 placement test, full screen on the night surface. One optional
 * question about time since embracing Islam (kept only in this screen's
 * memory, R2), then adaptive questions with no marking (R5), then a short
 * message saying where the learner starts. Passed units open, not complete.
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
import { MAX_QUESTIONS, begin, passedUnits, probes, question, record, type PlacementState, type Since } from "@/app/learning/placement"
import { recordFirstAnswer } from "@/app/learning/answers"
import { ExerciseView, check, emptyValue, ready, type Value } from "@/app/lesson/Exercises"

export default function Placement() {
  const { t } = useT()
  const navigate = useNavigate()
  const { content, isLoading } = useContent()
  const learning = useLearning()
  const all = React.useMemo(() => (content ? probes(content) : []), [content])
  const [state, setState] = React.useState<PlacementState | null>(null)
  const [value, setValue] = React.useState<Value>(null)

  const q = state ? question(state, all) : null
  React.useEffect(() => {
    if (q) setValue(emptyValue(q))
  }, [q?.id, state?.asked]) // eslint-disable-line react-hooks/exhaustive-deps

  const skip = () => {
    sendEvent({ type: "placement_skipped" })
    learning.set({ placementDone: true })
    navigate("/", { replace: true })
  }

  const answer = (correct: boolean) => {
    if (!state || !q) return
    if (q.objectives.length) recordFirstAnswer(q, correct, "placement") // R4
    const next = record(state, all, correct)
    if (next.done) {
      const units = passedUnits(next, all)
      learning.unlockUnits(units)
      learning.set({ placementDone: true })
      sendEvent({ type: "placement_done", value: units.length }) // R6: the count only
      scheduleSync()
    }
    setState(next)
  }

  const shell = (children: React.ReactNode, progress?: number) => (
    <main className="dark relative isolate flex min-h-dvh flex-col bg-[linear-gradient(180deg,var(--rf-ink)_0%,var(--rf-deep)_120%)] px-5 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] text-foreground">
      <header className="flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label={t("common.close")} onClick={skip} className="text-white">
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
                onClick={() => setState(begin(since, all.length))}
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

  if (state.done || !q) {
    const passed = passedUnits(state, all)
    const startUnit = content!.units.find((u) => !passed.includes(u.id))
    return shell(
      <>
        <div className="relative grid place-items-center pt-4">
          <Halo className="absolute -z-10 size-80 text-white/10" />
          <UnitBloom total={Math.max(passed.length, 1) + 1} done={passed.length} size={180} />
        </div>
        <h1 className="font-heading text-h1 font-bold text-balance text-white">
          {passed.length && startUnit ? t("placement.result.some", { unit: startUnit.title }) : t("placement.result.none")}
        </h1>
        <Button size="lg" variant="celebrate" className="mt-auto" onClick={() => navigate("/", { replace: true })}>
          {t("placement.go")}
        </Button>
      </>,
    )
  }

  return shell(
    <>
      <p className="text-label text-white/60 tabular-nums">{t("placement.question", { i: num(state.asked + 1) })}</p>
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
    (state.asked / MAX_QUESTIONS) * 100,
  )
}
