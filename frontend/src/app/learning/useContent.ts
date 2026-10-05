/** The path in the learner's language (GET /api/content). Cached by the
 * service worker for offline use (LRN-03 R5); team accounts may switch on
 * preview to see lessons still in review. */
import { useQuery } from "@tanstack/react-query"
import { api } from "@/app/lib/api"
import { useT } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { orderedLessons } from "./path"
import type { Content } from "./types"

export function useContent() {
  const { locale } = useT()
  const team = useAuth((s) => s.has("team") || s.has("sharia_reviewer") || s.has("admin"))
  const preview = useDevice((s) => s.preview) && team
  const q = useQuery({
    queryKey: ["content", locale, preview],
    queryFn: () => api<Content>(`/api/content?lang=${locale}${preview ? "&preview=true" : ""}`),
    staleTime: 5 * 60_000,
  })
  const lessons = q.data ? orderedLessons(q.data.units, q.data.lessons) : []
  return { ...q, content: q.data, lessons, preview }
}
