/**
 * The Practice hero: the sky over the learner's city. Night (Maghrib to
 * sunrise) is the brand's ink sky; day is the lavender mist. One arc runs
 * from Fajr to Isha with a tick per prayer and a light for "now" — time of
 * day only, never a record of prayers (worship is not tracked here).
 */
import { IconChevronDown, IconMapPin, IconMoon } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Halo, PetalPattern } from "@/components/rafeeq"
import { useT } from "@/app/i18n"
import type { Hijri } from "./hijri"
import { formatTimeFull, PRAYER_KEYS, splitDuration, type DayTimes, type NextPrayer } from "./times"
import { durationLabel, prayerName } from "./ui"

const P0 = [14, 104]
const P1 = [150, -18]
const P2 = [286, 104]
const at = (f: number) => {
  const u = 1 - f
  return [u * u * P0[0] + 2 * u * f * P1[0] + f * f * P2[0], u * u * P0[1] + 2 * u * f * P1[1] + f * f * P2[1]]
}

function SkyArc({ times, now, next, night }: { times: DayTimes; now: Date; next: NextPrayer; night: boolean }) {
  const span = times.isha.getTime() - times.fajr.getTime()
  const frac = (d: Date) => Math.min(1, Math.max(0, (d.getTime() - times.fajr.getTime()) / span))
  const [x, y] = at(frac(now))
  return (
    <svg viewBox="0 0 300 112" aria-hidden="true" className="mt-4 h-24 w-full overflow-visible rtl:-scale-x-100">
      <path
        d={`M ${P0.join(" ")} Q ${P1.join(" ")} ${P2.join(" ")}`}
        fill="none"
        stroke="currentColor"
        strokeOpacity={night ? 0.28 : 0.22}
        strokeWidth="2"
        strokeDasharray="2 6"
        strokeLinecap="round"
      />
      {PRAYER_KEYS.map((k) => {
        const [tx, ty] = at(frac(times[k]))
        const isNext = !next.tomorrow && next.key === k
        return <circle key={k} cx={tx} cy={ty} r={isNext ? 6 : 3.5} className={isNext ? "fill-primary" : "fill-current"} fillOpacity={isNext ? 1 : 0.5} />
      })}
      <circle cx={x} cy={y} r="15" className={night ? "fill-white" : "fill-apricot"} fillOpacity="0.18" />
      <circle cx={x} cy={y} r="8" className={night ? "fill-white" : "fill-apricot"} />
    </svg>
  )
}

export function PrayerSky({
  cityName,
  times,
  next,
  now,
  tz,
  hijri,
  onCity,
}: {
  cityName?: string
  times: DayTimes | null
  next: NextPrayer | null
  now: Date
  tz?: string
  hijri: Hijri
  onCity: () => void
}) {
  const { t, locale } = useT()
  const night = !times || now >= times.maghrib || now < times.sunrise
  const hijriLabel = t("practice.hijriDate", { d: hijri.day, m: t(`practice.month.${hijri.month}` as never), y: hijri.year })

  return (
    <section
      aria-label={t("practice.prayer")}
      className={cn(
        "relative isolate overflow-hidden px-5 pt-[calc(env(safe-area-inset-top,0px)+1rem)] pb-14 @min-[52.5rem]/shell:rounded-panel @min-[52.5rem]/shell:pb-8",
        night
          ? "dark bg-[linear-gradient(180deg,var(--rf-ink)_0%,var(--rf-deep)_100%)] text-foreground"
          : "bg-secondary text-secondary-foreground"
      )}
    >
      <PetalPattern className={cn("-z-10", night ? "text-white/[0.045]" : "text-primary/[0.06]")} scale={1.2} />
      <Halo className={cn("absolute -end-24 -top-24 -z-10 size-72", night ? "text-white/10" : "text-primary/10")} />

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onCity}
          className="-ms-2 flex min-h-11 min-w-0 items-center gap-1.5 rounded-full px-2 text-label font-medium"
        >
          <IconMapPin className="size-4 shrink-0" stroke={1.75} aria-hidden="true" />
          <span className="truncate">{cityName ?? t("practice.chooseCity")}</span>
          <IconChevronDown className="size-4 shrink-0 opacity-70" stroke={1.75} aria-hidden="true" />
        </button>
        <p className="flex shrink-0 items-center gap-1.5 text-label tabular-nums">
          <IconMoon className="size-4" stroke={1.75} aria-hidden="true" />
          {hijriLabel}
        </p>
      </div>

      {times && next && tz ? (
        <>
          <p className="mt-6 text-label opacity-80">{t("practice.nextLabel")}</p>
          <h1 className="font-heading text-h1 font-bold text-balance tabular-nums" aria-live="polite">
            {t("practice.next", { name: prayerName(t, next.key), time: durationLabel(t, splitDuration(next.at.getTime() - now.getTime())) })}
          </h1>
          <p className="mt-1 text-body tabular-nums opacity-80">{t("practice.at", { time: formatTimeFull(next.at, tz, locale) })}</p>
          <SkyArc times={times} now={now} next={next} night={night} />
        </>
      ) : (
        <div className="mt-6 flex flex-col items-start gap-3">
          <h1 className="font-heading text-h2 font-bold text-balance">{t("practice.noCityTitle")}</h1>
          <p className="text-body opacity-80">{t("practice.noCityBody")}</p>
        </div>
      )}
    </section>
  )
}
