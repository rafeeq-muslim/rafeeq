import * as React from "react"
import {
  IconArrowLeft,
  IconCheck,
  IconCircleCheckFilled,
  IconInfoCircleFilled,
  IconLock,
  IconStar,
  type TablerIcon,
} from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { RadioGroupItem } from "@/components/ui/radio-group"
import { Halo, RafeeqSymbol } from "./brand"
import { PetalPattern } from "./graphics"
import { StreakChip } from "./motivation"

/*
 * Learning (LRN). Mobile-game tactility (Duolingo-style lips that press
 * down) wrapped in Rafeeq's own graphics: the petal, the halo, the pattern.
 * Wrong answers are gentle: no lost hearts, no red X screen.
 */

/** Medallion: an icon on a white core inside the petal ring. */
function LessonMedallion({
  icon: Icon,
  size = 56,
  className,
}: {
  icon: TablerIcon
  size?: number
  className?: string
}) {
  return (
    <span
      className={cn("relative grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <RafeeqSymbol size={size} title="" className="absolute inset-0 opacity-90" />
      <span className="relative grid size-[46%] place-items-center rounded-full bg-card text-primary shadow-sm">
        <Icon className="size-[62%]" stroke={2} />
      </span>
    </span>
  )
}

/**
 * «تابع من حيث توقفت»: the single most important action on Home. A whole
 * tile that presses down (lip), with the lesson medallion, the lesson and
 * its progress. The tile itself is the button.
 */
function LessonCard({
  icon,
  title,
  meta,
  progress,
  actionLabel = "تابع الدرس",
  onContinue,
  className,
}: {
  icon: TablerIcon
  /** e.g. «الوضوء» */
  title: string
  /** e.g. «الدرس 3 من 5، 4 دقائق» */
  meta?: string
  /** 0–100 */
  progress: number
  actionLabel?: string
  onContinue?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      data-slot="lesson-card"
      onClick={onContinue}
      className={cn(
        "tactile group relative flex w-full flex-col gap-4 overflow-hidden rounded-card border-2 border-border bg-card p-4 text-start [--lip:var(--outline-lip)] hover:border-primary/30",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <LessonMedallion icon={icon} />
        <div className="min-w-0 flex-1">
          <p className="font-heading text-h3 font-bold">{title}</p>
          {meta && <p className="text-label text-muted-foreground tabular-nums">{meta}</p>}
        </div>
      </div>
      <Progress value={progress} aria-label={`${title}: ${progress}%`} className="h-3" />
      <span className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-body font-bold text-primary-foreground shadow-[0_4px_0_0_var(--primary-lip)]">
        {actionLabel}
        <IconArrowLeft className="size-5 ltr:rotate-180" stroke={2} aria-hidden="true" />
      </span>
    </button>
  )
}

/**
 * «بطاقة اليوم» (KNW-07): one short, sourced idea per day. Ink on amber,
 * with the brand flower bleeding off the edge as the illustration.
 */
function DailyCard({
  eyebrow = "بطاقة اليوم",
  title,
  meta,
  actionLabel = "اقرأ البطاقة",
  onOpen,
  className,
}: {
  eyebrow?: string
  title: string
  /** e.g. «دقيقتان» */
  meta?: string
  actionLabel?: string
  onOpen?: () => void
  className?: string
}) {
  return (
    <article
      data-slot="daily-card"
      className={cn(
        "relative isolate flex min-h-40 flex-col justify-between gap-4 overflow-hidden rounded-card bg-celebrate-surface p-5 text-celebrate-surface-foreground",
        className
      )}
    >
      <RafeeqSymbol
        size={180}
        title=""
        aria-hidden="true"
        className="absolute -end-12 -bottom-14 -z-10 rotate-12 opacity-90"
      />
      <div className="max-w-[70%]">
        <p className="text-label font-medium opacity-80">{eyebrow}</p>
        <h3 className="font-heading text-h2 font-bold">{title}</h3>
        {meta && <p className="text-label opacity-80">{meta}</p>}
      </div>
      <Button size="sm" variant="outline" className="w-fit border-celebrate/40 bg-card" onClick={onOpen}>
        {actionLabel}
      </Button>
    </article>
  )
}

/**
 * Journey summary for desktop side panes and small spaces. On Home (mobile)
 * use JourneySky instead.
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
        "relative isolate flex flex-col gap-3 overflow-hidden rounded-card bg-grad-main p-5 text-white",
        className
      )}
    >
      <Halo className="absolute -end-10 -top-10 -z-10 size-48 text-white/25" />
      <p className="text-label font-medium text-white/80">{title}</p>
      <h2 className="font-heading text-h2 font-bold">{monthLabel}</h2>
      <StreakChip days={streakDays} paused={streakPaused} className="bg-white/15 text-white" />
      {children}
    </section>
  )
}

/* ---------- Learning path (LRN-02): the year, month by month ---------- */

type PathNodeState = "done" | "current" | "locked"

function LearningPath({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="learning-path"
      className={cn("flex flex-col items-center gap-6 py-2", className)}
      {...props}
    />
  )
}

/**
 * A unit banner. Units are months of the first year, so the banner carries
 * the month and names the unit's practical goal.
 */
function PathUnitHeader({
  unit,
  title,
  description,
  locked = false,
  className,
}: {
  /** e.g. «الشهر 1» */
  unit: string
  /** The goal, e.g. «يومك الأول» */
  title: string
  description?: string
  locked?: boolean
  className?: string
}) {
  return (
    <li
      data-slot="path-unit-header"
      data-locked={locked}
      className={cn(
        "relative isolate w-full overflow-hidden rounded-card p-5",
        locked ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
        className
      )}
    >
      {!locked && <PetalPattern className="-z-10 text-white/10" />}
      <p className="text-label font-medium opacity-80">{unit}</p>
      <p className="font-heading text-h2 font-bold">{title}</p>
      {description && <p className="text-label opacity-80">{description}</p>}
    </li>
  )
}

/**
 * One lesson on the path: a chunky pebble with a lip. Nodes zig-zag with
 * logical offsets so the path mirrors in RTL. The current node carries the
 * «ابدأ» bubble and a halo ring.
 */
function PathNode({
  state,
  label,
  icon: Icon = IconStar,
  offset = 0,
  startLabel = "ابدأ",
  onSelect,
  className,
}: {
  state: PathNodeState
  label: string
  icon?: TablerIcon
  offset?: -2 | -1 | 0 | 1 | 2
  startLabel?: string
  onSelect?: () => void
  className?: string
}) {
  const shift = { "-2": "me-32", "-1": "me-16", "0": "", "1": "ms-16", "2": "ms-32" }[
    String(offset) as "-2" | "-1" | "0" | "1" | "2"
  ]
  const stateLabel =
    state === "done" ? "مكتمل" : state === "current" ? "الدرس الحالي" : "مقفل"
  return (
    <li
      data-slot="path-node"
      data-state={state}
      className={cn("relative flex flex-col items-center gap-2", shift, className)}
    >
      {state === "current" && (
        <>
          <span className="relative z-10 mb-1 rounded-full border-2 border-border bg-card px-4 py-1.5 text-label font-bold text-primary shadow-[0_3px_0_0_var(--outline-lip)]">
            {startLabel}
          </span>
          <Halo className="pointer-events-none absolute top-5 size-36 text-primary/25" />
        </>
      )}
      <button
        type="button"
        onClick={onSelect}
        disabled={state === "locked"}
        aria-current={state === "current" ? "step" : undefined}
        aria-label={`${label}، ${stateLabel}`}
        className={cn(
          "tactile relative grid place-items-center rounded-full disabled:cursor-not-allowed [--lip-depth:6px]",
          state === "done" && "size-16 bg-primary text-primary-foreground [--lip:var(--primary-lip)]",
          state === "current" &&
            "size-20 bg-primary text-primary-foreground [--lip:var(--primary-lip)]",
          state === "locked" && "size-16 bg-muted text-muted-foreground [--lip:var(--outline-lip)]"
        )}
      >
        {state === "done" ? (
          <IconCheck className="size-8" stroke={2.5} aria-hidden="true" />
        ) : state === "locked" ? (
          <IconLock className="size-7" stroke={2} aria-hidden="true" />
        ) : (
          <Icon className="size-9" stroke={2} aria-hidden="true" />
        )}
        {state === "current" && (
          <span
            aria-hidden="true"
            className="absolute top-0.5 end-0.5 size-4 rounded-full border-[3px] border-background bg-celebrate"
          />
        )}
      </button>
      <span
        className={cn(
          "max-w-32 text-center text-label font-medium",
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
 * One answer tile. A real radio (keyboard and screen reader) styled as a
 * tactile tile: 2px border, a lip, and a press. Place inside <RadioGroup>.
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
    <label
      htmlFor={id}
      data-slot="exercise-option"
      data-result={state}
      className={cn(
        "tactile flex min-h-16 cursor-pointer items-center gap-3 rounded-card border-2 bg-card px-4 py-3 [--lip:var(--outline-lip)]",
        "has-data-[state=checked]:border-primary has-data-[state=checked]:bg-secondary has-data-[state=checked]:[--lip:var(--primary)]",
        state === "correct" && "border-success! bg-success-surface! [--lip:var(--success)]!",
        state === "incorrect" && "border-destructive! bg-danger-surface! [--lip:var(--destructive)]!",
        disabled && "cursor-not-allowed opacity-60",
        className
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-body font-bold">{title}</span>
        {description && <span className="block text-label text-muted-foreground">{description}</span>}
      </span>
      {state === "correct" ? (
        <IconCircleCheckFilled className="size-7 shrink-0 text-success" aria-label="إجابة صحيحة" />
      ) : (
        <RadioGroupItem value={value} id={id} disabled={disabled} className="size-6" />
      )}
    </label>
  )
}

/**
 * Result sheet after «تحقّق»: slides up from the bottom edge (drawer curve)
 * in the result colour, with the next action in thumb reach.
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
  const Icon = ok ? IconCircleCheckFilled : IconInfoCircleFilled
  return (
    <div
      data-slot="exercise-feedback"
      data-result={result}
      role="status"
      className={cn(
        "sheet-up flex flex-col gap-4 rounded-t-panel px-5 pt-5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]",
        ok ? "bg-success-surface text-success" : "bg-warning-surface text-warning",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-card">
          <Icon className="size-7" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-h3 font-bold">
            {title ?? (ok ? "أحسنت" : "ليست هذه، والصواب موضّح أعلاه")}
          </p>
          {explanation && <p className="text-label text-foreground/80">{explanation}</p>}
        </div>
      </div>
      <Button
        size="lg"
        className={cn(
          "w-full",
          ok && "bg-success text-white [--lip:var(--success-lip)] hover:bg-success/92"
        )}
        onClick={onContinue}
      >
        {actionLabel}
      </Button>
    </div>
  )
}

export {
  JourneyCard,
  LessonCard,
  LessonMedallion,
  DailyCard,
  LearningPath,
  PathUnitHeader,
  PathNode,
  ExerciseOption,
  ExerciseFeedback,
}
export type { PathNodeState, ExerciseOptionState }
