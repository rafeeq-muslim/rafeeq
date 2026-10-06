/**
 * PLT-09 the organized home. Shown only when the PLT-09 setting is on
 * (./setting.ts); otherwise pages/Home.tsx renders the current Home.
 *
 * R1: the header as it is, then ONE next-step card (the short review when
 * due, else the next lesson), then the three main components in the day's
 * order («يومي», «بطاقة اليوم», «اسأل رفيق»), then at most two optional
 * ones, and nothing after them. R2: «يومي» gathers the next prayer
 * (computed on the device), the adhkar of the time, continuing the Quran and
 * the library; it follows the time, its place does not (R5). R6: optional
 * components hide with one tap; no counter, reward or blame anywhere.
 */
import * as React from "react"
import { useNavigate } from "react-router"
import {
  IconArrowLeft,
  IconBook2,
  IconBooks,
  IconClock,
  IconHeadphones,
  IconHeadset,
  IconMicrophone2,
  IconMoon,
  IconRefresh,
  IconSparkles,
  IconSunMoon,
  IconUserCircle,
  IconX,
  type TablerIcon,
} from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { DailyCard, JourneySheet, JourneySky, LessonCard, SpotIllustration } from "@/components/rafeeq"
import { num, useT, type Key } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { useLearning } from "@/app/stores/learning"
import { useMotivation } from "@/app/stores/motivation"
import { useContent } from "@/app/learning/useContent"
import { nextLesson, unitDone } from "@/app/learning/path"
import { progressOf } from "@/app/learning/session"
import { reviewItems } from "@/app/learning/reviewItems"
import { streakView } from "@/app/motivation/streak"
import { HijriToday } from "@/app/practice/HijriToday"
import { useNow, useRamadan } from "@/app/practice/api"
import { dayTimes, formatTime, nextPrayer } from "@/app/practice/times"
import { prayerName } from "@/app/practice/ui"
import { lastSura } from "@/app/discover/player"
import { cardOfDay, dayNumber } from "@/app/discover/daily"
import { useCards } from "@/app/discover/queries"
import type { LibraryItemData } from "@/app/discover/types"
import { localDay } from "@/app/guide/suggest"
import { suraName } from "@/app/lesson/suras"
import { adhkarLine, prayerLine, type MainId, type OptionalId } from "./layout"
import { useHome } from "./store"
import { useDayOrder, useEligibility, useOptional } from "./useOrganized"

const DAY = 86_400_000

export default function OrganizedHome() {
  const { t } = useT()
  const me = useAuth((s) => s.me)
  const firstOpenedAt = useDevice((s) => s.firstOpenedAt)
  const learning = useLearning()
  const days = useMotivation((s) => s.days)
  const { content, lessons, isError, refetch } = useContent()
  const now = useNow(60_000)

  const day = Math.max(1, Math.floor((Date.now() - new Date(firstOpenedAt).getTime()) / DAY) + 1)
  const month = Math.min(12, Math.floor((day - 1) / 30) + 1)
  const streak = streakView(days)
  const petals = content ? content.units.filter((u) => unitDone(u, learning)).length : 0

  // R5: once a day, by the device date. Without content (error) the fixed order follows at once.
  const order = useDayOrder(content ? lessons : isError ? [] : null, localDay(now))
  const { ctx, library } = useEligibility()
  const optional = useOptional(order, ctx)

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
        <HijriToday />
        {streak.paused && <p className="text-body text-muted-foreground">{t("home.welcomeBack")}</p>}

        <NextStep content={content} lessons={lessons} isError={isError} refetch={refetch} />

        {order ? (
          <>
            {order.main.map((id) => (
              <MainComponent key={id} id={id} now={now} />
            ))}
            {optional.map((id) => (
              <OptionalCard key={id} id={id} library={library} />
            ))}
          </>
        ) : (
          <div className="flex flex-col gap-4" aria-busy="true">
            <Skeleton className="h-56 rounded-card" />
            <Skeleton className="h-40 rounded-card" />
            <Skeleton className="h-14 rounded-panel" />
          </div>
        )}
      </JourneySheet>
    </>
  )
}

// --- R1: one card for the next step ------------------------------------------------

