/**
 * Practice home (PRC-01, PRC-04, PRC-05, PRC-07, PRC-02): the sky over the
 * city, today's times, Ramadan when it is near, and the daily tools.
 * Everything is computed on the device; the city never leaves it.
 */
import { useNavigate } from "react-router"
import { IconBell, IconCompass, IconLeaf, IconMapPin, IconMoonStars, IconSparkles } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { JourneySheet } from "@/components/rafeeq"
import { useT, type Key } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { useLines, useNow, useRamadan } from "./api"
import { orderedGroups, suggestGroup } from "./adhkar"
import { cityName } from "./cities"
import { hijriOf, type RamadanState } from "./hijri"
import { countOf } from "./plural"
import { PrayerSky } from "./PrayerSky"
import { usePractice } from "./store"
import { currentPrayer, dayTimes, fastingTimes, formatTime, formatTimeFull, nextPrayer, qiblaBearing, splitDuration, TIME_KEYS, type DayTimes, type YMD } from "./times"
import { durationLabel, NavRow, prayerName, SectionTitle } from "./ui"

const DATE_TAG: Record<string, string> = { ar: "ar-u-nu-latn", en: "en-US", tl: "fil-PH" }

function TodayList({ times, now, tz }: { times: DayTimes; now: Date; tz: string }) {
  const { t } = useT()
  const cur = currentPrayer(times, now)
  return (
    <section aria-labelledby="today-title" className="flex flex-col gap-3">
      <SectionTitle id="today-title">{t("practice.today")}</SectionTitle>
      <ol className="flex flex-col">
        {TIME_KEYS.map((k) => {
          const isCur = k === cur && k !== ("sunrise" as string)
          return (
            <li
              key={k}
              aria-current={isCur ? "time" : undefined}
              className={cn(
                "flex min-h-12 items-center gap-3 border-b border-border/70 px-1 last:border-b-0",
                k === "sunrise" && "text-muted-foreground",
                isCur && "rounded-md border-transparent bg-secondary px-3 text-secondary-foreground"
              )}
            >
              <span className={cn("flex-1 text-body", k !== "sunrise" && "font-medium")}>{prayerName(t, k)}</span>
              {isCur && <Badge variant="outline">{t("practice.now")}</Badge>}
              <span className="text-body font-bold tabular-nums">{formatTime(times[k], tz)}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export function RamadanCard({
  state,
  place,
  today,
  now,
  tz,
  line,
}: {
  state: RamadanState
  place: { lat: number; lng: number; country: string }
  today: YMD
  now: Date
  tz: string
  line?: string
}) {
  const { t, locale } = useT()
  const dateFmt = new Intl.DateTimeFormat(DATE_TAG[locale] ?? "en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
  if (state.kind === "upcoming") {
    if (state.daysLeft > 30) return null
    const start = dateFmt.format(new Date(Date.UTC(state.start.y, state.start.m - 1, state.start.d)))
    return (
      <section aria-labelledby="ramadan-title" className="flex flex-col gap-2 rounded-card bg-card p-5 shadow-card">
        <div className="flex items-center gap-2">
          <IconMoonStars className="size-5 text-primary" stroke={1.75} aria-hidden="true" />
          <h2 id="ramadan-title" className="flex-1 font-heading text-h3 font-bold">
            {t("practice.ramadan.title")}
          </h2>
          <Badge variant={state.announced ? "success" : "outline"}>{t(state.announced ? "practice.ramadan.announced" : "practice.ramadan.expected")}</Badge>
        </div>
        <p className="text-body tabular-nums">{t("practice.ramadan.in", { count: countOf(locale, "days", state.daysLeft), date: start })}</p>
        {!state.announced && <p className="text-label text-muted-foreground">{place.country === "SA" ? t("practice.ramadan.bySighting") : line}</p>}
      </section>
    )
  }
  // PRC-04 R2: by calculation alone the day is only expected; no fasting times until a sighting is announced.
  if (!state.announced) {
    return (
      <section aria-labelledby="ramadan-title" className="flex flex-col gap-2 rounded-card bg-card p-5 shadow-card">
        <div className="flex items-center gap-2">
          <IconMoonStars className="size-5 text-primary" stroke={1.75} aria-hidden="true" />
          <h2 id="ramadan-title" className="flex-1 font-heading text-h3 font-bold">
            {t("practice.ramadan.title")}
          </h2>
          <Badge variant="outline">{t("practice.ramadan.expected")}</Badge>
        </div>
        <p className="text-body tabular-nums">{t("practice.ramadan.expectedDay", { n: state.day })}</p>
        <p className="text-label text-muted-foreground">{place.country === "SA" ? t("practice.ramadan.bySighting") : line}</p>
      </section>
    )
  }
  const f = fastingTimes(place, today)
  const beforeIftar = now >= f.suhoorEnds && now < f.iftar
  return (
    <section aria-labelledby="ramadan-title" className="flex flex-col gap-3 rounded-card bg-card p-5 shadow-card">
      <div className="flex items-center gap-2">
        <IconMoonStars className="size-5 text-primary" stroke={1.75} aria-hidden="true" />
        <h2 id="ramadan-title" className="flex-1 font-heading text-h3 font-bold">
          {t("practice.ramadan.day", { n: state.day })}
        </h2>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-md bg-muted p-3">
          <dt className="text-label text-muted-foreground">{t("practice.ramadan.suhoorEnds")}</dt>
          <dd className="text-h3 font-bold tabular-nums">{formatTimeFull(f.suhoorEnds, tz, locale)}</dd>
        </div>
        <div className="rounded-md bg-muted p-3">
          <dt className="text-label text-muted-foreground">{t("practice.ramadan.iftar")}</dt>
          <dd className="text-h3 font-bold tabular-nums">{formatTimeFull(f.iftar, tz, locale)}</dd>
        </div>
      </dl>
      {beforeIftar && (
        <p className="text-body font-medium tabular-nums">{t("practice.ramadan.toIftar", { time: durationLabel(t, splitDuration(f.iftar.getTime() - now.getTime())) })}</p>
      )}
      <p className="text-label text-muted-foreground">{t("practice.ramadan.suhoorNote")}</p>
    </section>
  )
}

export default function PracticeHome() {
  const { t, locale } = useT()
  const navigate = useNavigate()
  const city = useDevice((s) => s.city)
  const reminders = usePractice((s) => s.reminders)
  const habits = usePractice((s) => s.habits)
  const now = useNow()
  const lines = useLines()
  const { today, state, isRamadan } = useRamadan(now)

  const times = city ? dayTimes(city, today, { ramadan: isRamadan(today) }) : null
  const next = city ? nextPrayer(city, now, isRamadan) : null
  const group = orderedGroups(suggestGroup(times, now))[0]

  return (
    <>
      <PrayerSky
        cityName={city ? cityName(city, locale) : undefined}
        times={times}
        next={next}
        now={now}
        tz={city?.tz}
        hijri={hijriOf(today)}
        onCity={() => navigate("/practice/city")}
      />
      <JourneySheet className="pb-10">
        {!city && (
          <Button size="lg" onClick={() => navigate("/practice/city")}>
            <IconMapPin data-icon="inline-start" stroke={1.75} />
            {t("practice.chooseCity")}
          </Button>
        )}

        {city && times && <TodayList times={times} now={now} tz={city.tz} />}
        {city && <RamadanCard state={state} place={city} today={today} now={now} tz={city.tz} line={lines.ramadan_local} />}

        <section aria-labelledby="tools-title" className="flex flex-col gap-3">
          <SectionTitle id="tools-title">{t("practice.tools")}</SectionTitle>
          <NavRow
            icon={IconCompass}
            title={t("practice.qibla")}
            meta={city ? t("practice.qiblaMeta", { deg: qiblaBearing(city.lat, city.lng) }) : t("practice.qiblaNoCity")}
            onClick={() => navigate("/practice/qibla")}
          />
          <NavRow icon={IconSparkles} title={t("practice.adhkar")} meta={t(`practice.adhkar.group.${group}` as Key)} onClick={() => navigate("/practice/adhkar")} />
          <NavRow
            icon={IconLeaf}
            title={t("practice.habits")}
            meta={habits.length ? countOf(locale, "habits", habits.length) : t("practice.habits.empty")}
            onClick={() => navigate("/practice/habits")}
          />
          <NavRow
            icon={IconBell}
            title={t("practice.reminders")}
            meta={t(reminders.enabled ? "practice.reminders.on" : "practice.reminders.off")}
            onClick={() => navigate("/practice/reminders")}
          />
        </section>
        <p className="text-caption text-muted-foreground">{t("practice.onDevice")}</p>
      </JourneySheet>
    </>
  )
}
