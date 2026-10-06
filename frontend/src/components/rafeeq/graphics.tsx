import * as React from "react"
import type { TablerIcon } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { PETAL } from "./brand"

/*
 * Brand graphics (brand guide pp. 26–27). Every shape is generated from the
 * logo petal (rx 8, ry 22 on a 120 grid, tilted 18°, 30° steps), so the
 * visuals stay on-brand at any size and need no image files.
 */

const VIOLET_STOPS = ["var(--rf-deep)", "var(--rf-lavender)", "var(--rf-orchid)"]
const AMBER_STOPS = ["var(--rf-apricot)", "var(--rf-dawn)"]

/** Gradient <defs> shared by the flower graphics. */
function FlowerDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}v`} x1="0" y1="1" x2="1" y2="0">
        {VIOLET_STOPS.map((c, i) => (
          <stop key={c} offset={i / (VIOLET_STOPS.length - 1)} stopColor={c} />
        ))}
      </linearGradient>
      <linearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="1">
        {AMBER_STOPS.map((c, i) => (
          <stop key={c} offset={i} stopColor={c} />
        ))}
      </linearGradient>
      <radialGradient id={`${id}c`}>
        <stop offset="0" stopColor="var(--rf-glow)" />
        <stop offset="1" stopColor="var(--rf-amber)" />
      </radialGradient>
      <radialGradient id={`${id}g`}>
        <stop offset="0" stopColor="var(--rf-amber)" stopOpacity="0.55" />
        <stop offset="1" stopColor="var(--rf-amber)" stopOpacity="0" />
      </radialGradient>
    </defs>
  )
}

/**
 * «عدّاد السنة الأولى» as the hero graphic. Petals colour month by month,
 * starting at the top and going clockwise; the core glows when the year is
 * complete. On first paint the coloured petals bloom in sequence (the one
 * orchestrated motion on Home). Measures learning, never worship.
 */
function YearFlower({
  month,
  size = 160,
  bloom = true,
  tone = "day",
  className,
  label,
}: {
  /** Months of learning completed, 0–12. */
  month: number
  size?: number
  bloom?: boolean
  /** `night` for ink/violet surfaces (inactive petals turn white/15). */
  tone?: "day" | "night"
  className?: string
  /** Accessible label; defaults to «أكملت 2 من 12 شهرًا». */
  label?: string
}) {
  const id = React.useId().replace(/:/g, "")
  const done = Math.min(12, Math.max(0, Math.round(month)))
  const complete = done === 12
  const idle = tone === "night" ? "rgb(255 255 255 / 0.18)" : "var(--border)"
  // Inactive petals first so the coloured ones are painted on top.
  const order = [...Array(12).keys()].sort((a, b) => Number(a < done) - Number(b < done))
  return (
    <svg
      data-slot="year-flower"
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label={label ?? `أكملت ${done} من 12 شهرًا في سنتك الأولى`}
      className={cn("shrink-0 overflow-visible", className)}
    >
      <FlowerDefs id={id} />
      {complete && <circle cx="60" cy="60" r="58" fill={`url(#${id}g)`} />}
      {order.map((k) => {
        const on = k < done
        return (
          <g key={k} transform={`rotate(${k * 30} 60 60)`}>
            <ellipse
              {...PETAL}
              transform={PETAL.tilt}
              fill="none"
              stroke={on ? `url(#${id}${k % 2 ? "a" : "v"})` : idle}
              strokeWidth={on ? 4.6 : 2.4}
              strokeLinecap="round"
              pathLength={1}
              className={cn(on && bloom && "petal-draw")}
              style={on && bloom ? ({ "--i": k } as React.CSSProperties) : undefined}
            />
          </g>
        )
      })}
      <circle cx="60" cy="60" r={complete ? 11 : 9} fill={`url(#${id}c)`} />
    </svg>
  )
}

/**
 * «نقشة الرفاق»: tone-on-tone repeat of the symbol. Set its colour with a
 * text utility on a coloured surface, e.g. `text-white/10` on violet.
 */
function PetalPattern({
  className,
  scale = 1,
}: {
  className?: string
  /** 1 = 64px tile. */
  scale?: number
}) {
  const id = React.useId().replace(/:/g, "")
  const tile = 64 * scale
  const flower = (cx: number, cy: number, r: number) => (
    <g transform={`translate(${cx - r} ${cy - r}) scale(${(2 * r) / 120})`}>
      {Array.from({ length: 12 }, (_, k) => (
        <g key={k} transform={`rotate(${k * 30} 60 60)`}>
          <ellipse {...PETAL} transform={PETAL.tilt} fill="none" stroke="currentColor" strokeWidth="5" />
        </g>
      ))}
    </g>
  )
  return (
    <svg aria-hidden="true" className={cn("pointer-events-none absolute inset-0 size-full", className)}>
      <defs>
        <pattern id={id} width={tile} height={tile} patternUnits="userSpaceOnUse">
          {flower(tile * 0.25, tile * 0.25, tile * 0.17)}
          {flower(tile * 0.75, tile * 0.75, tile * 0.17)}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  )
}

