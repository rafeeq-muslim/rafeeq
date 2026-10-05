import * as React from "react"
import {
  IconBolt,
  IconFlame,
  IconLock,
  IconPlayerPause,
  type TablerIcon,
} from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { PETAL } from "./brand"

/*
 * Motivation (MOT). Everything here counts LEARNING only.
 * Worship is never scored, streaked or badged (docs/agents/rules.md).
 */

/**
 * «عدّاد السنة الأولى» (MOT): one petal colours per month of the first year.
 * It measures learning progress, never worship.
 */
function FirstYearCounter({
  month,
  size = 120,
  label,
  className,
}: {
  /** Current month of the journey, 1–12. Months before it are complete. */
  month: number
  size?: number
  /** Visible caption; defaults to «الشهر 2 من 12». */
  label?: React.ReactNode
  className?: string
}) {
  const id = React.useId().replace(/:/g, "")
  const current = Math.min(12, Math.max(1, Math.round(month)))
  return (
    <figure
      data-slot="first-year-counter"
      className={cn("flex flex-col items-center gap-2", className)}
    >
      <svg
        viewBox="0 0 120 120"
        width={size}
        height={size}
        role="img"
        aria-label={`الشهر ${current} من 12 في السنة الأولى`}
      >
        <defs>
          <linearGradient id={`${id}v`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="var(--rf-deep)" />
            <stop offset="1" stopColor="var(--rf-orchid)" />
          </linearGradient>
          <linearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--rf-apricot)" />
            <stop offset="1" stopColor="var(--rf-dawn)" />
          </linearGradient>
          <radialGradient id={`${id}c`}>
            <stop offset="0" stopColor="var(--rf-glow)" />
            <stop offset="1" stopColor="var(--rf-amber)" />
          </radialGradient>
        </defs>
        {/* Inactive petals first so coloured ones are painted on top. */}
        {[...Array(12).keys()]
          .sort((a, b) => Number(a < current) - Number(b < current))
          .map((k) => {
          const done = k < current - 1
          const now = k === current - 1
          return (
            <g key={k} transform={`rotate(${k * 30} 60 60)`}>
              <ellipse
                {...PETAL}
                transform={PETAL.tilt}
                fill="none"
                stroke={
                  done || now
                    ? `url(#${id}${k % 2 ? "a" : "v"})`
                    : "var(--border)"
                }
                strokeWidth={done ? 4.5 : 3.5}
                strokeDasharray={now ? "5 4" : undefined}
              />
            </g>
          )
        })}
        <circle cx="60" cy="60" r="9" fill={`url(#${id}c)`} />
      </svg>
      <figcaption className="text-label font-medium text-muted-foreground tabular-nums">
        {label ?? `الشهر ${current} من 12`}
      </figcaption>
    </figure>
  )
}

/**
 * «وسام المرحلة» (MOT-03): a ring of petals around the stage icon.
 * Awarded for finishing a learning unit or graduating a non-worship habit.
 */
function MilestoneBadge({
  icon: Icon,
  label,
  earned = false,
  size = 88,
  className,
}: {
  icon: TablerIcon
  label?: string
  earned?: boolean
  size?: number
  className?: string
}) {
  return (
    <figure
      data-slot="milestone-badge"
      data-earned={earned}
      className={cn("flex w-fit flex-col items-center gap-2", className)}
    >
      <div
        className="relative grid place-items-center"
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 120 120"
          className="absolute inset-0 size-full"
          aria-hidden="true"
        >
          {Array.from({ length: 12 }, (_, k) => (
            <g key={k} transform={`rotate(${k * 30} 60 60)`}>
              <ellipse
                {...PETAL}
                cy={26}
                ry={18}
                rx={7}
                transform={PETAL.tilt}
                fill="none"
                stroke={
                  earned
                    ? k % 2
                      ? "var(--rf-amber)"
                      : "var(--rf-violet)"
                    : "var(--border)"
                }
                strokeWidth="3.5"
              />
            </g>
          ))}
        </svg>
        <div
          className={cn(
            "relative grid size-[42%] place-items-center rounded-full",
            earned
              ? "bg-grad-glow text-celebrate-foreground shadow-glow"
              : "bg-muted text-muted-foreground"
          )}
        >
          {earned ? (
            <Icon className="size-[55%]" stroke={1.75} aria-hidden="true" />
          ) : (
            <IconLock className="size-[45%]" stroke={1.75} aria-hidden="true" />
          )}
        </div>
      </div>
      {label && (
        <figcaption
          className={cn(
            "max-w-28 text-center text-caption font-medium",
            earned ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {label}
          {!earned && <span className="sr-only"> (لم يُفتح بعد)</span>}
        </figcaption>
      )}
    </figure>
  )
}

/**
 * «السلسلة الرحيمة» (MOT-02): grows with each learning day. When the user
 * misses days it PAUSES; it never resets to zero and never shames.
 */
function StreakChip({
  days,
  paused = false,
  className,
}: {
  days: number
  paused?: boolean
  className?: string
}) {
  return (
    <Badge
      data-slot="streak-chip"
      variant={paused ? "secondary" : "celebrate"}
      className={cn("tabular-nums", className)}
    >
      {paused ? (
        <IconPlayerPause data-icon="inline-start" stroke={1.75} />
      ) : (
        <IconFlame data-icon="inline-start" stroke={1.75} />
      )}
      {paused ? `سلسلتك ${days} أيام · متوقفة مؤقتًا` : `سلسلتك ${days} أيام`}
    </Badge>
  )
}

/** «نقاط التعلّم» (MOT-01): earned from lessons and exercises only. */
function XpChip({ points, className }: { points: number; className?: string }) {
  return (
    <Badge
      data-slot="xp-chip"
      variant="secondary"
      className={cn("tabular-nums", className)}
    >
      <IconBolt data-icon="inline-start" stroke={1.75} />
      {`${points.toLocaleString("en-US")} نقطة تعلّم`}
    </Badge>
  )
}

/**
 * «لوحة الترتيب» row (MOT-04). Opt-in only; shows the display name
 * (never the real name) and learning points.
 */
function LeaderboardRow({
  rank,
  displayName,
  points,
  isYou = false,
  className,
}: {
  rank: number
  displayName: string
  points: number
  isYou?: boolean
  className?: string
}) {
  return (
    <li
      data-slot="leaderboard-row"
      data-you={isYou}
      className={cn(
        "flex min-h-14 items-center gap-3 rounded-md px-4 py-2",
        isYou ? "bg-secondary text-secondary-foreground" : "bg-card",
        className
      )}
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full text-label font-bold tabular-nums",
          rank <= 3 ? "bg-celebrate text-celebrate-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        {rank}
      </span>
      <span className="min-w-0 flex-1 truncate text-body font-medium">
        <bdi>{displayName}</bdi>
        {isYou && <span className="text-caption text-muted-foreground"> (أنت)</span>}
      </span>
      <span className="text-label font-medium tabular-nums text-muted-foreground">
        {points.toLocaleString("en-US")}
      </span>
    </li>
  )
}

export { FirstYearCounter, MilestoneBadge, StreakChip, XpChip, LeaderboardRow }
