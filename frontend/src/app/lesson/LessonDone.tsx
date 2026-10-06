/**
 * After LRN-03 R4: a short word of encouragement on the night surface,
 * where the unit's flower gains the petal just earned. New badges (MOT-03:
 * the unit, or 7/30/66 learning days) are celebrated first, one at a time.
 * Then one clear next step (LRN-02 R3).
 */
import * as React from "react"
import { useNavigate } from "react-router"
import { IconArrowLeft, IconFlame, IconFlower } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { CelebrationScreen, Halo, UnitBloom } from "@/components/rafeeq"
import { num, useT } from "@/app/i18n"
import { useLearning } from "@/app/stores/learning"
import { useMotivation } from "@/app/stores/motivation"
import { useContent } from "@/app/learning/useContent"
import { nextLesson } from "@/app/learning/path"
import type { Completion } from "@/app/learning/complete"
import { GuideNote } from "@/app/learning/GuideNote"
import { badgeView } from "@/app/motivation/badges"
import type { Lesson } from "@/app/learning/types"

export function LessonDone({ lesson, completion }: { lesson: Lesson; completion: Completion }) {
  const { t } = useT()
  const navigate = useNavigate()
  const { content, lessons } = useContent()
  const progress = useLearning()
  const popPending = useMotivation((s) => s.popPending)
  const [badges, setBadges] = React.useState(completion.badges)

  const unit = content?.units.find((u) => u.id === lesson.unit)
  const next = nextLesson(lessons, progress)

  // MOT-03 R3: a badge whose name is not approved in this language stays
  // queued (pending) and unseen; R4: each shown badge leaves the queue once.
  const shown = badges.map((id) => [id, badgeView(id, content, (n) => t("lesson.streakBadge", { n: num(n) }))] as const).find(([, v]) => v)
  if (shown) {
    const [id, view] = shown
    const dismiss = () => {
      popPending(id)
      setBadges((b) => b.filter((x) => x !== id))
    }
    const streakDays = view!.days ?? null
    return (
      <CelebrationScreen
        className="min-h-dvh"
        icon={streakDays ? IconFlame : IconFlower}
        badgeLabel={view!.label}
        title={streakDays ? t("lesson.streakTitle", { n: num(streakDays) }) : t("lesson.unitDone", { name: view!.unitTitle ?? unit?.title ?? "" })}
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

  const total = unit?.lessons.length ?? 1
  const done = unit ? unit.lessons.filter((id) => progress.completed[id]).length : 1
  const fresh = unit ? unit.lessons.indexOf(lesson.id) : 0

  return (
    <section
      aria-labelledby="done-title"
      className="dark relative isolate flex min-h-dvh flex-col items-center bg-[radial-gradient(120%_70%_at_50%_25%,var(--rf-deep)_0%,var(--rf-ink)_72%)] px-6 pt-[calc(env(safe-area-inset-top,0px)+4rem)] pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] text-center"
    >
      <div className="relative grid place-items-center">
        <Halo className="absolute -z-10 size-[22rem] text-white/[0.08]" />
        <UnitBloom total={total} done={done} fresh={completion.isRepeat ? undefined : fresh} size={220} label={t("path.progress", { done: num(done), total: num(total) })} />
      </div>
      <h1 id="done-title" className="mt-8 font-heading text-h1 font-bold text-balance text-white">
        {t("lesson.finish")}
      </h1>
      <p className="mt-2 max-w-xs text-body text-white/75">{completion.isRepeat ? lesson.title : t("lesson.doneBody")}</p>
      <GuideNote lessons={lessons} objectives={lesson.objectives.map((o) => o.id)} returning={completion.resumedAfterPause} />

      <div className="mt-auto flex w-full max-w-sm flex-col gap-3 pt-10">
        {next ? (
          <Button size="lg" variant="celebrate" className="w-full" onClick={() => navigate(`/learn/lesson/${next.id}`, { replace: true })}>
            {t("lesson.nextLesson", { name: next.title })}
            <IconArrowLeft data-icon="inline-end" className="ltr:rotate-180" />
          </Button>
        ) : null}
        <Button size="lg" variant={next ? "outline" : "celebrate"} className="w-full" onClick={() => navigate("/", { replace: true })}>
          {t("lesson.backHome")}
        </Button>
      </div>
    </section>
  )
}
