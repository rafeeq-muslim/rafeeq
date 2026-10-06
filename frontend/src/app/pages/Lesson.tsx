/**
 * LRN-03 lesson player (full screen). Cards, then exercises; a wrong answer
 * is safe and comes back before the end; the lesson completes when every
 * exercise is right; it resumes where it stopped and works offline once
 * opened. «أريد إنسانًا» stays visible (rules.md §2).
 */
import * as React from "react"
import { useNavigate, useParams } from "react-router"
import { IconArrowLeft, IconHelpCircle, IconSparkles, IconX } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ExerciseFeedback, HumanHelpButton } from "@/components/rafeeq"
import { num, useT } from "@/app/i18n"
import { useLearning } from "@/app/stores/learning"
import { useContent } from "@/app/learning/useContent"
import { answer, current, isComplete, needsResumeChoice, nextCard, previousCard, progressOf, startSession } from "@/app/learning/session"
import { completeLesson, type Completion } from "@/app/learning/complete"
import { recordFirstAnswer } from "@/app/learning/answers"
import { noteGuideFollowed } from "@/app/learning/GuideNote"
import type { Exercise, Lesson as LessonT } from "@/app/learning/types"
import { lessonStatus, nextLesson } from "@/app/learning/path"
import { ExerciseView, check, emptyValue, incorrectKey, quotesCard, ready, useFooterSpace, type Result, type Value } from "@/app/lesson/Exercises"
import { VerseBlock } from "@/app/lesson/VerseBlock"
import { LessonDone } from "@/app/lesson/LessonDone"
import { askWhy, type Why } from "@/app/lesson/why"

export default function LessonPage() {
  const { lessonId = "" } = useParams()
  const { t } = useT()
  const navigate = useNavigate()
  const { content, isLoading, lessons, preview } = useContent()
  const progress = useLearning()
  const lesson = content?.lessons[lessonId]

  if (isLoading && !content) {
    return (
      <div className="flex flex-col gap-4 p-5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    )
  }
  if (!lesson) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-body text-muted-foreground">{t("lesson.notFound")}</p>
        <Button onClick={() => navigate("/learn")}>{t("path.title")}</Button>
      </div>
    )
  }
  // LRN-02 R2 (issue #9): a locked lesson stays locked even when opened by its link.
  if (!preview && lessonStatus(lesson, lessons, progress) === "locked") {
    const next = nextLesson(lessons, progress)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="max-w-sm text-body text-muted-foreground">{t("lesson.locked", { name: next?.title ?? "" })}</p>
        {next && <Button onClick={() => navigate(`/learn/lesson/${next.id}`, { replace: true })}>{t("lesson.nextLesson", { name: next.title })}</Button>}
      </div>
    )
  }
  return <Player key={lesson.id} lesson={lesson} />
}

