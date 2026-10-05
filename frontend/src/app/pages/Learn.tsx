/**
 * LRN-02 path: units are months of the first year, lessons are pebbles that
 * zig-zag down the page. R1 done / next / locked; R2 a lesson opens after
 * the one before it (placement unlocks whole units); R3 one clear next step.
 * Team accounts can switch on preview to walk lessons still in review.
 */
import * as React from "react"
import { useNavigate } from "react-router"
import { IconBook2, IconEye } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { LearningPath, PathNode, PathUnitHeader, SpotIllustration, StreakChip, TopBar } from "@/components/rafeeq"
import { num, useT } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { useLearning } from "@/app/stores/learning"
import { useMotivation } from "@/app/stores/motivation"
import { useContent } from "@/app/learning/useContent"
import { lessonStatus, unitProgress, visibleUnits } from "@/app/learning/path"
import { streakView } from "@/app/motivation/streak"

const ZIGZAG = [0, 1, 2, 1, 0, -1, -2, -1] as const

export default function Learn() {
  const { t } = useT()
  const navigate = useNavigate()
  const progress = useLearning()
  const days = useMotivation((s) => s.days)
  const streak = streakView(days)
  const team = useAuth((s) => s.has("team") || s.has("sharia_reviewer"))
  const previewOn = useDevice((s) => s.preview)
  const setDevice = useDevice((s) => s.set)
  const { content, lessons, isLoading, preview } = useContent()
  const nextRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    nextRef.current?.scrollIntoView({ block: "center" })
  }, [content])

  const units = content ? visibleUnits(content.units) : []

  return (
    <>
      <TopBar
        className="sticky top-0"
        title={<span className="font-heading text-h3">{t("path.title")}</span>}
        end={
          streak.count > 0 && (
            <StreakChip
              days={streak.count}
              paused={streak.paused}
              label={t(streak.paused ? "streak.paused" : "streak.days", { n: num(streak.count) })}
            />
          )
        }
      />
      <div className="flex flex-col gap-4 px-4 pt-4 pb-10">
        {team && (
          <div className="flex items-center justify-between gap-3 rounded-md bg-secondary px-4 py-3 text-secondary-foreground">
            <Label htmlFor="preview" className="flex items-center gap-2 text-label">
              <IconEye className="size-4" stroke={1.75} aria-hidden="true" />
              {t("path.preview")}
            </Label>
            <Switch id="preview" checked={previewOn} onCheckedChange={(v) => setDevice({ preview: v })} />
          </div>
        )}

        {isLoading && !content && <Skeleton className="h-96 rounded-card" />}

        {content && units.length === 0 && (
          <section className="flex flex-col items-center gap-3 py-10 text-center">
            <SpotIllustration kind="start" />
            <h2 className="font-heading text-h2 font-bold">{t("path.empty")}</h2>
            <p className="max-w-sm text-body text-muted-foreground">{t("home.preparing")}</p>
          </section>
        )}

        <LearningPath>
          {units.map((unit) => {
            const { done, total } = unitProgress(unit, progress)
            return (
              <React.Fragment key={unit.id}>
                <PathUnitHeader
                  unit={`${t("path.unit", { n: num(unit.order) })} · ${t("path.progress", { done: num(done), total: num(total) })}`}
                  title={unit.title}
                  description={unit.source_credit}
                  className="mt-4 first:mt-0"
                />
                {unit.lessons.map((id, i) => {
                  const lesson = content!.lessons[id]
                  if (!lesson) return null
                  const status = lessonStatus(lesson, lessons, progress)
                  const node = (
                    <PathNode
                      key={id}
                      state={status === "next" ? "current" : status}
                      label={lesson.title}
                      icon={IconBook2}
                      offset={ZIGZAG[i % ZIGZAG.length]}
                      startLabel={t(progress.sessions[id] ? "home.continue" : "common.start")}
                      stateLabels={{ done: t("path.done"), current: t("path.current"), open: t("path.open"), locked: t("path.locked") }}
                      onSelect={() => navigate(`/learn/lesson/${id}`)}
                    />
                  )
                  return (
                    <React.Fragment key={id}>
                      {status === "next" ? <div ref={nextRef} className="contents">{node}</div> : node}
                      {preview && (!lesson.approved || lesson.changed) && (
                        <Badge variant="warning" className="-mt-4">
                          {lesson.changed ? t("path.changed") : t("lesson.preview")}
                        </Badge>
                      )}
                    </React.Fragment>
                  )
                })}
              </React.Fragment>
            )
          })}
        </LearningPath>

        {units.length > 0 && <p className="pt-4 text-center text-label text-muted-foreground">{t("path.more")}</p>}
      </div>
    </>
  )
}
