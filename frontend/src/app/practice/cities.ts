/**
 * PRC-01 R2: the city is chosen from an offline list (GeoNames extract,
 * CC BY 4.0) searched in the learner's language; no location permission is
 * needed. The suggestion comes from the device time zone only. Cities above
 * 48° N/S are not in the list (owner decision 2026-10-05).
 */
import type { City } from "@/app/stores/device"

export type CityRow = {
  id: string
  n: { en: string; ar?: string; tl?: string; ascii?: string }
  c: string
  lat: number
  lng: number
  tz: string
  p: number
  cap?: 1
}

let cache: Promise<CityRow[]> | null = null

/** Loaded lazily (≈150 KB) and bundled with the app: works offline. */
export function loadCities(): Promise<CityRow[]> {
  cache ??= import("./cities.json").then((m) => m.default as CityRow[])
  return cache
}

/** Case, Latin diacritics, Arabic tashkeel/tatweel and hamza/ta-marbuta forms folded. */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ًͯ-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .trim()
}

export function searchCities(rows: CityRow[], query: string, limit = 40): CityRow[] {
  const q = fold(query)
  if (!q) return []
  const scored: [number, CityRow][] = []
  for (const r of rows) {
    const names = [r.n.ar, r.n.en, r.n.tl, r.n.ascii].filter(Boolean).map((x) => fold(x as string))
    const best = Math.min(...names.map((n) => (n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : 9)))
    if (best < 9) scored.push([best, r])
  }
  return scored.sort((a, b) => a[0] - b[0] || b[1].p - a[1].p).slice(0, limit).map(([, r]) => r)
}

/** R2: cities in the device's time zone, capital first, then by size. */
export function suggestCities(rows: CityRow[], tz: string, limit = 5): CityRow[] {
  return rows
    .filter((r) => r.tz === tz)
    .sort((a, b) => (b.cap ?? 0) - (a.cap ?? 0) || b.p - a.p)
    .slice(0, limit)
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return "UTC"
  }
}

/** The list's latitude limit (owner decision 2026-10-05, until the 45° rule of PRC-01 R3 is built). */
export const MAX_LISTED_LATITUDE = 48

/**
 * R2/R3: the farthest a located position may be from the city it is given.
 * Beyond it we pick nothing rather than a far city in another time zone
 * (London → Lyon 737 km, Oslo → Milan 1610 km, Edmonton → Seattle 908 km).
 * 150 km keeps the suburbs and satellite towns of every listed city (Riyadh →
 * Al-Kharj ≈ 80 km, Mecca → Jeddah ≈ 70 km) while bounding the east–west
 * error to about 4 min per degree of longitude: ≈ 5½ min at the equator,
 * ≈ 6 min at 25°, ≈ 8 min at 48° — the same order as a village using its
 * nearest city's times, which R2 already accepts. ⚠️ Technical default, for
 * the domain owner to confirm.
 */
export const NEAREST_MAX_KM = 150

const EARTH_KM = 6371

/** Great-circle distance in km (haversine). */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLng = (lng2 - lng1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * R2 (optional location): the nearest listed city within `maxKm`, or null.
 * The position itself is never stored.
 */
export function nearestCity(rows: CityRow[], lat: number, lng: number, maxKm = NEAREST_MAX_KM): CityRow | null {
  let best: CityRow | null = null
  let bestD = Infinity
  for (const r of rows) {
    const d = distanceKm(lat, lng, r.lat, r.lng)
    if (d < bestD) {
      bestD = d
      best = r
    }
  }
  return bestD <= maxKm ? best : null
}

/**
 * R2 (optional location) with an honest answer when no listed city is near:
 * `highLatitude` when the person is beyond 48° (their area is not supported
 * yet), `farAway` when they are simply far from every listed city.
 */
export type Located = { kind: "city"; row: CityRow } | { kind: "highLatitude" } | { kind: "farAway" }

export function locateCity(rows: CityRow[], lat: number, lng: number): Located {
  const row = nearestCity(rows, lat, lng)
  if (row) return { kind: "city", row }
  return Math.abs(lat) > MAX_LISTED_LATITUDE ? { kind: "highLatitude" } : { kind: "farAway" }
}

export function toCity(r: CityRow): City {
  const name: Record<string, string> = { en: r.n.en }
  if (r.n.ar) name.ar = r.n.ar
  if (r.n.tl) name.tl = r.n.tl
  return { id: r.id, name, country: r.c, lat: r.lat, lng: r.lng, tz: r.tz }
}

export function cityName(city: { name: Record<string, string> } | { n: CityRow["n"] }, locale: string): string {
  const n = "name" in city ? city.name : (city.n as Record<string, string>)
  return n[locale] ?? n.en
}

/** Country names from the platform, in the learner's language. */
export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale === "tl" ? "fil" : locale], { type: "region" }).of(code) ?? code
  } catch {
    return code
  }
}
