/**
 * MOT-03 R6: in the mentor's inbox, a mentee's badges, only while the
 * mentee shares progress with this mentor (the server asks Companion's
 * permission live, so nothing shows once it is withdrawn). Names as
 * approved in the mentor's language (R3); no counts, no comparison (R4).
 */
import { useQuery } from "@tanstack/react-query"

import { Badge } from "@/components/ui/badge"
import { num, useT } from "@/app/i18n"
import { api } from "@/app/lib/api"
import { useContent } from "@/app/learning/useContent"
import { badgeView } from "./badges"

type MenteeBadgesRow = { learner_id: string; badges: { id: string; earnedAt: string }[] }

export function useMenteeBadges(enabled = true) {
  return useQuery({ queryKey: ["mot", "mentee-badges"], queryFn: () => api<MenteeBadgesRow[]>("/api/mentor/mentee-badges"), enabled })
}

export function MenteeBadges({ learnerId }: { learnerId: string }) {
  const { t } = useT()
  const { content } = useContent()
  const q = useMenteeBadges()
  const row = q.data?.find((r) => r.learner_id === learnerId)
  const views = (row?.badges ?? []).flatMap((b) => {
    const v = badgeView(b.id, content, (n) => t("lesson.streakBadge", { n: num(n) }))
    return v ? [{ id: b.id, label: v.label }] : []
  })
  if (views.length === 0) return null
  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label={t("mot.mentor.badges")} data-slot="mentee-badges">
      {views.map((v) => (
        <li key={v.id}>
          <Badge variant="celebrate">{v.label}</Badge>
        </li>
      ))}
    </ul>
  )
}
