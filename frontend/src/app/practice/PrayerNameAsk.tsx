/**
 * PLT-06 R3 / PRC-05 R2 (product owner's approval, 2026-10-06): there is no
 * default for showing the prayer name. The first time the learner turns
 * prayer reminders on, anywhere, Rafeeq asks once whether the reminder may
 * show it. Each answer sets `showName` and is never asked again; closing the
 * question without an answer keeps the reminder neutral and asks again the
 * next time reminders are turned on. The switch on /practice/reminders
 * changes the choice later.
 */
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useT } from "@/app/i18n"
import { usePractice, type ReminderSettings } from "./store"

/** Ask only if the learner has never answered and has not chosen the name already. */
export const needsNameAsk = (r: ReminderSettings) => !r.askedName && !r.showName

/** The prayer-reminder on/off switch, with the one-time question attached. */
export function usePrayerReminderSwitch() {
  const enabled = usePractice((s) => s.reminders.enabled)
  const set = usePractice((s) => s.set)
  const [asking, setAsking] = React.useState(false)

  const setEnabled = (on: boolean) => {
    const cur = usePractice.getState().reminders
    // Turning on is always neutral first; only an answer can show the name.
    set({ reminders: { ...cur, enabled: on } })
    if (on && !cur.enabled && needsNameAsk(cur)) setAsking(true)
  }
  const answer = (showName: boolean) => {
    set({ reminders: { ...usePractice.getState().reminders, showName, askedName: true } })
    setAsking(false)
  }
  const dialog = <PrayerNameAsk open={asking} onAnswer={answer} onDismiss={() => setAsking(false)} />
  return { enabled, setEnabled, dialog }
}

function PrayerNameAsk({ open, onAnswer, onDismiss }: { open: boolean; onAnswer: (showName: boolean) => void; onDismiss: () => void }) {
  const { t } = useT()
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onDismiss()}>
      <DialogContent data-slot="prayer-name-ask" className="gap-5 rounded-card p-5">
        <DialogHeader className="pe-8">
          <DialogTitle className="text-h3 leading-[inherit] font-bold">{t("practice.reminders.ask.title")}</DialogTitle>
          <DialogDescription className="text-body text-muted-foreground">{t("practice.reminders.ask.body")}</DialogDescription>
        </DialogHeader>
        {/* Two equal choices: neither is pushed as the default. */}
        <div className="flex flex-col gap-3">
          <Button variant="secondary" className="w-full" onClick={() => onAnswer(true)}>
            {t("practice.reminders.ask.show")}
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => onAnswer(false)}>
            {t("practice.reminders.ask.neutral")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
