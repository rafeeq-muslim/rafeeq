/** Presentation helpers for Companion screens: Latin digits everywhere
 * (brand guide), dates with month names in each language (copy.md). */
import { LOCALES, type Locale } from "@/app/i18n"

const intlLocale = (l: Locale) => (l === "ar" ? "ar-u-nu-latn" : l === "tl" ? "fil" : "en")

/** «منذ 20 دقيقة» / "20 minutes ago". */
export function ago(iso: string, locale: Locale, now = Date.now()): string {
  const s = Math.round((new Date(iso).getTime() - now) / 1000)
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" })
  const abs = Math.abs(s)
  if (abs < 60) return rtf.format(Math.round(s), "second")
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute")
  if (abs < 86_400) return rtf.format(Math.round(s / 3600), "hour")
  return rtf.format(Math.round(s / 86_400), "day")
}

/** «5 أكتوبر» / "October 5". */
export function dayMonth(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "long" }).format(new Date(iso))
}

/** «الثلاثاء 13 أكتوبر» for challenge ends. */
export function weekdayDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { weekday: "long", day: "numeric", month: "long" }).format(new Date(iso))
}

export function time(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { hour: "numeric", minute: "2-digit" }).format(new Date(iso))
}

export const langName = (code: string) => LOCALES.find((l) => l.code === code)?.label ?? code

/** First letter for an avatar, isolated from the surrounding direction. */
export const initial = (name: string) => Array.from(name.trim())[0] ?? "؟"
