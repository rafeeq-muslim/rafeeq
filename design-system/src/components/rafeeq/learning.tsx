import * as React from "react"
import {
  IconArrowLeft,
  IconCheck,
  IconCircleCheck,
  IconInfoCircle,
  IconLock,
  IconStar,
  type TablerIcon,
} from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Progress } from "@/components/ui/progress"
import { RadioGroupItem } from "@/components/ui/radio-group"
import { Halo } from "./brand"
import { StreakChip } from "./motivation"

/* Learning (LRN): the Duolingo-style path, lessons and exercises. */

/**
 * «رحلتك مع رفيق»: the gradient hero on Home. Shows where the user is in
 * the first year and their streak. Text sits on the deep-violet end.
 */
function JourneyCard({
  title = "رحلتك مع رفيق",
  monthLabel,
  streakDays,
  streakPaused,
  className,
  children,
}: {
  title?: string
  /** e.g. «الشهر الثاني» */
  monthLabel: string
  streakDays: number
  streakPaused?: boolean
  className?: string
  children?: React.ReactNode
}) {
  return (
    <section
      data-slot="journey-card"
      className={cn(
        "relative isolate flex flex-col gap-3 overflow-hidden rounded-card bg-grad-main p-5 text-white shadow-raised",
        className
      )}
    >
      <Halo className="absolute -end-10 -top-10 -z-10 size-48 text-white/25" />
      <p className="text-label font-medium text-white/80">{title}</p>
      <h2 className="font-heading text-h2 font-bold">{monthLabel}</h2>
      <div className="flex flex-wrap items-center gap-2">
        <StreakChip
          days={streakDays}
          paused={streakPaused}
          className="bg-white/15 text-white"
        />
      </div>
      {children}
    </section>
  )
}

