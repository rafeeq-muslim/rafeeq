import * as React from "react"
import { IconArrowLeft, IconShare, type TablerIcon } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Halo } from "./brand"
import { CoreGlow, PetalConfetti } from "./graphics"
import { MilestoneBadge } from "./motivation"

/**
 * Milestone celebration (MOT-03), the "peak" of a unit and the delight tier
 * of motion: petal confetti, the core glow, and the badge arriving with a
 * small overshoot. Always on the ink surface (forces the `.dark` tokens).
 * The amber CTA is the one place amber is the primary action. Celebrates
 * learning only; never shown for worship.
 */
function CelebrationScreen({
  icon,
  badgeLabel,
  title,
  message,
  stats = [],
  primaryLabel,
  secondaryLabel = "شارك فرحتك",
  onPrimary,
  onSecondary,
  className,
}: {
  icon: TablerIcon
  /** e.g. «وسام الوضوء» */
  badgeLabel: string
  /** e.g. «أتممت مرحلة الوضوء» */
  title: string
  /** One encouraging sentence about what this unlocks. */
  message?: string
  /** e.g. ["5 دروس"] — learning progress only, never points (rules.md §3) */
  stats?: React.ReactNode[]
  /** e.g. «تابع إلى درس الصلاة» */
  primaryLabel: string
  secondaryLabel?: string
  onPrimary?: () => void
  onSecondary?: () => void
  className?: string
}) {
  return (
    <section
      data-slot="celebration-screen"
      aria-labelledby="celebration-title"
      className={cn(
        "dark relative isolate flex flex-col items-center overflow-hidden bg-[radial-gradient(120%_70%_at_50%_20%,var(--rf-deep)_0%,var(--rf-ink)_70%)] px-6 pt-[calc(env(safe-area-inset-top,0px)+3rem)] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] text-center text-foreground",
        className
      )}
    >
      <Halo className="absolute top-2 -z-10 size-[26rem] text-white/[0.07]" />
      <PetalConfetti className="-z-10 h-[34%]" />

      <div className="relative grid place-items-center">
        <CoreGlow className="size-72 opacity-70" />
        <MilestoneBadge icon={icon} earned size={148} className="badge-pop relative" />
      </div>

      <p className="mt-4 rounded-full bg-celebrate px-4 py-1.5 text-label font-bold text-celebrate-foreground">
        {badgeLabel}
      </p>
      <h2 id="celebration-title" className="mt-4 font-heading text-h1 font-bold text-balance text-white">
        {title}
      </h2>
      {message && <p className="mt-2 max-w-xs text-body text-white/75">{message}</p>}
      {stats.length > 0 && (
        <ul className="mt-5 flex flex-wrap justify-center gap-2">
          {stats.map((s, i) => (
            <li
              key={i}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-label font-medium text-white tabular-nums"
            >
              {s}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex w-full max-w-sm flex-col gap-3 pt-8">
        <Button size="lg" variant="celebrate" className="w-full" onClick={onPrimary}>
          {primaryLabel}
          <IconArrowLeft data-icon="inline-end" className="ltr:rotate-180" />
        </Button>
        <Button size="lg" variant="outline" className="w-full" onClick={onSecondary}>
          <IconShare data-icon="inline-start" stroke={1.75} />
          {secondaryLabel}
        </Button>
      </div>
    </section>
  )
}

export { CelebrationScreen }
