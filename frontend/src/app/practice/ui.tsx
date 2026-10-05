/** Small building blocks shared by the Practice screens. */
import * as React from "react"
import { useNavigate } from "react-router"
import { IconArrowRight, IconBook2, IconChevronLeft, type TablerIcon } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { TopBar } from "@/components/rafeeq"
import { useT, type Key } from "@/app/i18n"
import type { PrayerKey, TimeKey } from "./times"

/** Sticky bar with a back arrow (drawn for RTL, mirrored in LTR). */
export function BackBar({ title, to = "/practice", end }: { title: React.ReactNode; to?: string; end?: React.ReactNode }) {
  const { t } = useT()
  const navigate = useNavigate()
  return (
    <TopBar
      className="sticky top-0"
      start={
        <Button variant="ghost" size="icon" aria-label={t("common.back")} onClick={() => navigate(to)}>
          <IconArrowRight className="ltr:rotate-180" stroke={1.75} />
        </Button>
      }
      title={<span className="font-heading text-h3">{title}</span>}
      end={end}
    />
  )
}

/** A pressable row that leads somewhere: tactile, because it is a button. */
export function NavRow({
  icon: Icon,
  title,
  meta,
  onClick,
  disabled,
  className,
}: {
  icon?: TablerIcon
  title: React.ReactNode
  meta?: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "tactile flex min-h-16 w-full items-center gap-3 rounded-card border-2 bg-card px-4 py-3 text-start [--lip:var(--outline-lip)] disabled:pointer-events-none disabled:opacity-60",
        className
      )}
    >
      {Icon && (
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
          <Icon className="size-5" stroke={1.75} aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-body font-bold">{title}</span>
        {meta && <span className="block text-label text-muted-foreground">{meta}</span>}
      </span>
      <IconChevronLeft className="size-5 shrink-0 text-primary ltr:rotate-180" aria-hidden="true" />
    </button>
  )
}

/** «المصدر: …» in the learner's language, with the source-strip tokens (amber is allowed here). */
export function SourceLine({ children, href, className }: { children: React.ReactNode; href?: string; className?: string }) {
  const { t } = useT()
  const body = (
    <>
      <IconBook2 className="mt-0.5 size-4 shrink-0" stroke={1.75} aria-hidden="true" />
      <span className="min-w-0">
        <span className="font-bold">{t("practice.source")} </span>
        {children}
      </span>
    </>
  )
  const cls = cn(
    "flex w-full items-start gap-2 rounded-md border-s-4 border-celebrate bg-celebrate-surface px-3 py-2 text-start text-label text-celebrate-surface-foreground",
    className
  )
  return href ? (
    <a href={href} target="_blank" rel="noreferrer noopener" className={cls}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  )
}

export function prayerName(t: (k: Key) => string, key: TimeKey | PrayerKey) {
  return t(`practice.prayer.${key}` as Key)
}

/** «1 س 12 د» / «12 د»: compact, so no Arabic plural rules are needed. */
export function durationLabel(t: (k: Key, v?: Record<string, string | number>) => string, d: { h: number; m: number }) {
  return d.h > 0 ? t("practice.dur", { h: d.h, m: d.m }) : t("practice.durMin", { m: d.m })
}

export function SectionTitle({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="font-heading text-h3 font-bold">
      {children}
    </h2>
  )
}
