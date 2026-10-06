/**
 * PLT-08 R1–R3, R6: one quiet suggestion on Home, after the next step. It
 * introduces a tool at the moment the journey needs it; it never nags about
 * worship, never pops up, and once hidden it does not come back.
 */
import { useNavigate } from "react-router"
import { IconCards, IconClock, IconHeadset, IconMoon, IconSunMoon, IconX, type Icon as TablerIcon } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { IconTile } from "@/components/rafeeq"
import { useT, type Key } from "@/app/i18n"
import { useSuggestion } from "./useGuide"
import type { MomentId } from "./suggest"

const COPY: Record<MomentId, { title: Key; body: Key; cta: Key }> = {
  ramadan: { title: "guide.suggest.ramadan.title", body: "guide.suggest.ramadan.body", cta: "guide.suggest.ramadan.cta" },
  prayer: { title: "guide.suggest.prayer.title", body: "guide.suggest.prayer.body", cta: "guide.suggest.prayer.cta" },
  human: { title: "guide.suggest.human.title", body: "guide.suggest.human.body", cta: "guide.suggest.human.cta" },
  adhkar: { title: "guide.suggest.adhkar.title", body: "guide.suggest.adhkar.body", cta: "guide.suggest.adhkar.cta" },
  discover: { title: "guide.suggest.discover.title", body: "guide.suggest.discover.body", cta: "guide.suggest.discover.cta" },
}

/** The same icon the feature has in «كل ما في رفيق» (catalogue.ts). */
const ICON: Record<MomentId, TablerIcon> = { ramadan: IconMoon, prayer: IconClock, human: IconHeadset, adhkar: IconSunMoon, discover: IconCards }

export function SuggestionCard() {
  const { t } = useT()
  const navigate = useNavigate()
  const { current, dismiss } = useSuggestion()
  if (!current) return null
  const { id, route } = current.moment
  const copy = COPY[id]
  return (
    <section aria-labelledby="suggest-title" className="flex items-start gap-3 rounded-card bg-card p-4 shadow-card">
      <MomentIcon id={id} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id="suggest-title" className="text-body font-bold">
          {t(copy.title)}
        </h2>
        <p className="text-label text-muted-foreground">{t(copy.body)}</p>
        <Button variant="secondary" size="sm" className="mt-2 self-start" onClick={() => navigate(route)}>
          {t(copy.cta)}
        </Button>
      </div>
      <Button variant="ghost" size="icon" className="-me-2 -mt-2 shrink-0 text-muted-foreground" aria-label={t("guide.suggest.hide")} onClick={dismiss}>
        <IconX stroke={1.75} />
      </Button>
    </section>
  )
}

function MomentIcon({ id }: { id: MomentId }) {
  const Icon = ICON[id]
  return <IconTile icon={Icon} size="lg" />
}