function NextStep({
  content,
  lessons,
  isError,
  refetch,
}: Pick<ReturnType<typeof useContent>, "content" | "lessons" | "isError" | "refetch">) {
  const { t } = useT()
  const navigate = useNavigate()
  const learning = useLearning()
  if (!content && isError) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-card bg-card p-5">
        <p className="text-body text-muted-foreground">{t(navigator.onLine ? "common.error" : "common.offline")}</p>
        <Button variant="outline" onClick={() => void refetch()}>
          {t("common.retry")}
        </Button>
      </section>
    )
  }
  if (!content) return <Skeleton className="h-52 rounded-card" />

  // «أو للمراجعة القصيرة حين تستحق، لا بطاقتان»: a due review is the one card.
  const review = reviewItems(content, learning.mastery, new Date(), learning.completed)
  if (review.length > 0) {
    return (
      <button
        type="button"
        data-testid="plt09-next-step"
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
    )
  }
  const next = nextLesson(lessons, learning)
  const unit = next && content.units.find((u) => u.id === next.unit)
  if (next && unit) {
    const session = learning.sessions[next.id]
    return (
      <div data-testid="plt09-next-step">
        <LessonCard
          icon={IconBook2}
          title={next.title}
          meta={t("home.lessonMeta", { i: num(unit.lessons.indexOf(next.id) + 1), n: num(unit.lessons.length) })}
          progress={session ? progressOf(next, session) : 0}
          actionLabel={t(session ? "home.continue" : "home.start")}
          onContinue={() => navigate(`/learn/lesson/${next.id}`)}
        />
      </div>
    )
  }
  return (
    <section data-testid="plt09-next-step" className="flex items-center gap-4 rounded-card bg-card p-5">
      <SpotIllustration kind="start" size={80} className="shrink-0" />
      <p className="text-body text-muted-foreground">{lessons.length ? t("home.allDone") : t("home.preparing")}</p>
    </section>
  )
}

// --- the three main components --------------------------------------------------------

function MainComponent({ id, now }: { id: MainId; now: Date }) {
  if (id === "daily") return <MyDay now={now} />
  if (id === "card") return <TodayCard />
  return <AskRow />
}

/** R2: «يومي». Four tools, each one tap; no counter and nothing about what was done. */
export function MyDay({ now }: { now: Date }) {
  const { t, locale } = useT()
  const navigate = useNavigate()
  const city = useDevice((s) => s.city)
  const { today, isRamadan } = useRamadan(now)
  // Computed here, on the device; the city and the times never leave it (R2 ex3).
  const times = city ? dayTimes(city, today, { ramadan: isRamadan(today) }) : null
  const prayer = prayerLine(city ? nextPrayer(city, now, isRamadan) : null, now)
  const adhkar = adhkarLine(times, now)
  const sura = lastSura()

  return (
    <section aria-labelledby="plt09-daily" data-component="daily" className="flex flex-col gap-2 rounded-card bg-card p-4 shadow-card">
      <h2 id="plt09-daily" className="px-1 font-heading text-h3 font-bold">
        {t("home.org.daily")}
      </h2>
      <ToolRow
        icon={IconClock}
        highlight={prayer.kind === "soon"}
        title={
          prayer.kind === "unknown"
            ? t("home.org.prayerUnknown")
            : prayer.kind === "soon"
              ? t("home.org.soon", { name: prayerName(t, prayer.key), n: num(prayer.minutes) })
              : t("home.org.prayerAt", { name: prayerName(t, prayer.key), time: formatTime(prayer.at, city!.tz) })
        }
        meta={prayer.kind === "unknown" ? undefined : t("practice.nextLabel")}
        onClick={() => navigate("/practice")}
      />
      <ToolRow icon={IconSunMoon} title={t(`home.org.adhkar.${adhkar}` as Key)} onClick={() => navigate("/practice/adhkar")} />
      <ToolRow
        icon={IconHeadphones}
        title={sura ? t("home.org.quranContinue", { name: suraName(sura, locale) }) : t("discover.quran")}
        onClick={() => navigate(sura ? `/discover/quran/${sura}` : "/discover/quran")}
      />
      <ToolRow icon={IconBooks} title={t("discover.library")} meta={t("home.org.libraryMeta")} onClick={() => navigate("/discover/library")} />
    </section>
  )
}

function ToolRow({ icon: Icon, title, meta, highlight, onClick }: { icon: TablerIcon; title: string; meta?: string; highlight?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-highlight={highlight ? "true" : undefined}
      className={cn("flex min-h-12 items-center gap-3 rounded-md px-1 py-2 text-start", highlight && "bg-secondary px-3 text-secondary-foreground")}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
        <Icon className="size-5" stroke={1.75} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-bold tabular-nums">{title}</span>
        {meta && <span className="block text-label text-muted-foreground">{meta}</span>}
      </span>
      <IconArrowLeft className="size-5 shrink-0 text-primary ltr:rotate-180" aria-hidden="true" />
    </button>
  )
}

