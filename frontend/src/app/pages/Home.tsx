/**
 * Home: the night sky with the year flower (MOT-02 streak, LRN-02 next
 * step), then one clear next action on the mist sheet (LRN-02 R3), a short
 * review when objectives need it (LRN-04), the assistant, and, after the
 * first lesson, a quiet offer to save progress (PLT-02 R1).
 */
import { useNavigate } from "react-router"
import { IconArrowLeft, IconBook2, IconLayoutGrid, IconRefresh, IconSparkles } from "@tabler/icons-react"
import { SuggestionCard } from "@/app/guide/SuggestionCard"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { JourneySheet, JourneySky, LessonCard, SpotIllustration } from "@/components/rafeeq"
import { num, useT } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { useLearning } from "@/app/stores/learning"
import { useMotivation } from "@/app/stores/motivation"
import { useContent } from "@/app/learning/useContent"
import { nextLesson, unitDone } from "@/app/learning/path"
import { progressOf } from "@/app/learning/session"
import { reviewItems } from "@/app/learning/reviewItems"
import { streakView } from "@/app/motivation/streak"
// MOT audit gaps: badges missed while closed (MOT-03 R4); in-app reminder without push (MOT-05)
import { PendingBadges } from "@/app/motivation/PendingBadges"
import { InAppReminder } from "@/app/motivation/InAppReminder"

const DAY = 86_400_000

export default function Home() {
  const { t } = useT()
  const navigate = useNavigate()
  const me = useAuth((s) => s.me)
  const firstOpenedAt = useDevice((s) => s.firstOpenedAt)
  const dismissedSave = useDevice((s) => s.dismissedSaveSheet)
  const setDevice = useDevice((s) => s.set)
  const learning = useLearning()
  const days = useMotivation((s) => s.days)
  const { content, lessons, isError, refetch } = useContent()

  const day = Math.max(1, Math.floor((Date.now() - new Date(firstOpenedAt).getTime()) / DAY) + 1)
  const month = Math.min(12, Math.floor((day - 1) / 30) + 1)
  const streak = streakView(days)
  const petals = content ? content.units.filter((u) => unitDone(u, learning)).length : 0

  const next = nextLesson(lessons, learning)
  const unit = next && content?.units.find((u) => u.id === next.unit)
  const session = next ? learning.sessions[next.id] : undefined
  const review = content ? reviewItems(content, learning.mastery, new Date(), learning.completed) : []
  const completedCount = Object.keys(learning.completed).length

  return (
    <>
      <JourneySky
        name={me?.display_name}
        greeting={t("home.greeting")}
        day={day}
        dayLabel={t("home.day", { n: num(day) })}
        month={petals}
        monthLabel={t("home.month", { n: num(month) })}
        streakDays={streak.count}
        streakPaused={streak.paused}
        streakLabel={streak.count === 0 ? t("streak.none") : t(streak.paused ? "streak.paused" : "streak.days", { n: num(streak.count) })}
        label={t("app.tagline")}
      />
      <JourneySheet className="pb-8">
        {streak.paused && <p className="text-body text-muted-foreground">{t("home.welcomeBack")}</p>}
        <InAppReminder />

        {/* Issue #9 item 19: until the content is here (loading, paused offline,
            or retrying) a skeleton, never the "lessons are with the reviewer"
            message; that one is only for loaded content with no lesson. */}
        {!content && isError ? (
          <section className="flex flex-col items-start gap-3 rounded-card bg-card p-5">
            <p className="text-body text-muted-foreground">{t(navigator.onLine ? "common.error" : "common.offline")}</p>
            <Button variant="outline" onClick={() => void refetch()}>
              {t("common.retry")}
            </Button>
          </section>
        ) : !content ? (
          <Skeleton className="h-52 rounded-card" />
        ) : next && unit ? (
          <LessonCard
            icon={IconBook2}
            title={next.title}
            meta={t("home.lessonMeta", { i: num(unit.lessons.indexOf(next.id) + 1), n: num(unit.lessons.length) })}
            progress={session ? progressOf(next, session) : 0}
            actionLabel={t(session ? "home.continue" : "home.start")}
            onContinue={() => navigate(`/learn/lesson/${next.id}`)}
          />
        ) : (
          <section className="flex items-center gap-4 rounded-card bg-card p-5">
            <SpotIllustration kind="start" size={80} className="shrink-0" />
            <p className="text-body text-muted-foreground">{lessons.length ? t("home.allDone") : t("home.preparing")}</p>
          </section>
        )}

        {review.length > 0 && (
          <button
            type="button"
            onClick={() => navigate("/learn/review")}
            className="tactile flex items-center gap-3 rounded-card border-2 bg-card p-4 text-start [--lip:var(--outline-lip)]"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
              <IconRefresh className="size-6" stroke={1.75} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body font-bold">{t("home.review")}</span>
              <span className="block text-label text-muted-foreground tabular-nums">{t("home.reviewBody", { n: num(review.length) })}</span>
            </span>
            <IconArrowLeft className="size-5 text-primary ltr:rotate-180" aria-hidden="true" />
          </button>
        )}

        <SuggestionCard />

        <button
          type="button"
          onClick={() => navigate("/ask")}
          className="flex h-14 items-center gap-3 rounded-panel bg-card px-5 text-start text-body text-muted-foreground shadow-card"
        >
          <IconSparkles className="size-5 text-primary" stroke={1.75} aria-hidden="true" />
          {t("home.askPlaceholder")}
        </button>

        {!me && completedCount > 0 && !dismissedSave && (
          <section className="flex flex-col gap-3 border-t pt-5" aria-labelledby="save-title">
            <h2 id="save-title" className="font-heading text-h3 font-bold">
              {t("me.save")}
            </h2>
            <p className="text-body text-muted-foreground">{t("me.saveBody")}</p>
            <div className="flex gap-2">
              <Button onClick={() => navigate("/me/account")}>{t("home.saveCta")}</Button>
              <Button variant="ghost" onClick={() => setDevice({ dismissedSaveSheet: true })}>
                {t("common.later")}
              </Button>
            </div>
          </section>
        )}
        {/* PLT-08 R5: the sheet shows there is more below the journey. */}
        <button
          type="button"
          onClick={() => navigate("/guide")}
          className="flex items-center gap-3 border-t pt-5 text-start"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
            <IconLayoutGrid className="size-5" stroke={1.75} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-body font-bold">{t("guide.homeLink")}</span>
            <span className="block text-label text-muted-foreground">{t("guide.homeLinkBody")}</span>
          </span>
          <IconArrowLeft className="size-5 shrink-0 text-primary ltr:rotate-180" aria-hidden="true" />
        </button>
      </JourneySheet>
      <PendingBadges />
    </>
  )
}
