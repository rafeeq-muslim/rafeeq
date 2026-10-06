/**
 * PLT-09 is a draft awaiting the product owner and the PLT owner (feature
 * doc, open question 1), so it is built behind a setting that is off by
 * default. While it is off, Home, «حسابي», «كل ما في رفيق» and Discover stay
 * exactly as they are.
 *
 * On for everyone: the server setting `PLT09_ORGANIZED_HOME=true`
 * (backend/app/core/config.py), read from GET /api/home/config. The last
 * answer is kept on the device, so offline it uses what it knew (off until
 * it has read "on"). On for one team device: the team switch in «حسابي»
 * (`organizedHomePreview`), like the lesson preview switch.
 */
import { useQuery } from "@tanstack/react-query"

import { api } from "@/app/lib/api"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"

export const HOME_CONFIG_URL = "/api/home/config"

export function useOrganizedHome(): boolean {
  const cached = useDevice((s) => s.organizedHome)
  const preview = useDevice((s) => s.organizedHomePreview)
  const team = useAuth((s) => s.has("team"))
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
  return cached || (preview && team)
}
