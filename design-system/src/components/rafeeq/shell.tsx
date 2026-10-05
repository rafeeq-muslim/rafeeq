import * as React from "react"

import { cn } from "@/lib/utils"
import { RafeeqLogo, RafeeqSymbol } from "./brand"
import { BottomNav, NAV, type NavKey } from "./platform"

/*
 * App shell (PLT). Mobile-first, adapts by the width of its own container
 * (container queries), so the same component is a phone layout inside a
 * phone frame and a desktop layout on a wide screen. Breakpoints follow
 * Material's window size classes:
 *   compact  < 840px  bottom navigation, single column
 *   expanded ≥ 840px  navigation rail (start) + column + side rail (end)
 *   large    ≥ 1200px rail grows into a labelled drawer
 * Safe areas, dvh and overscroll follow Emil Kowalski's mobile-native rules.
 */

function AppShell({
  active,
  onNavigate,
  top,
  aside,
  children,
  bottomNav = true,
  className,
  contentClassName,
}: {
  active: NavKey
  onNavigate?: (key: NavKey) => void
  /** Optional sticky top bar (compact) / column header (expanded). */
  top?: React.ReactNode
  /** Desktop side rail: year flower, streak, daily card… Hidden on phones. */
  aside?: React.ReactNode
  children: React.ReactNode
  /** Full-screen flows (lesson, celebration) hide the navigation. */
  bottomNav?: boolean
  className?: string
  contentClassName?: string
}) {
  return (
    <div
      data-slot="app-shell"
      className={cn("@container/shell relative flex h-full min-h-0 bg-background text-foreground", className)}
    >
      {bottomNav && <NavRail active={active} onNavigate={onNavigate} />}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {top}
        <div className="flex min-h-0 flex-1 justify-center gap-8 overflow-y-auto overscroll-contain @min-[52.5rem]/shell:px-6 @min-[52.5rem]/shell:py-6">
          <main
            className={cn(
              "flex w-full min-w-0 max-w-[37.5rem] flex-col gap-5 pb-6 *:shrink-0",
              contentClassName
            )}
          >
            {children}
          </main>
          {aside && (
            <aside className="sticky top-0 hidden w-80 shrink-0 flex-col gap-4 self-start @min-[52.5rem]/shell:flex">
              {aside}
            </aside>
          )}
        </div>
        {bottomNav && (
          <BottomNav active={active} onNavigate={onNavigate} className="@min-[52.5rem]/shell:hidden" />
        )}
      </div>
    </div>
  )
}

/** Navigation rail (expanded) that becomes a labelled drawer (large). */
function NavRail({
  active,
  onNavigate,
}: {
  active: NavKey
  onNavigate?: (key: NavKey) => void
}) {
  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="hidden w-24 shrink-0 flex-col items-center gap-2 border-e bg-card py-6 @min-[52.5rem]/shell:flex @min-[75rem]/shell:w-64 @min-[75rem]/shell:items-stretch @min-[75rem]/shell:px-4"
    >
      <div className="mb-6 flex justify-center @min-[75rem]/shell:justify-start @min-[75rem]/shell:px-3">
        <RafeeqSymbol size={40} className="@min-[75rem]/shell:hidden" />
        <RafeeqLogo variant="horizontal" className="hidden w-32 min-w-32 @min-[75rem]/shell:block" />
      </div>
      {NAV.map(({ key, label, icon: Icon }) => {
        const on = key === active
        return (
          <button
            key={key}
            type="button"
            aria-current={on ? "page" : undefined}
            onClick={() => onNavigate?.(key)}
            className={cn(
              "group relative flex w-20 flex-col items-center gap-1 rounded-card py-2 text-caption font-medium transition-colors",
              "@min-[75rem]/shell:w-full @min-[75rem]/shell:flex-row @min-[75rem]/shell:gap-3 @min-[75rem]/shell:px-3 @min-[75rem]/shell:py-3 @min-[75rem]/shell:text-body",
              on
                ? "bg-secondary text-secondary-foreground ring-2 ring-primary/20"
                : "text-foreground hover:bg-muted"
            )}
          >
            <span className="relative grid h-8 w-14 place-items-center @min-[75rem]/shell:w-auto">
              <Icon className="size-6" stroke={on ? 2 : 1.75} aria-hidden="true" />
              {on && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 end-3 size-2 rounded-full bg-celebrate @min-[75rem]/shell:-end-1"
                />
              )}
            </span>
            {label}
          </button>
        )
      })}
    </nav>
  )
}

/**
 * Compact top bar: safe-area aware, sticky, translucent. On expanded widths
 * it reads as the column header.
 */
function TopBar({
  start,
  title,
  end,
  className,
}: {
  start?: React.ReactNode
  title?: React.ReactNode
  end?: React.ReactNode
  className?: string
}) {
  return (
    <header
      data-slot="top-bar"
      className={cn(
        "z-10 flex min-h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-4 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md",
        className
      )}
    >
      {start}
      <div className="min-w-0 flex-1 truncate text-body font-bold">{title}</div>
      {end}
    </header>
  )
}

export { AppShell, TopBar }
