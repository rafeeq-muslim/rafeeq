import * as React from "react"

import { cn } from "@/lib/utils"
import logoHorizontalColor from "@/assets/brand/rafeeq-logo-horizontal-color.svg"
import logoHorizontalReverse from "@/assets/brand/rafeeq-logo-horizontal-reverse.svg"
import logoInternationalColor from "@/assets/brand/rafeeq-logo-international-color.svg"
import logoVerticalColor from "@/assets/brand/rafeeq-logo-vertical-color.svg"

/*
 * «زهرة الرفاق»: 12 hollow elliptical petals every 30°, tilted 18°,
 * alternating violet and amber around an amber core. Geometry is copied
 * from the official logo pack (120-unit grid). Below 64px the brand guide
 * requires the thicker "small" stroke (6.2) so the petals stay readable.
 */
const PETAL = { cx: 60, cy: 32, rx: 8, ry: 22, tilt: "rotate(18 60 50)" }

type SymbolTone = "color" | "ink" | "white"

function RafeeqSymbol({
  size = 48,
  tone = "color",
  title = "رفيق",
  className,
  ...props
}: Omit<React.ComponentProps<"svg">, "children"> & {
  size?: number
  tone?: SymbolTone
  title?: string
}) {
  const id = React.useId().replace(/:/g, "")
  const small = size < 64
  const stroke = small ? 6.2 : 3.5
  const mono = tone === "ink" ? "var(--rf-ink)" : "var(--rf-white)"
  return (
    <svg
      data-slot="rafeeq-symbol"
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={cn("shrink-0", className)}
      {...props}
    >
      {tone === "color" && (
        <defs>
          <linearGradient id={`${id}v`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="var(--rf-deep)" />
            <stop offset="0.55" stopColor="var(--rf-lavender)" />
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
      )}
      {Array.from({ length: 12 }, (_, k) => (
        <g key={k} transform={`rotate(${k * 30} 60 60)`}>
          <ellipse
            {...PETAL}
            transform={PETAL.tilt}
            fill="none"
            stroke={
              tone === "color" ? `url(#${id}${k % 2 ? "a" : "v"})` : mono
            }
            strokeOpacity={tone !== "color" && k % 2 ? 0.6 : 1}
            strokeWidth={stroke}
          />
        </g>
      ))}
      <circle
        cx="60"
        cy="60"
        r={small ? 11 : 9}
        fill={tone === "color" ? `url(#${id}c)` : mono}
      />
    </svg>
  )
}

/** One petal, used as the list bullet («البتلة علامةً للقوائم»). */
function PetalBullet({
  tone = "violet",
  className,
}: {
  tone?: "violet" | "amber"
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn(
        "size-3.5 shrink-0",
        tone === "violet" ? "text-primary" : "text-celebrate",
        className
      )}
    >
      <ellipse
        cx="12"
        cy="12"
        rx="4"
        ry="8.5"
        transform="rotate(18 12 12)"
        fill="currentColor"
      />
    </svg>
  )
}

function PetalList({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="petal-list"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function PetalListItem({
  tone = "violet",
  className,
  children,
  ...props
}: React.ComponentProps<"li"> & { tone?: "violet" | "amber" }) {
  return (
    <li
      data-slot="petal-list-item"
      className={cn("flex items-start gap-2 text-body", className)}
      {...props}
    >
      <PetalBullet tone={tone} className="mt-1.5" />
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  )
}

const LOGOS = {
  horizontal: logoHorizontalColor,
  "horizontal-reverse": logoHorizontalReverse,
  vertical: logoVerticalColor,
  international: logoInternationalColor,
} as const

/** Official lockups from the logo pack. Minimum widths per the guide. */
function RafeeqLogo({
  variant = "horizontal",
  className,
  ...props
}: Omit<React.ComponentProps<"img">, "src"> & {
  variant?: keyof typeof LOGOS
}) {
  return (
    <img
      data-slot="rafeeq-logo"
      src={LOGOS[variant]}
      alt="رفيق"
      className={cn(
        variant === "vertical" ? "w-20 min-w-20" : "w-30 min-w-30",
        className
      )}
      {...props}
    />
  )
}

/** «الهالة»: the symbol enlarged with thin strokes, as a background motif. */
function Halo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      aria-hidden="true"
      className={cn("pointer-events-none select-none", className)}
    >
      {Array.from({ length: 12 }, (_, k) => (
        <g key={k} transform={`rotate(${k * 30} 60 60)`}>
          <ellipse
            {...PETAL}
            transform={PETAL.tilt}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.6"
          />
        </g>
      ))}
    </svg>
  )
}

export { RafeeqSymbol, RafeeqLogo, PetalBullet, PetalList, PetalListItem, Halo, PETAL }
