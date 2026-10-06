/** Small shared pieces of the Discover screens. */
import * as React from "react"
import { useLocation, useNavigate } from "react-router"
import { IconArrowRight, IconBook2, IconBookmark, IconBookmarkFilled } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { TopBar } from "@/components/rafeeq"
import { useT } from "@/app/i18n"
import { useSaved, type SavedKind } from "./savedStore"
import { useOrganizedHomeCached } from "@/app/home/setting"

/** Sticky bar with a back arrow (mirrors in LTR). */
export function DiscoverBar({ title, back = "/discover", end }: { title: React.ReactNode; back?: string; end?: React.ReactNode }) {
  const { t } = useT()
  const navigate = useNavigate()
  // PLT-09: without the Discover hub, its screens go back to where they now live (Home; «محفوظاتي» to «حسابي»).
  const organized = useOrganizedHomeCached()
  const { pathname } = useLocation()
  const to = organized && back === "/discover" ? (pathname.startsWith("/discover/saved") ? "/me" : "/") : back
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

/**
 * The amber source strip (same tokens as SourceStrip), with its label in the
 * learner's language.
 */
export function SourceLine({ children, href, className }: { children: React.ReactNode; href?: string; className?: string }) {
  const { t } = useT()
  const body = (
    <>
      <IconBook2 className="mt-0.5 size-4 shrink-0" stroke={1.75} aria-hidden="true" />
      <span className="min-w-0">
        <span className="font-bold">{t("discover.source")}: </span>
        {children}
      </span>
    </>
  )
  const classes = cn(
    "flex w-full items-start gap-2 rounded-md border-s-4 border-celebrate bg-celebrate-surface px-3 py-2 text-start text-label text-celebrate-surface-foreground",
    href && "transition-colors hover:bg-celebrate/25",
    className,
  )
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
      {body}
    </a>
  ) : (
    <div className={classes}>{body}</div>
  )
}

/** KNW-09 R1: save or unsave; saving twice keeps one entry. */
export function SaveToggle({ kind, refId, className }: { kind: SavedKind; refId: string; className?: string }) {
  const { t } = useT()
  const saved = useSaved((s) => s.items.some((e) => e.kind === kind && e.ref === refId))
  const save = useSaved((s) => s.save)
  const remove = useSaved((s) => s.remove)
  return (
    <Button
      variant={saved ? "secondary" : "outline"}
      size="sm"
      aria-pressed={saved}
      className={className}
      onClick={() => (saved ? remove(kind, refId) : save(kind, refId))}
    >
      {saved ? <IconBookmarkFilled data-icon="inline-start" /> : <IconBookmark data-icon="inline-start" stroke={1.75} />}
      {saved ? t("discover.savedDone") : t("discover.save")}
    </Button>
  )
}
