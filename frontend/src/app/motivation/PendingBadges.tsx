/**
 * MOT-03 R4: every badge is announced to its owner once, with
 * congratulations and no comparison. A badge earned while the app was
 * closed or left before its celebration (still in `pending`) is announced
 * here, on the next open, then removed from the queue. R3: a unit badge
 * whose name is not approved in this language yet stays queued, unseen.
 */
import { IconFlame, IconFlower } from "@tabler/icons-react"

import { CelebrationScreen } from "@/components/rafeeq"
import { num, useT } from "@/app/i18n"
import { useContent } from "@/app/learning/useContent"
import { useMotivation } from "@/app/stores/motivation"
import { badgeView } from "./badges"

export function PendingBadges() {
  const { t } = useT()
  const { content } = useContent()
  const pending = useMotivation((s) => s.pending)
  const popPending = useMotivation((s) => s.popPending)
  const daysLabel = (n: number) => t("lesson.streakBadge", { n: num(n) })

  const id = pending.find((b) => badgeView(b, content, daysLabel) !== null)
  if (!id) return null
  const view = badgeView(id, content, daysLabel)!
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="celebration-title" data-slot="pending-badge" className="fixed inset-0 z-50 overflow-y-auto">
      <CelebrationScreen
        className="min-h-dvh"
        icon={view.kind === "days" ? IconFlame : IconFlower}
        badgeLabel={view.label}
        title={view.kind === "days" ? t("lesson.streakTitle", { n: num(view.days!) }) : t("lesson.unitDone", { name: view.unitTitle ?? "" })}
        primaryLabel={t("common.continue")}
        onPrimary={() => popPending(id)}
        secondaryLabel={t("common.close")}
        onSecondary={() => popPending(id)}
      />
    </div>
  )
}