/**
 * «خلفية رفيق» (PLT-04): the app backdrop. The companionship gradient as
 * soft washes (`--backdrop`, one set per theme, mirrored in RTL) with the
 * petal pattern fading out from the top. Place it first inside an
 * `isolate` container that paints the background colour; text on it keeps
 * 4.5:1 or more.
 */
function Backdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-slot="backdrop"
      className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-backdrop", className)}
    >
      <PetalPattern
        scale={1.5}
        className="text-backdrop-pattern [mask-image:linear-gradient(to_bottom,black,transparent_45%)]"
      />
    </div>
  )
}

/**
 * «بلاطة الأيقونة» (PLT-04): a row's or a tool's icon on the violet
 * gradient (lavender → deep), white icon at 4.7:1 or more. Violet only:
 * it marks something to open, never a celebration.
 */
function IconTile({
  icon: Icon,
  size = "md",
  className,
}: {
  icon: TablerIcon
  /** sm 40px, md 44px, lg 48px */
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  return (
    <span
      data-slot="icon-tile"
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-primary bg-grad-tile text-tile-foreground",
        { sm: "size-10 [&>svg]:size-5", md: "size-11 [&>svg]:size-5", lg: "size-12 [&>svg]:size-6" }[size],
        className
      )}
    >
      <Icon stroke={2} />
    </span>
  )
}

/** «وهج النواة»: soft amber light behind a number or a badge. */
function CoreGlow({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute rounded-full bg-[radial-gradient(circle,var(--rf-glow)_0%,color-mix(in_oklab,var(--rf-amber)_45%,transparent)_38%,transparent_70%)]",
        className
      )}
    />
  )
}

// Hand-placed so the burst looks scattered but balanced (x/y in %, rotation).
const CONFETTI: [number, number, number, number][] = [
  [12, 18, -30, 0], [24, 8, 40, 1], [40, 4, -10, 2], [62, 6, 25, 3], [78, 10, -45, 0],
  [90, 22, 15, 1], [6, 38, 60, 2], [94, 42, -20, 3], [16, 56, -60, 1], [86, 60, 35, 0],
  [30, 22, 75, 3], [70, 24, -70, 2], [50, 14, 5, 1], [8, 70, 20, 3], [92, 74, -35, 2],
]
const CONFETTI_COLORS = ["var(--rf-amber)", "var(--rf-lavender)", "var(--rf-apricot)", "var(--rf-orchid)"]

/** Petal confetti for celebration screens. Static when motion is reduced. */
function PetalConfetti({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0", className)}>
      {CONFETTI.map(([x, y, r, c], i) => (
        <svg
          key={i}
          viewBox="0 0 12 24"
          className="petal-pop absolute h-5 w-2.5"
          style={
            {
              insetInlineStart: `${x}%`,
              top: `${y}%`,
              rotate: `${r}deg`,
              "--i": i,
            } as React.CSSProperties
          }
        >
          <ellipse cx="6" cy="12" rx="5" ry="11" fill={CONFETTI_COLORS[c]} />
        </svg>
      ))}
    </div>
  )
}

/** A row of small petals (brand p. 26) used as a divider or a mini progress. */
function PetalRow({
  count = 8,
  filled = count,
  className,
}: {
  count?: number
  /** How many petals are coloured (the rest are muted). */
  filled?: number
  className?: string
}) {
  return (
    <div aria-hidden="true" className={cn("flex items-center gap-1.5", className)}>
      {Array.from({ length: count }, (_, i) => (
        <svg key={i} viewBox="0 0 12 24" className="h-4 w-2 rotate-[18deg]">
          <ellipse
            cx="6"
            cy="12"
            rx="4.5"
            ry="10.5"
            fill={i < filled ? (i % 2 ? "var(--rf-amber)" : "var(--rf-violet)") : "var(--border)"}
          />
        </svg>
      ))}
    </div>
  )
}

/**
 * «زهرة الوحدة» (LRN-03 R4 completion): one petal per lesson of the unit,
 * spaced evenly around the core. Completed petals carry the brand gradient;
 * the lesson just finished (`fresh`) blooms in once, amber. Reduced motion
 * shows the final state.
 */
