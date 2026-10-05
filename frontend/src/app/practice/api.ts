/**
 * Practice data from the server: only what is the same for every learner
 * (approved adhkar, approved short lines, sighting announcements). Requests
 * carry the language and nothing else — never the city (rules.md §4).
 */
import * as React from "react"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/app/lib/api"
import { useT } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { isRamadan, ramadanState, type Sighting } from "./hijri"
import { setKnownSightings } from "./reminders"
import { ymdIn, type YMD } from "./times"

export type Segment = { t: "text"; text: string } | { t: "quran"; sura: number; from: number; to: number }
export type Dhikr = { id: string; title: string; chapter: number; segments: Segment[]; meaning: string | null; repeat: number; audio: boolean }
export type AdhkarIndex = {
  groups: { key: string; chapters: { id: number; title: string; approved_count: number; total: number }[] }[]
  source: { name: string; url: string }
}
export type AdhkarChapter = { id: number; group: string; title: string; items: Dhikr[]; source: { name: string; url: string } }

export function useAdhkarIndex() {
  const { locale } = useT()
  return useQuery({ queryKey: ["adhkar", locale], queryFn: () => api<AdhkarIndex>(`/api/practice/adhkar?lang=${locale}`), staleTime: 10 * 60_000 })
}

export function useAdhkarChapter(id: number) {
  const { locale } = useT()
  return useQuery({
    queryKey: ["adhkar", locale, id],
    queryFn: () => api<AdhkarChapter>(`/api/practice/adhkar/${id}?lang=${locale}`),
    staleTime: 10 * 60_000,
  })
}

/** Approved short Sharia lines for this language (empty until approved). */
export function useLines() {
  const { locale } = useT()
  const q = useQuery({
    queryKey: ["practice-lines", locale],
    queryFn: () => api<{ lines: Record<string, string> }>(`/api/practice/lines?lang=${locale}`),
    staleTime: 10 * 60_000,
  })
  return q.data?.lines ?? {}
}

/** PRC-04 R2/R6: the same announcement file for everyone. */
export function useSightings(): Sighting[] {
  const q = useQuery({
    queryKey: ["sightings"],
    queryFn: () => api<{ items: Sighting[] }>("/api/practice/sightings"),
    staleTime: 30 * 60_000,
  })
  const items = React.useMemo(() => q.data?.items ?? [], [q.data])
  React.useEffect(() => setKnownSightings(items), [items])
  return items
}

/** A ticking clock for countdowns (every 20 s; the UI shows minutes). */
export function useNow(interval = 20_000): Date {
  const [now, setNow] = React.useState(() => new Date())
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), interval)
    return () => clearInterval(id)
  }, [interval])
  return now
}

/** Ramadan helpers bound to the device city and the loaded announcements. */
export function useRamadan(now: Date) {
  const city = useDevice((s) => s.city)
  const sightings = useSightings()
  const tz = city?.tz ?? "Asia/Riyadh"
  const country = city?.country ?? "SA"
  const today = ymdIn(tz, now)
  const check = React.useCallback((d: YMD) => isRamadan(d, sightings, country), [sightings, country])
  return { today, state: ramadanState(today, sightings, country), isRamadan: check }
}
