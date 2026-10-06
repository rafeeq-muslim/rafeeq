/** MOT-05 R5: a reminder opens one step: the next lesson, or a review when
 * no lesson is left and objectives need one. */
import { Navigate } from "react-router"
import { useLearning } from "@/app/stores/learning"
import { useContent } from "@/app/learning/useContent"
import { nextLesson, type Progress } from "@/app/learning/path"
import { reviewItems } from "@/app/learning/reviewItems"
import type { ObjectiveState } from "@/app/learning/bkt"
import type { Content, Lesson } from "@/app/learning/types"

/** Where /next leads (pure, tested). */
export function nextStep(
  content: Content | undefined,
  lessons: Lesson[],
  progress: Progress & { mastery: Record<string, ObjectiveState> },
  now = new Date(),
): string {
  const next = nextLesson(lessons, progress)
  if (next) return `/learn/lesson/${next.id}`
  if (content && reviewItems(content, progress.mastery, now, progress.completed).length) return "/learn/review"
  return "/"
}

export default function Next() {
  const progress = useLearning()
  const { content, lessons, isLoading } = useContent()
  if (isLoading && !content) return null
  return <Navigate to={nextStep(content, lessons, progress)} replace />
}