function UnitBloom({
  total,
  done,
  fresh,
  size = 220,
  className,
  label,
}: {
  total: number
  /** Petals completed, including the fresh one. */
  done: number
  /** Index of the petal that just bloomed. */
  fresh?: number
  size?: number
  className?: string
  label?: string
}) {
  const id = React.useId().replace(/:/g, "")
  const n = Math.max(1, total)
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={label} className={className}>
      <FlowerDefs id={id} />
      {Array.from({ length: n }, (_, i) => {
        const on = i < done
        const isFresh = i === fresh
        return (
          <g key={i} transform={`rotate(${(360 / n) * i} 60 60)`}>
            <g
              className={isFresh ? "petal-pop" : undefined}
              style={isFresh ? ({ transformBox: "fill-box", transformOrigin: "center", animationDelay: "250ms" } as React.CSSProperties) : undefined}
            >
              <ellipse
                {...PETAL}
                transform={PETAL.tilt}
                fill={isFresh ? `url(#${id}a)` : on ? `url(#${id}v)` : "rgb(255 255 255 / 0.12)"}
              />
            </g>
          </g>
        )
      })}
      <circle cx="60" cy="60" r="9" fill={done >= n ? `url(#${id}a)` : "rgb(255 255 255 / 0.9)"} />
    </svg>
  )
}

type SpotKind = "saved" | "companion" | "offline" | "start"

/**
 * Spot illustrations for empty states and onboarding, built only from the
 * brand grammar: petal, core, rounded rectangle, pill shadow. No people,
 * faces or living beings. Colourful for wins, quiet for empty states.
 */
function SpotIllustration({
  kind,
  size = 120,
  className,
}: {
  kind: SpotKind
  size?: number
  className?: string
}) {
  const id = React.useId().replace(/:/g, "")
  const petal = (k: number, fill: string, opacity = 1) => (
    <g key={k} transform={`rotate(${k * 30} 60 60)`}>
      <ellipse {...PETAL} transform={PETAL.tilt} fill={fill} opacity={opacity} />
    </g>
  )
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden="true"
      className={cn("shrink-0 overflow-visible", className)}
    >
      <FlowerDefs id={id} />
      {/* pill shadow, never an oval blob */}
      <rect x="30" y="108" width="60" height="6" rx="3" fill="var(--rf-violet)" opacity="0.1" />
      {kind === "saved" && (
        <>
          <rect x="30" y="18" width="60" height="80" rx="12" fill="var(--rf-white)" stroke="var(--border)" strokeWidth="3" />
          <rect x="40" y="36" width="40" height="5" rx="2.5" fill="var(--border)" />
          <rect x="40" y="48" width="30" height="5" rx="2.5" fill="var(--border)" />
          <g transform="translate(58 58) scale(0.42)">{[0, 1, 2].map((k) => petal(k * 4, `url(#${id}${k % 2 ? "a" : "v"})`))}</g>
        </>
      )}
      {kind === "companion" && (
        <>
          <g opacity="0.95">{[0, 2, 4, 6, 8, 10].map((k) => petal(k, `url(#${id}v)`, 0.85))}</g>
          <g>{[1, 3, 5, 7, 9, 11].map((k) => petal(k, `url(#${id}a)`, 0.9))}</g>
          <circle cx="60" cy="60" r="12" fill={`url(#${id}c)`} />
        </>
      )}
      {kind === "offline" && (
        <>
          {Array.from({ length: 12 }, (_, k) => (
            <g key={k} transform={`rotate(${k * 30} 60 60)`}>
              <ellipse {...PETAL} transform={PETAL.tilt} fill="none" stroke="var(--border)" strokeWidth="4" strokeDasharray={k % 3 ? undefined : "6 6"} />
            </g>
          ))}
          <circle cx="60" cy="60" r="9" fill="var(--border)" />
        </>
      )}
      {kind === "start" && (
        <>
          {petal(0, `url(#${id}v)`)}
          {Array.from({ length: 11 }, (_, i) => (
            <g key={i} transform={`rotate(${(i + 1) * 30} 60 60)`}>
              <ellipse {...PETAL} transform={PETAL.tilt} fill="none" stroke="var(--border)" strokeWidth="3" />
            </g>
          ))}
          <circle cx="60" cy="60" r="10" fill={`url(#${id}c)`} />
        </>
      )}
    </svg>
  )
}

export { YearFlower, PetalPattern, Backdrop, IconTile, CoreGlow, PetalConfetti, PetalRow, FlowerDefs, SpotIllustration, UnitBloom }
export type { SpotKind }
