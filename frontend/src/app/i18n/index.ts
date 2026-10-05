/**
 * PLT-03: every screen in Arabic, English and Tagalog, RTL and LTR.
 * Dictionaries are plain objects shipped with the app (no runtime CDN).
 * UI copy only: Sharia text never lives here; it comes from approved content.
 */
import { useDevice } from "@/app/stores/device"
import { ar } from "./ar"
import { en } from "./en"
import { tl } from "./tl"

export type Locale = "ar" | "en" | "tl"
export type Dict = Record<keyof typeof ar, string>
export type Key = keyof Dict

const dicts: Record<Locale, Dict> = { ar, en, tl }

export const LOCALES: { code: Locale; label: string; dir: "rtl" | "ltr" }[] = [
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "en", label: "English", dir: "ltr" },
  { code: "tl", label: "Tagalog", dir: "ltr" },
]

export const dirOf = (l: Locale): "rtl" | "ltr" => (l === "ar" ? "rtl" : "ltr")

/** Replace {name} placeholders. */
function fill(s: string, vars?: Record<string, string | number>) {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""))
}

export function translate(locale: Locale, key: Key, vars?: Record<string, string | number>) {
  return fill(dicts[locale][key] ?? dicts.en[key] ?? String(key), vars)
}

export function useT() {
  const locale = useDevice((s) => s.locale)
  return {
    locale,
    dir: dirOf(locale),
    t: (key: Key, vars?: Record<string, string | number>) => translate(locale, key, vars),
    /** Pick the learner's language from a {ar,en,tl} content object. */
    pick: (obj: Partial<Record<Locale, string>> | undefined | null) => (obj ? obj[locale] ?? "" : ""),
  }
}

/** Latin digits everywhere (brand guide), with locale grouping. */
export const num = (n: number) => n.toLocaleString("en-US")
