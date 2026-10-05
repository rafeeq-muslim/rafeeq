/** Discover data: the same public responses for every learner (no identity). */
import { useQuery } from "@tanstack/react-query"
import { api } from "@/app/lib/api"
import type { CardsResponse, LibraryResponse, RecitationResponse } from "./types"

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

export const useRecitation = (lang: string) =>
  useQuery({
    queryKey: ["discover-recitation", lang],
    queryFn: () => api<RecitationResponse>(`/api/discover/recitations?lang=${lang}`),
    staleTime: STALE,
  })
