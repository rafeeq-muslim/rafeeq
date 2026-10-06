/**
 * PLT-09 is approved and ON by default (product owner's instruction,
 * 2026-10-06). The setting stays so it can be switched off to roll back:
 * `PLT09_ORGANIZED_HOME=false` on the API (backend/app/core/config.py),
 * read from GET /api/home/config. Off brings back the previous app exactly
 * (Home with the PLT-08 suggestion, «كل ما في رفيق», Discover, «أدوات يومية»).
 *
 * The last answer is kept on the device, so offline it uses what it knew
 * (on until it has read "off").
 */
import { useQuery } from "@tanstack/react-query"

import { api } from "@/app/lib/api"
import { useDevice } from "@/app/stores/device"

export const HOME_CONFIG_URL = "/api/home/config"

/** The cached value only, without asking the server (screens other than Home). */
export const useOrganizedHomeCached = (): boolean => useDevice((s) => s.organizedHome)

/** Home asks the server (at most every 30 minutes) and keeps the answer. */
export function useOrganizedHome(): boolean {
  const cached = useDevice((s) => s.organizedHome)
  useQuery({
    queryKey: ["home", "config"],
    queryFn: async () => {
      const r = await api<{ organized: boolean }>(HOME_CONFIG_URL)
      if (useDevice.getState().organizedHome !== !!r.organized) useDevice.getState().set({ organizedHome: !!r.organized })
      return r
    },
    staleTime: 30 * 60_000,
    retry: false,
  })
  return cached
}
