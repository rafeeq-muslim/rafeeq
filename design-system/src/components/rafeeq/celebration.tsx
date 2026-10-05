import * as React from "react"
import { IconArrowLeft, IconShare, type TablerIcon } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Halo } from "./brand"
import { MilestoneBadge } from "./motivation"

/**
 * Milestone celebration (MOT-03), the "peak" of a unit. Always on the ink
 * surface (it forces the `.dark` token set), with the core glow and the
 * amber CTA: the one place amber is a primary action. Celebrates learning
 * only; never shown for worship.
 */
function CelebrationScreen({
  icon,
  badgeLabel,
  title,
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
  /** e.g. ["5 دروس", "120 نقطة تعلّم"] */
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
        "dark relative isolate flex flex-col items-center gap-5 overflow-hidden bg-background px-6 py-10 text-center text-foreground",
        className
      )}
    >
      <div
        aria-hidden="true"
        className="absolute top-6 -z-10 size-72 rounded-full bg-grad-glow opacity-25 blur-3xl"
      />
      <Halo className="absolute top-0 -z-10 size-80 text-white/10" />
      <MilestoneBadge
        icon={icon}
        earned
        size={132}
        className="animate-in duration-500 zoom-in-90 fade-in"
      />
      <Badge variant="celebrate" className="h-8 bg-celebrate px-4 text-label text-celebrate-foreground">
        {badgeLabel}
      </Badge>
      <h2 id="celebration-title" className="font-heading text-h1 font-bold text-balance">
        {title}
      </h2>
      {stats.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-2">
          {stats.map((s, i) => (
            <li key={i}>
              <Badge variant="outline" className="h-8 px-3 text-label tabular-nums">
                {s}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex w-full max-w-sm flex-col gap-2.5">
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
