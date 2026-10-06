import * as React from "react"
import {
  IconCompass,
  IconEyeOff,
  IconMapPin,
  IconMoon,
  IconMoonStars,
  IconSun,
  IconSunrise,
  IconSunset,
  type TablerIcon,
} from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"

/*
 * Daily practice (PRC). Prayer times are computed on the device; location
 * never leaves it. Worship habits are private: no points, no streak, no
 * badge, no leaderboard, and they never emit a Motivation event.
 */

type PrayerKey = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha"

const PRAYERS: Record<PrayerKey, { label: string; icon: TablerIcon }> = {
  fajr: { label: "الفجر", icon: IconSunrise },
  dhuhr: { label: "الظهر", icon: IconSun },
  asr: { label: "العصر", icon: IconSun },
  maghrib: { label: "المغرب", icon: IconSunset },
  isha: { label: "العشاء", icon: IconMoonStars },
}

function PrayerTimesCard({
  times,
  next,
  remaining,
  place,
  onQibla,
  className,
}: {
  /** Latin digits, 24h or 12h as the user prefers, e.g. { fajr: "4:41" } */
  times: Record<PrayerKey, string>
  next: PrayerKey
  /** e.g. «بعد ساعة و12 دقيقة» */
  remaining: string
  /** Shown only as a label; computed and kept on the device. */
  place?: string
  onQibla?: () => void
  className?: string
}) {
  return (
    <Card data-slot="prayer-times-card" className={className}>
      <CardHeader>
        <CardDescription className="flex items-center gap-1">
          <IconMapPin className="size-4" stroke={1.75} aria-hidden="true" />
          {place ?? "حسب موقعك على الجهاز"}
        </CardDescription>
        <CardTitle className="text-h3 font-heading">
          {`${PRAYERS[next].label} ${remaining}`}
        </CardTitle>
        <CardAction>
          <Button variant="secondary" size="sm" onClick={onQibla}>
            <IconCompass data-icon="inline-start" stroke={1.75} />
            القبلة
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ol className="grid grid-cols-5 gap-1.5">
          {(Object.keys(PRAYERS) as PrayerKey[]).map((key) => {
            const P = PRAYERS[key]
            const isNext = key === next
            return (
              <li
                key={key}
                aria-current={isNext ? "time" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md px-1 py-2.5",
                  isNext ? "bg-primary bg-grad-action text-primary-foreground" : "bg-muted text-foreground"
                )}
              >
                <P.icon className="size-5" stroke={1.75} aria-hidden="true" />
                <span className="text-caption font-medium">{P.label}</span>
                <span className="text-label font-bold tabular-nums">{times[key]}</span>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}

/**
 * One habit in the tracker (PRC-02). `worship` habits show a private lock
 * and never show points; other habits may show their commitment count.
 */
function HabitItem({
  title,
  worship = false,
  checked,
  onCheckedChange,
  daysCommitted,
  className,
}: {
  title: string
  worship?: boolean
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
  /** Non-worship habits only. */
  daysCommitted?: number
  className?: string
}) {
  const id = React.useId()
  return (
    <div
      data-slot="habit-item"
      data-worship={worship}
      className={cn(
        "flex min-h-14 items-center gap-3 rounded-md border bg-card px-4 py-2",
        className
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange?.(v === true)}
        className="size-6 rounded-md"
      />
      <label htmlFor={id} className="min-w-0 flex-1 text-body font-medium">
        {title}
      </label>
      {worship ? (
        <Badge variant="outline" className="text-muted-foreground">
          <IconEyeOff data-icon="inline-start" stroke={1.75} />
          خاص بك
        </Badge>
      ) : (
        daysCommitted !== undefined && (
          <Badge variant="secondary" className="tabular-nums">
            {`${daysCommitted} يومًا`}
          </Badge>
        )
      )}
    </div>
  )
}

/** Small Hijri date + Ramadan countdown line (PRC-04). */
function HijriDate({
  hijri,
  gregorian,
  note,
  className,
}: {
  hijri: string
  gregorian?: string
  note?: string
  className?: string
}) {
  return (
    <p data-slot="hijri-date" className={cn("flex flex-wrap items-center gap-2 text-label", className)}>
      <IconMoon className="size-4 text-primary" stroke={1.75} aria-hidden="true" />
      <span className="font-medium">{hijri}</span>
      {gregorian && (
        <span className="text-muted-foreground tabular-nums">
          · <bdi>{gregorian}</bdi>
        </span>
      )}
      {note && <Badge variant="celebrate">{note}</Badge>}
    </p>
  )
}

export { PrayerTimesCard, HabitItem, HijriDate }
export type { PrayerKey }
