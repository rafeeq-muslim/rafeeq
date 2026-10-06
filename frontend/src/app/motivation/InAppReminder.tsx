/**
 * MOT-05 open-question default: the gentle reminder shown inside Rafeeq on
 * its day, for a device without push. Neutral text (R3), one step (R5:
 * /next resolves to the next lesson or a review). Never on a day already
 * learned, at most once a day, thinning out when ignored (R2, R4).
 */
import * as React from "react"
import { useNavigate } from "react-router"
import { IconArrowLeft, IconBook2 } from "@tabler/icons-react"

import { IconTile } from "@/components/rafeeq"
import { useT } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { useMotivation } from "@/app/stores/motivation"
import { inAppDue, useInAppReminder } from "./reminder"
import { localDay } from "./streak"

export function InAppReminder() {
  const { t } = useT()
  const navigate = useNavigate()
  const r = useInAppReminder()
  const days = useMotivation((s) => s.days)
  const pushReminderOn = useDevice((s) => s.reminderOn)
  const today = localDay()
  const check = React.useMemo(() => inAppDue(r, days), [r, days])

  React.useEffect(() => {
    if (!pushReminderOn && check.due) r.set({ shownOn: today, ignored: check.ignored })
  }, [check.due, check.ignored, pushReminderOn, today, r])

  // Shown for the rest of its day, until the person learns.
  if (pushReminderOn || !r.on || r.shownOn !== today || days.includes(today)) return null
  return (
    <button
      type="button"
      data-slot="in-app-reminder"
      onClick={() => navigate("/next")}
      className="tactile flex items-center gap-3 rounded-card border-2 bg-card p-4 text-start [--lip:var(--outline-lip)]"
    >
      <IconTile icon={IconBook2} size="lg" />
      <span className="min-w-0 flex-1 text-body font-bold">{t("reminder.inApp")}</span>
      <IconArrowLeft className="size-5 text-primary ltr:rotate-180" aria-hidden="true" />
    </button>
  )
}