/** «أكمل التعلّم»: resume the current lesson. */
function LessonCard({
  icon: Icon,
  eyebrow = "أكمل التعلّم",
  title,
  meta,
  progress,
  actionLabel = "تابع",
  onContinue,
  className,
}: {
  icon: TablerIcon
  eyebrow?: string
  /** e.g. «الوضوء — الدرس 3 من 5» */
  title: string
  /** e.g. «4 دقائق» */
  meta?: string
  /** 0–100 */
  progress: number
  actionLabel?: string
  onContinue?: () => void
  className?: string
}) {
  return (
    <Card data-slot="lesson-card" className={className}>
      <CardHeader>
        <CardDescription>{eyebrow}</CardDescription>
        <CardTitle className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-md bg-secondary text-secondary-foreground">
            <Icon className="size-6" stroke={1.75} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-body font-bold">{title}</span>
            {meta && (
              <span className="block text-caption font-normal text-muted-foreground tabular-nums">
                {meta}
              </span>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Progress value={progress} aria-label={`${title}: ${progress}%`} />
      </CardContent>
      <CardFooter>
        <Button className="w-full" onClick={onContinue}>
          {actionLabel}
          <IconArrowLeft data-icon="inline-end" className="ltr:rotate-180" />
        </Button>
      </CardFooter>
    </Card>
  )
}

/** «بطاقة اليوم» (KNW-07): one short, sourced idea per day. Ink on amber. */
function DailyCard({
  eyebrow = "بطاقة اليوم",
  title,
  source,
  actionLabel = "اقرأ البطاقة",
  onOpen,
  className,
}: {
  eyebrow?: string
  title: string
  source?: string
  actionLabel?: string
  onOpen?: () => void
  className?: string
}) {
  return (
    <Card
      data-slot="daily-card"
      className={cn(
        "relative isolate overflow-hidden border-transparent bg-celebrate-surface text-celebrate-surface-foreground",
        className
      )}
    >
      <Halo className="absolute -start-8 -bottom-12 -z-10 size-40 text-celebrate/40" />
      <CardHeader>
        <CardDescription className="text-celebrate-surface-foreground/80">
          {eyebrow}
        </CardDescription>
        <CardTitle className="font-heading text-h3">{title}</CardTitle>
        <CardAction>
          <IconStar className="size-5 text-celebrate" stroke={1.75} aria-hidden="true" />
        </CardAction>
      </CardHeader>
      <CardFooter className="justify-between gap-3">
        {source && <span className="text-caption">{source}</span>}
        <Button size="sm" variant="outline" className="ms-auto border-celebrate/40 bg-card" onClick={onOpen}>
          {actionLabel}
        </Button>
      </CardFooter>
    </Card>
  )
}

/* ---------- Learning path (LRN-02) ---------- */

type PathNodeState = "done" | "current" | "locked"

function LearningPath({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="learning-path"
      className={cn("flex flex-col items-center gap-5 py-2", className)}
      {...props}
    />
  )
}

/** Unit banner that opens each section of the path. */
function PathUnitHeader({
  unit,
  title,
  description,
  className,
}: {
  unit: string
  title: string
  description?: string
  className?: string
}) {
  return (
    <li
      data-slot="path-unit-header"
      className={cn(
        "w-full rounded-card bg-primary p-4 text-primary-foreground",
        className
      )}
    >
      <p className="text-caption font-medium opacity-80">{unit}</p>
      <p className="text-body font-bold">{title}</p>
      {description && <p className="text-caption opacity-80">{description}</p>}
    </li>
  )
}

/**
 * One lesson on the path. Nodes zig-zag using logical offsets so the path
 * mirrors correctly in RTL. `offset` is the node's position in the wave.
 */
function PathNode({
  state,
  label,
  icon: Icon = IconStar,
  offset = 0,
  onSelect,
  className,
}: {
  state: PathNodeState
  label: string
  icon?: TablerIcon
  offset?: -2 | -1 | 0 | 1 | 2
  onSelect?: () => void
  className?: string
}) {
  const shift = {
    "-2": "me-28",
    "-1": "me-14",
    "0": "",
    "1": "ms-14",
    "2": "ms-28",
  }[String(offset) as "-2" | "-1" | "0" | "1" | "2"]
  const stateLabel =
    state === "done" ? "مكتمل" : state === "current" ? "الدرس الحالي" : "مقفل"
  return (
    <li
      data-slot="path-node"
      data-state={state}
      className={cn("flex flex-col items-center gap-1.5", shift, className)}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={state === "locked"}
        aria-current={state === "current" ? "step" : undefined}
        aria-label={`${label}، ${stateLabel}`}
        className={cn(
          "relative grid size-16 place-items-center rounded-full border-b-4 transition-transform duration-200 ease-rafeeq active:translate-y-0.5 active:border-b-2 disabled:cursor-not-allowed",
          state === "done" && "border-black/20 bg-primary text-primary-foreground",
          state === "current" &&
            "size-18 border-black/20 bg-primary text-primary-foreground ring-8 ring-secondary",
          state === "locked" && "border-border bg-muted text-muted-foreground"
        )}
      >
        {state === "done" ? (
          <IconCheck className="size-7" stroke={2} aria-hidden="true" />
        ) : state === "locked" ? (
          <IconLock className="size-6" stroke={1.75} aria-hidden="true" />
        ) : (
          <Icon className="size-7" stroke={1.75} aria-hidden="true" />
        )}
        {state === "current" && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -end-1 size-3.5 rounded-full border-2 border-background bg-celebrate"
          />
        )}
      </button>
      <span
        className={cn(
          "max-w-32 text-center text-caption font-medium",
          state === "locked" ? "text-muted-foreground" : "text-foreground"
        )}
      >
        {label}
      </span>
    </li>
  )
}

/* ---------- Exercises (LRN-03) ---------- */

type ExerciseOptionState = "idle" | "correct" | "incorrect"

/**
 * One answer in a multiple-choice exercise. Composes shadcn's choice card
 * (FieldLabel > Field > RadioGroupItem) so it is a real radio for keyboard
 * and screen readers. Place inside <RadioGroup>.
 */
function ExerciseOption({
  value,
  title,
  description,
  state = "idle",
  disabled,
  className,
}: {
  value: string
  title: string
  description?: string
  state?: ExerciseOptionState
  disabled?: boolean
  className?: string
}) {
  const id = React.useId()
  return (
    <FieldLabel
      htmlFor={id}
      data-slot="exercise-option"
      data-result={state}
      className={cn(
        "rounded-card! bg-card",
        state === "correct" && "border-success! bg-success-surface!",
        state === "incorrect" && "border-destructive! bg-danger-surface!",
        className
      )}
    >
      <Field orientation="horizontal" data-disabled={disabled || undefined}>
        <FieldContent>
          <FieldTitle className="text-body">{title}</FieldTitle>
          {description && <FieldDescription>{description}</FieldDescription>}
        </FieldContent>
        {state === "correct" ? (
          <IconCircleCheck className="size-6 shrink-0 text-success" stroke={1.75} aria-label="إجابة صحيحة" />
        ) : (
          <RadioGroupItem value={value} id={id} disabled={disabled} />
        )}
      </Field>
    </FieldLabel>
  )
}

/**
 * Result panel after «تحقّق». Wrong answers are gentle: no red X screen,
 * no lost hearts; the correct answer and a short reason are shown.
 */
function ExerciseFeedback({
  result,
  title,
  explanation,
  actionLabel = "متابعة",
  onContinue,
  className,
}: {
  result: "correct" | "incorrect"
  title?: string
  explanation?: string
  actionLabel?: string
  onContinue?: () => void
  className?: string
}) {
  const ok = result === "correct"
  return (
    <div
      data-slot="exercise-feedback"
      data-result={result}
      role="status"
      className={cn("flex flex-col gap-3", className)}
    >
      <Alert variant={ok ? "success" : "warning"}>
        {ok ? <IconCircleCheck stroke={1.75} /> : <IconInfoCircle stroke={1.75} />}
        <AlertTitle>{title ?? (ok ? "أحسنت" : "ليست هذه، والصواب موضّح أعلاه")}</AlertTitle>
        {explanation && <AlertDescription>{explanation}</AlertDescription>}
      </Alert>
      <Button size="lg" className="w-full" onClick={onContinue}>
        {actionLabel}
      </Button>
    </div>
  )
}

export {
  JourneyCard,
  LessonCard,
  DailyCard,
  LearningPath,
  PathUnitHeader,
  PathNode,
  ExerciseOption,
  ExerciseFeedback,
}
export type { PathNodeState, ExerciseOptionState }
