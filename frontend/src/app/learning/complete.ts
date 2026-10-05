/** LRN-03 R4 "LessonCompleted" on the device: Learning records it, then
 * Motivation (learning day, streak and unit badges), the anonymous event
 * (MOT-07), the reminder's learned-today mark (MOT-05) and the account copy
 * (PLT-02) hear about it. Worship never reaches this path. */
import { sendEvent } from "@/app/lib/api"
import { reportLearnedToday } from "@/app/lib/push"
import { scheduleSync } from "@/app/lib/sync"
import { useLearning } from "@/app/stores/learning"
import { useMotivation } from "@/app/stores/motivation"
import { unitDone } from "./path"
import type { Content, Lesson } from "./types"

export const unitBadgeId = (unitId: string) => `unit-${unitId}`

export type Completion = {
  isRepeat: boolean
  /** Badges earned now (unit and/or 7/30/66 learning days), to celebrate. */
  badges: string[]
  resumedAfterPause: boolean
  unitCompleted: string | null
}

export function completeLesson(lesson: Lesson, content: Content | undefined): Completion {
  const learning = useLearning.getState()
  const motivation = useMotivation.getState()
  const { isRepeat } = learning.completeLesson(lesson.id)
  learning.clearSession(lesson.id)
  const { newBadges, resumedAfterPause } = motivation.recordLearningDay()

  const unit = content?.units.find((u) => u.id === lesson.unit)
  let unitCompleted: string | null = null
  if (unit && unitDone(unit, useLearning.getState()) && motivation.earn(unitBadgeId(unit.id))) {
    unitCompleted = unit.id
    sendEvent({ type: "unit_completed", unit_id: unit.id })
  }
  sendEvent({ type: "lesson_completed", lesson_id: lesson.id, unit_id: lesson.unit, is_repeat: isRepeat })
  void reportLearnedToday()
  scheduleSync()
  return { isRepeat, badges: [...(unitCompleted ? [unitBadgeId(unitCompleted)] : []), ...newBadges], resumedAfterPause, unitCompleted }
}
