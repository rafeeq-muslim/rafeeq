import * as React from "react"
import { IconFlame, IconPlayerPause } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Halo } from "./brand"
import { PetalPattern, YearFlower } from "./graphics"

/**
 * «سماء الرحلة» (LRN-02 · MOT): the Home hero. A night-sky surface (ink to
 * deep violet) with the halo and the petal pattern, the greeting, the day
 * count, and the year flower that has coloured one petal per month of
 * learning. Content below it sits on a mist sheet that overlaps its bottom
 * edge (`JourneySheet`).
 */
function JourneySky({
  name,
  day,
  month,
  monthLabel,
  streakDays,
  streakPaused = false,
  greeting = "السلام عليكم",
  actions,
  className,
}: {
  /** Display name only. */
  name?: string
  /** Day number with Rafeeq, e.g. 42. */
  day: number
  /** Months of learning completed (0–12) for the year flower. */
  month: number
  /** e.g. «الشهر الثاني» */
  monthLabel: string
  streakDays: number
  streakPaused?: boolean
  greeting?: string
  /** Top-end actions (e.g. avatar, language). */
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <section
      data-slot="journey-sky"
      aria-label="رحلتك مع رفيق"
      className={cn(
        "dark relative isolate overflow-hidden bg-[linear-gradient(180deg,var(--rf-ink)_0%,var(--rf-deep)_100%)] px-5 pt-[calc(env(safe-area-inset-top,0px)+1.25rem)] pb-14 text-foreground @min-[52.5rem]/shell:rounded-panel @min-[52.5rem]/shell:px-8 @min-[52.5rem]/shell:pb-8",
        className
      )}
    >
      <PetalPattern className="-z-10 text-white/[0.045]" scale={1.2} />

      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-label text-white/70">{name ? `${greeting}، ${name}` : greeting}</p>
          <p className="text-label font-medium text-white tabular-nums">{`يومك ${day} مع رفيق`}</p>
        </div>
        {actions}
      </div>

      <div className="mt-5 flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-h1 font-bold text-balance text-white @min-[52.5rem]/shell:text-display">
            {monthLabel}
          </h1>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-label font-medium text-white tabular-nums">
            {streakPaused ? (
              <IconPlayerPause className="size-4 text-apricot" stroke={1.75} aria-hidden="true" />
            ) : (
              <IconFlame className="size-4 text-apricot" stroke={1.75} aria-hidden="true" />
            )}
            {streakPaused ? `سلسلتك ${streakDays} أيام · متوقفة مؤقتًا` : `سلسلتك ${streakDays} أيام`}
          </p>
        </div>
        <div className="relative grid shrink-0 place-items-center">
          <Halo className="absolute -z-10 size-64 text-white/15" />
          <YearFlower month={month} size={124} tone="night" />
        </div>
      </div>
    </section>
  )
}

/** The mist sheet that overlaps the sky: radius 28 at the top, like iOS sheets. */
function JourneySheet({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="journey-sheet"
      className={cn(
        "relative -mt-8 flex flex-col gap-5 rounded-t-panel bg-background px-4 pt-6 @min-[52.5rem]/shell:mt-0 @min-[52.5rem]/shell:px-0 @min-[52.5rem]/shell:pt-0",
        className
      )}
      {...props}
    />
  )
}

export { JourneySky, JourneySheet }
