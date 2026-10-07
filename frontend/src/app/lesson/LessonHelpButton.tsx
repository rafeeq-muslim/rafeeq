/**
 * CMP-01 R1: the help button of the lesson and review headers. It opens the
 * sourced assistant with the lesson's topic alone (see ask/lessonHelp.ts);
 * «أريد إنسانًا» is then always visible inside the assistant. Below 380px it
 * is a 44px icon and keeps its label for screen readers, so it is never
 * hidden from a crowded header.
 *
 * LRN-03 R5: `onLeave` lets the lesson keep, on the device, the exercise as
 * it is on screen before the learner leaves (lesson/helpReturn.ts). Nothing
 * of it travels with the navigation.
 *
 * CMP-01 R1 (owner's decision 2026-10-07): `context` names what is on screen
 * as ids only (lesson + card or exercise), so the assistant knows what «هذا»
 * refers to. Never the learner's answer.
 */
import { useNavigate } from "react-router"
import { IconHelpCircle } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { useT } from "@/app/i18n"
import { lessonHelpState, type HelpContext, type LessonHelp } from "@/app/ask/lessonHelp"

export function LessonHelpButton({ from, topic, context, onLeave }: LessonHelp & { context?: HelpContext; onLeave?: () => void }) {
  const { t } = useT()
  const navigate = useNavigate()
  return (
    <Button
      data-slot="lesson-help-button"
      variant="outline"
      size="sm"
      className="max-[380px]:size-11 max-[380px]:p-0!"
      onClick={() => {
        onLeave?.()
        navigate("/ask", { state: lessonHelpState(from, topic, context) })
      }}
    >
      <IconHelpCircle data-icon="inline-start" stroke={1.75} />
      <span className="max-[380px]:sr-only">{t("lesson.help")}</span>
    </Button>
  )
}
