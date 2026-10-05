/** MOT-05 R5: a reminder opens one step: the next lesson, or a review when
 * no lesson is left and objectives need one. */
import { Navigate } from "react-router"
import { useLearning } from "@/app/stores/learning"
import { useContent } from "@/app/learning/useContent"
import { firstIncomplete } from "@/app/learning/path"
import { reviewItems } from "@/app/learning/reviewItems"

export default function Next() {
  const progress = useLearning()
  const { content, lessons, isLoading } = useContent()
  if (isLoading && !content) return null
  const next = firstIncomplete(lessons, progress)
  if (next) return <Navigate to={`/learn/lesson/${next.id}`} replace />
  if (content && reviewItems(content, progress.mastery).length) return <Navigate to="/learn/review" replace />
  return <Navigate to="/" replace />
}