function Player({ lesson }: { lesson: LessonT }) {
  const { t, locale } = useT()
  const navigate = useNavigate()
  const { content } = useContent()
  const saved = useLearning((s) => s.sessions[lesson.id])
  const saveSession = useLearning((s) => s.saveSession)
  const markSeen = useLearning((s) => s.markSeen)

  const [askResume, setAskResume] = React.useState(() => needsResumeChoice(saved))
  React.useEffect(() => noteGuideFollowed(`/learn/lesson/${lesson.id}`), [lesson.id])
  const session = saved ?? startSession(lesson)
  const screen = current(lesson, session)

  // The exercise on screen and its checked result (kept until «متابعة»).
  const [shown, setShown] = React.useState<{ exercise: Exercise; result: Result } | null>(null)
  const [value, setValue] = React.useState<Value>(null)
  const [why, setWhy] = React.useState<Why | "loading" | null>(null)
  const [done, setDone] = React.useState<Completion | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const [footer, footerHeight] = useFooterSpace<HTMLElement>()

  const exercise = shown?.exercise ?? (screen.kind === "exercise" ? screen.exercise : null)
  React.useEffect(() => {
    if (exercise && !shown) setValue(emptyValue(exercise))
  }, [exercise?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (screen.kind !== "card") return
    const card = lesson.cards[screen.index]
    markSeen(lesson.objectives.filter((o) => o.cards.includes(card.id)).map((o) => o.id))
  }, [screen.kind === "card" ? screen.index : -1]) // eslint-disable-line react-hooks/exhaustive-deps

  if (done) return <LessonDone lesson={lesson} completion={done} />

  const onCheck = () => {
    if (!exercise || !ready(exercise, value)) return
    const correct = check(exercise, value)
    const { session: next, first } = answer(session, exercise.id, correct)
    if (first) recordFirstAnswer(exercise, correct, "lesson")
    saveSession(next)
    setShown({ exercise, result: correct ? "correct" : "incorrect" })
  }

  const onContinue = () => {
    setShown(null)
    setWhy(null)
    setAttempt((a) => a + 1)
    if (isComplete(lesson, session)) return setDone(completeLesson(lesson, content))
    const next = current(lesson, session)
    if (next.kind === "exercise") setValue(emptyValue(next.exercise)) // R3: a returning exercise starts fresh
  }

  const cardText = (ids: string[]) =>
    lesson.cards
      .filter((c) => ids.includes(c.id))
      .map((c) => c.text)
      .join("\n")

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-background/90 px-3 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] pb-2 backdrop-blur">
        <Button variant="ghost" size="icon" aria-label={t("lesson.exit")} onClick={() => navigate("/learn")}>
          <IconX />
        </Button>
        <Progress value={progressOf(lesson, session)} aria-label={t("lesson.progress")} className="h-3.5 flex-1" />
        <HumanHelpButton compact label={t("ask.human")} onClick={() => navigate("/mentor/help?from=lesson")} />
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-5 pt-3 pb-40" style={footerHeight ? { paddingBottom: footerHeight + 24 } : undefined}>
        {!lesson.approved && (
          <Badge variant="warning" className="w-fit">
            {t("lesson.preview")}
          </Badge>
        )}

        {screen.kind === "card" && !shown && (
          <CardView lesson={lesson} index={screen.index} />
        )}

        {exercise && (
          <>
            <Badge variant="secondary" className="w-fit">
              {t(exercise.type === "choose" ? "lesson.choose" : exercise.type === "order" ? "lesson.orderHint" : "lesson.matchHint")}
            </Badge>
            <h1 className="font-heading text-h2 font-bold text-balance">{exercise.prompt}</h1>
            <ExerciseView key={`${exercise.id}:${attempt}`} round={attempt} exercise={exercise} value={value} onChange={setValue} result={shown?.result ?? null} />
          </>
        )}
      </main>

      <footer ref={footer} className="fixed inset-x-0 bottom-0 z-20">
        {shown ? (
          <ExerciseFeedback
            result={shown.result === "correct" ? "correct" : "incorrect"}
            title={t(shown.result === "correct" ? "lesson.correct" : incorrectKey(shown.exercise))}
            actionLabel={t("common.continue")}
            onContinue={onContinue}
            className="mx-auto max-w-xl"
            explanation={
              shown.result === "incorrect" ? (
                <>
                  {/* LRN-03 R6: the AI explanation sits above the card text, which stays visible */}
                  {why && why !== "loading" && why.text && (
                    <p className="rounded-md bg-card/70 px-3 py-2">
                      <span className="font-bold">{t("lesson.aiLabel")}:</span> {why.text}
                    </p>
                  )}
                  {quotesCard(shown.exercise) && (
                    <p className="whitespace-pre-line">
                      <span className="font-bold">{t("lesson.cardText")}:</span> {cardText(shown.exercise.cards)}
                    </p>
                  )}
                  {/* LRN-03 R3: «لماذا؟» sits in the panel, never on the exercise */}
                  {why === null && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-fit"
                      onClick={async () => {
                        setWhy("loading")
                        setWhy(await askWhy(lesson.id, shown.exercise, locale, value))
                      }}
                    >
                      <IconHelpCircle data-icon="inline-start" stroke={1.75} />
                      {t("lesson.why")}
                    </Button>
                  )}
                  {why === "loading" && <IconSparkles className="size-4 animate-pulse text-muted-foreground" aria-hidden="true" />}
                </>
              ) : undefined
            }
          />
        ) : (
          <div className="mx-auto flex max-w-xl gap-3 border-t bg-background/95 px-5 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] backdrop-blur">
            {screen.kind === "card" ? (
              <>
                {screen.index > 0 && (
                  <Button variant="outline" size="lg" aria-label={t("lesson.prev")} onClick={() => saveSession(previousCard(session))}>
                    <IconArrowLeft className="rotate-180 ltr:rotate-0" />
                  </Button>
                )}
                <Button size="lg" className="flex-1" onClick={() => saveSession(nextCard(session))}>
                  {t("lesson.next")}
                  <IconArrowLeft data-icon="inline-end" className="ltr:rotate-180" />
                </Button>
              </>
            ) : (
              <Button size="lg" className="flex-1" disabled={!exercise || !ready(exercise, value)} onClick={onCheck}>
                {t("lesson.check")}
              </Button>
            )}
          </div>
        )}
      </footer>

      <AlertDialog open={askResume} onOpenChange={setAskResume}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("lesson.resumeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{lesson.title}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => saveSession(startSession(lesson))}>{t("lesson.restart")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => setAskResume(false)}>{t("lesson.resume")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function CardView({ lesson, index }: { lesson: LessonT; index: number }) {
  const { t, locale } = useT()
  const card = lesson.cards[index]
  const p = locale === "ar" ? lesson.source?.page_ar : lesson.source?.page
  const page = p && t("lesson.source", { p })
  return (
    <article className="flex flex-col gap-5" aria-roledescription="card">
      {index === 0 && <h1 className="font-heading text-h1 font-bold text-balance">{lesson.title}</h1>}
      {card.kind === "step" && (
        <p className="flex items-center gap-3 text-label font-bold text-primary">
          <span className="grid size-10 place-items-center rounded-full bg-primary text-body text-primary-foreground tabular-nums">
            {num(lesson.cards.slice(0, index + 1).filter((c) => c.kind === "step").length)}
          </span>
          {t("lesson.step")}
        </p>
      )}
      {index === 0 && lesson.media?.video && <SupportVideo src={lesson.media.video} />}
      {Boolean(card.image_url || card.extra_images?.length) && (
        <div className="flex gap-3">
          {[card.image_url, ...(card.extra_images ?? [])].filter(Boolean).map((src) => (
            <img key={src!} src={src!} alt="" className="min-w-0 flex-1 rounded-card bg-card object-contain p-2" loading="lazy" />
          ))}
        </div>
      )}
      {typeof card.text === "string" && card.text && (
        <p className={cn("font-reading text-reading whitespace-pre-line text-foreground", card.hadith && "border-s-4 border-primary/30 ps-4")}>{card.text}</p>
      )}
      {card.quran && <VerseBlock quran={card.quran} />}
      {card.audio && card.audio.length > 0 && <Recitation files={card.audio} />}
      {index === lesson.cards.length - 1 && page && <p className="text-caption text-muted-foreground">{page}</p>}
    </article>
  )
}

/** Al-Fatihah and similar recitations: one file or verse by verse, plain
 * players, no music (rules.md). Audio is part of the approved lesson. */
function Recitation({ files }: { files: string[] }) {
  const { t } = useT()
  return (
    <figure className="flex flex-col gap-2 rounded-card bg-card p-4">
      <figcaption className="text-label font-bold text-muted-foreground">{t("lesson.listen")}</figcaption>
      {files.map((src, i) => (
        <audio key={src} controls preload="none" src={src} className="w-full" aria-label={`${t("lesson.listen")} ${i + 1}`} />
      ))}
    </figure>
  )
}

/** LRN-01 R5: an optional support video, opened only when asked. */
function SupportVideo({ src }: { src: string }) {
  const { t } = useT()
  const [open, setOpen] = React.useState(false)
  return open ? (
    <video controls playsInline preload="metadata" src={src} className="w-full rounded-card bg-black" />
  ) : (
    <Button variant="secondary" className="w-fit" onClick={() => setOpen(true)}>
      {t("lesson.video")}
    </Button>
  )
}
