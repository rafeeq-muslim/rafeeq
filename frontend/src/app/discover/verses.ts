/**
 * KNW-08 R2: a surah's text from the stored QuranEnc record
 * (`/api/scripture/quran`, 40 ayat per call). No translation stored → the
 * Arabic alone; nothing is ever generated.
 */
import { useQuery } from "@tanstack/react-query"
import { api } from "@/app/lib/api"
import { AYA_COUNT } from "./ayaCount"
import type { Aya, Verses } from "./types"

export function meaningLines(ayat: Aya[]) {
  return ayat.map((a) => ({ aya: a.aya, arabic: a.arabic, meaning: a.translation ?? null }))
}

const PAGE = 40

export function useSuraText(sura: number, locale: string) {
  return useQuery({
    queryKey: ["sura-text", sura, locale],
    staleTime: Infinity,
    retry: 1,
    queryFn: async () => {
      const n = AYA_COUNT[sura - 1] ?? 0
      const pages: Promise<Verses>[] = []
      for (let from = 1; from <= n; from += PAGE) {
        const to = Math.min(n, from + PAGE - 1)
        pages.push(api<Verses>(`/api/scripture/quran?sura=${sura}&from=${from}&to=${to}&lang=${locale}`))
      }
      const all = await Promise.all(pages)
      return { ayat: all.flatMap((p) => p.ayat), source: all[0]?.source }
    },
  })
}
