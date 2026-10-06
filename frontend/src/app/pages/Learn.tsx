/**
 * LRN-02 path: units are months of the first year, lessons are pebbles that
 * zig-zag down the page. R1 done / next / locked; R2 a lesson opens after
 * the one before it (placement unlocks whole units, which read «اجتزتها في
 * اختبار تحديد المستوى», and the first visit after it lands on the starting
 * unit); R3 one clear next step.
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
import { lessonStatus, unitLessonIds, unitPassed, unitProgress, visibleUnits } from "@/app/learning/path"
import { streakView } from "@/app/motivation/streak"
import { DownloadControl } from "@/app/downloads/DownloadControl" // PLT-12 R1

const ZIGZAG = [0, 1, 2, 1, 0, -1, -2, -1] as const
const unitAnchor = (unitId: string) => `unit-${unitId}`

export default function Learn() {
  const { t, locale } = useT()
  const navigate = useNavigate()
  const progress = useLearning()
  const days = useMotivation((s) => s.days)
  const streak = streakView(days)
  const team = useAuth((s) => s.has("team") || s.has("sharia_reviewer"))
  const previewOn = useDevice((s) => s.preview)
  const setDevice = useDevice((s) => s.set)
  const { content, lessons, preview } = useContent()
  const nextRef = React.useRef<HTMLDivElement>(null)
  const landingUnit = useLearning((s) => s.landingUnit)
  const setLearning = useLearning((s) => s.set)

  React.useEffect(() => {
    if (!content) return
    // R2: the first visit after placement lands on the starting unit, once.
    const landing = landingUnit ? document.getElementById(unitAnchor(landingUnit)) : null
    if (landingUnit) setLearning({ landingUnit: null })
    if (landing) landing.scrollIntoView({ block: "start" })
    else nextRef.current?.scrollIntoView({ block: "center" })
  }, [content]) // eslint-disable-line react-hooks/exhaustive-deps

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

        {!content && <Skeleton className="h-96 rounded-card" />}

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
            // R2: a unit passed in placement says so instead of «0 من 7».
            const status = unitPassed(unit, progress) ? t("path.passed") : t("path.progress", { done: num(done), total: num(total) })
            return (
              <React.Fragment key={unit.id}>
                <PathUnitHeader
                  id={unitAnchor(unit.id)}
                  unit={`${t("path.unit", { n: num(unit.order) })} · ${status}`}
                  title={unit.title}
                  description={unit.source_credit}
                  className="mt-4 scroll-mt-20 first:mt-0"
                />
                {/* PLT-12 R1: download this unit, in place */}
                <li className="-mt-3 self-end">
                  <DownloadControl itemId={`unit:${unit.id}:${locale}`} lang={locale} />
                </li>
                {unitLessonIds(unit).map((id, i) => {
                  const lesson = content!.lessons[id]
                  // LRN-01 R6 / LRN-02 R3: a lesson not live in this language shows as in preparation,
                  // never as a machine translation, and it keeps the unit from counting as complete.
                  if (!lesson)
                    return (
                      <PathNode
                        key={id}
                        state="locked"
                        label={t("path.inReview")}
                        icon={IconBook2}
                        offset={ZIGZAG[i % ZIGZAG.length]}
                        stateLabels={{ done: t("path.done"), current: t("path.current"), open: t("path.open"), locked: t("path.locked") }}
                      />
                    )
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
