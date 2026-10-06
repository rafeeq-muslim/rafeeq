/**
 * KNW-08 R2 (learning owner's request, 2026-10-06): «الآية السابقة» and
 * «الآية التالية» sit next to play; each jumps one verse and recites it.
 * There is no previous verse on the first verse and no next on the last, so
 * that button does nothing (disabled, kept in place so the bar does not jump).
 * Shared by the surah page and the review desk's reciter sample. The controls
 * add no sound of their own (R1).
 */
import { IconPlayerPauseFilled, IconPlayerPlayFilled, IconPlayerTrackNextFilled, IconPlayerTrackPrevFilled } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useT } from "@/app/i18n"
import { nextAya, prevAya } from "./player"

export function VerseControls({
  playing,
  at,
  count,
  onToggle,
  onJump,
  size = "lg",
  className,
}: {
  /** The recitation is playing now. */
  playing: boolean
  /** The verse the jumps count from: the one being recited, else where listening would start. */
  at: number
  count: number
  onToggle: () => void
  /** Recite this verse (one before or after `at`). */
  onJump: (aya: number) => void
  size?: "default" | "lg"
  className?: string
}) {
  const { t } = useT()
  const prev = prevAya(at)
  const next = nextAya(at, count)
  const step = size === "lg" ? "icon" : "icon-sm"
  return (
    <div role="group" aria-label={t("discover.quran.verseControls")} className={cn("flex shrink-0 items-center gap-1", className)}>
      {/* Drawn for LTR: in RTL "previous" points to the start side (right). */}
      <Button variant="ghost" size={step} aria-label={t("discover.quran.prevVerse")} disabled={prev == null} onClick={() => prev != null && onJump(prev)}>
        <IconPlayerTrackPrevFilled className="rtl:-scale-x-100" />
      </Button>
      <PlayButton playing={playing} onToggle={onToggle} size={size} />
      <Button variant="ghost" size={step} aria-label={t("discover.quran.nextVerse")} disabled={next == null} onClick={() => next != null && onJump(next)}>
        <IconPlayerTrackNextFilled className="rtl:-scale-x-100" />
      </Button>
    </div>
  )
}

/** Play / pause the recitation (alone for a per-surah file, which has no verse boundaries). */
export function PlayButton({ playing, onToggle, size = "lg" }: { playing: boolean; onToggle: () => void; size?: "default" | "lg" }) {
  const { t } = useT()
  return (
    <Button size={size === "lg" ? "icon-lg" : "icon"} aria-label={t(playing ? "discover.quran.pause" : "discover.quran.play")} onClick={onToggle}>
      {playing ? <IconPlayerPauseFilled /> : <IconPlayerPlayFilled />}
    </Button>
  )
}
