/**
 * Counted nouns in Arabic change form with the number (1, 2, 3–10, 11+), so
 * counts use four keys per noun: `practice.n.<noun>.one|two|few|many`.
 * English and Tagalog simply repeat the plural form.
 */
import { translate, type Key, type Locale } from "@/app/i18n"

export type Noun = "days" | "minutes" | "adhkar" | "times" | "habits"

export function pluralForm(n: number): "one" | "two" | "few" | "many" {
  if (n === 1) return "one"
  if (n === 2) return "two"
  const r = n % 100
  return r >= 3 && r <= 10 ? "few" : "many"
}

export function countOf(locale: Locale, noun: Noun, n: number): string {
  return translate(locale, `practice.n.${noun}.${pluralForm(n)}` as Key, { n })
}
