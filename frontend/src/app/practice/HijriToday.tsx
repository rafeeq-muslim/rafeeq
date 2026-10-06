/**
 * PRC-04 R1: today's Umm al-Qura date, visible as soon as the app opens.
 * Computed on the device (offline, no request); the day is the chosen city's,
 * else the device's. Small and quiet: a caption, not a card.
 */
import { IconMoon } from "@tabler/icons-react"

import { useT } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { useNow } from "./api"
import { deviceTimeZone } from "./cities"
import { hijriOf } from "./hijri"
import { ymdIn } from "./times"

export function HijriToday() {
  const { t } = useT()
  const tz = useDevice((s) => s.city?.tz)
  const now = useNow(60_000)
  const h = hijriOf(ymdIn(tz ?? deviceTimeZone(), now))
  const label = t("practice.hijriDate", { d: h.day, m: t(`practice.month.${h.month}` as never), y: h.year })
  return (
    <p className="flex items-center gap-1.5 text-label text-muted-foreground tabular-nums">
      <IconMoon className="size-4 shrink-0" stroke={1.75} aria-hidden="true" />
      <span className="sr-only">{t("practice.hijri")}: </span>
      {label}
    </p>
  )
}