/** KNW-07 «بطاقة اليوم», as on the Discover hub. */
function TodayCard() {
  const { t, locale } = useT()
  const navigate = useNavigate()
  const cards = useCards(locale)
  const today = cards.data ? cardOfDay(cards.data.cards, cards.data.total, dayNumber(new Date()), cards.data.previous) : null
  return (
    <div data-component="card">
      {cards.isLoading ? (
        <Skeleton className="h-40 rounded-card" />
      ) : today ? (
        <DailyCard
          eyebrow={t("discover.daily")}
          title={today.title}
          meta={t("discover.dailyMeta")}
          actionLabel={t("discover.dailyOpen")}
          onOpen={() => navigate("/discover/card")}
        />
      ) : (
        <section aria-label={t("discover.daily")} className="rounded-card bg-muted p-5">
          <p className="text-label font-bold text-muted-foreground">{t("discover.daily")}</p>
          <p className="text-body text-muted-foreground">{cards.isError ? t("discover.loadError") : t("discover.dailyNone")}</p>
        </section>
      )}
    </div>
  )
}

/** KNW-01 «اسأل رفيق». */
function AskRow() {
  const { t } = useT()
  const navigate = useNavigate()
  return (
    <button
      type="button"
      data-component="ask"
      onClick={() => navigate("/ask")}
      className="flex h-14 items-center gap-3 rounded-panel bg-card px-5 text-start text-body text-muted-foreground shadow-card"
    >
      <IconSparkles className="size-5 text-primary" stroke={1.75} aria-hidden="true" />
      {t("home.askPlaceholder")}
    </button>
  )
}

// --- R3, R6: the optional components ------------------------------------------------

const OPTIONAL_COPY: Record<Exclude<OptionalId, "library">, { icon: TablerIcon; title: Key; body: Key; cta: Key; route: string }> = {
  ramadan: { icon: IconMoon, title: "guide.suggest.ramadan.title", body: "guide.suggest.ramadan.body", cta: "guide.suggest.ramadan.cta", route: "/practice" },
  human: { icon: IconHeadset, title: "guide.suggest.human.title", body: "guide.suggest.human.body", cta: "guide.suggest.human.cta", route: "/mentor" },
  save: { icon: IconUserCircle, title: "me.save", body: "me.saveBody", cta: "home.saveCta", route: "/me/account" },
  reciter: { icon: IconMicrophone2, title: "home.org.reciter.title", body: "home.org.reciter.body", cta: "home.org.reciter.cta", route: "/discover/quran" },
}

export function OptionalCard({ id, library }: { id: OptionalId; library: LibraryItemData | null }) {
  const { t } = useT()
  const navigate = useNavigate()
  const hide = useHome((s) => s.hide)
  const copy =
    id === "library"
      ? { icon: IconBooks, title: t("home.org.library.title"), body: library?.title ?? "", cta: t("home.org.library.cta"), route: library ? `/discover/library/${library.id}` : "/discover/library" }
      : {
          ...OPTIONAL_COPY[id],
          title: t(OPTIONAL_COPY[id].title),
          body: t(OPTIONAL_COPY[id].body),
          cta: t(OPTIONAL_COPY[id].cta),
          // KNW-08: the reciter picker is on the surah page; open the one last listened to.
          route: id === "reciter" ? `/discover/quran/${lastSura() ?? 1}` : OPTIONAL_COPY[id].route,
        }
  const Icon = copy.icon
  const titleId = React.useId()
  return (
    <section aria-labelledby={titleId} data-optional={id} className="flex items-start gap-3 rounded-card bg-card p-4 shadow-card">
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
        <Icon className="size-6" stroke={1.75} aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id={titleId} className="text-body font-bold">
          {copy.title}
        </h2>
        {copy.body && (
          <p dir="auto" className="text-label text-muted-foreground">
            {copy.body}
          </p>
        )}
        <Button variant="secondary" size="sm" className="mt-2 self-start" onClick={() => navigate(copy.route)}>
          {copy.cta}
        </Button>
      </div>
      <Button variant="ghost" size="icon" className="-me-2 -mt-2 shrink-0 text-muted-foreground" aria-label={t("home.org.hide")} onClick={() => hide(id)}>
        <IconX stroke={1.75} />
      </Button>
    </section>
  )
}
