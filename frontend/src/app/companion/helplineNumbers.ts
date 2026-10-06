/**
 * Official helpline numbers for the danger case (companion README fixed
 * rule; rules.md §2.8). Bundled in the app so they show at once and work
 * offline. Only numbers verified on an official source are listed, exactly
 * as in docs/agents/research/08-companion-safety-and-helplines.md and the
 * helpline row of docs/agents/sources.md (verified 2026-10-06; re-verify
 * every six months). Never add a number that is not verified there: the
 * unverified ones (Saudi 920033360, DMW 1348 from abroad) and the ones kept
 * out of the danger panel (19911, 116111) are deliberately absent.
 *
 * The country is guessed on the device from its time zone and can be
 * changed; nothing about it is stored or sent (rules.md §4).
 */
import type { Key } from "@/app/i18n"

export type Country = "sa" | "ph" | "other"
export type Helpline = { number: string; label: Key }

export const HELPLINES_VERIFIED_ON = "2026-10-06"

export const HELPLINES: Record<Exclude<Country, "other">, Helpline[]> = {
  // research/08 §1.1: CST national numbering plan [H1], SPA [H2], HRSD [H3], MOH [H4].
  sa: [
    { number: "911", label: "cmp.line.sa.911" },
    { number: "999", label: "cmp.line.sa.999" },
    { number: "997", label: "cmp.line.sa.997" },
    { number: "998", label: "cmp.line.sa.998" },
    { number: "1919", label: "cmp.line.sa.1919" },
    { number: "937", label: "cmp.line.sa.937" },
  ],
  // research/08 §1.2: e911.gov.ph and PIA [H6], NCMH's official account and PIA [H7].
  ph: [
    { number: "911", label: "cmp.line.ph.911" },
    { number: "1553", label: "cmp.line.ph.1553" },
  ],
}

export const COUNTRIES: Country[] = ["sa", "ph", "other"]

/** A guess from the device's own clock settings; research/08 §1.3: no list for other countries yet. */
export function countryFromTimeZone(tz: string | undefined): Country {
  if (tz === "Asia/Riyadh") return "sa"
  if (tz === "Asia/Manila") return "ph"
  return "other"
}

export function deviceCountry(): Country {
  try {
    return countryFromTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    return "other"
  }
}
