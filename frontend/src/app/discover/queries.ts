/** Discover data: the same public responses for every learner (no identity). */
import { useQuery } from "@tanstack/react-query"
import { api } from "@/app/lib/api"
import type { SourceCard } from "@/app/ask/types"
import type { CardsResponse, LibraryResponse, LibrarySearchSources, RecitationResponse } from "./types"

const STALE = 5 * 60_000

export const useCards = (lang: string) =>
  useQuery({ queryKey: ["discover-cards", lang], queryFn: () => api<CardsResponse>(`/api/discover/cards?lang=${lang}`), staleTime: STALE })

export const useLibrary = (lang: string, enabled = true) =>
  useQuery({
    queryKey: ["discover-library", lang],
    queryFn: () => api<LibraryResponse>(`/api/discover/library?lang=${lang}`),
    staleTime: STALE,
    enabled,
  })

/** KNW-09 R2: the stored records behind saved answers, by passage id (no identity; 40 ids per call). */
export const usePassages = (ids: string[]) => {
  const wanted = [...new Set(ids)].sort()
  return useQuery({
    queryKey: ["scripture-passages", wanted],
    enabled: wanted.length > 0,
    staleTime: STALE,
    retry: 1,
    queryFn: async () => {
      const pages: Promise<{ cards: SourceCard[] }>[] = []
      for (let i = 0; i < wanted.length; i += 40) {
        const q = new URLSearchParams()
        for (const id of wanted.slice(i, i + 40)) q.append("ids", id)
        pages.push(api<{ cards: SourceCard[] }>(`/api/scripture/passages?${q}`))
      }
      return new Map((await Promise.all(pages)).flatMap((p) => p.cards).map((c) => [c.id, c]))
    },
  })
}

/** KNW-06 library search: which library sources can be searched now (no query sent, no-store). */
export const useLibrarySearchSources = (lang: string) =>
  useQuery({
    queryKey: ["library-search-sources", lang],
    queryFn: () => api<LibrarySearchSources>(`/api/discover/library/search/sources?lang=${lang}`),
    staleTime: STALE,
    retry: 1,
  })

export const useRecitation =(lang: string) =>
  useQuery({
    queryKey: ["discover-recitation", lang],
    queryFn: () => api<RecitationResponse>(`/api/discover/recitations?lang=${lang}`),
    staleTime: STALE,
  })
