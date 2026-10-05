/**
 * Discover hub: today's card first (KNW-07), then the library (KNW-06),
 * Quran listening (KNW-08) and saved items (KNW-09). No counts, no streaks.
 */
import { useNavigate } from "react-router"
import { IconArrowLeft, IconBookmark, IconBooks, IconHeadphones, type TablerIcon } from "@tabler/icons-react"

import { Skeleton } from "@/components/ui/skeleton"
import { DailyCard, PetalPattern, TopBar } from "@/components/rafeeq"
import { useT, type Key } from "@/app/i18n"
import { cardOfDay, dayNumber } from "./daily"
import { useCards } from "./queries"

const ENTRIES: { to: string; title: Key; body: Key; icon: TablerIcon }[] = [
  { to: "/discover/library", title: "discover.library", body: "discover.libraryBody", icon: IconBooks },
  { to: "/discover/quran", title: "discover.quran", body: "discover.quranBody", icon: IconHeadphones },
  { to: "/discover/saved", title: "discover.saved", body: "discover.savedBody", icon: IconBookmark },
]

export default function Hub() {
  const { t, locale } = useT()
  const navigate = useNavigate()
  const cards = useCards(locale)
  const today = cards.data ? cardOfDay(cards.data.cards, cards.data.total, dayNumber(new Date()), cards.data.previous) : null

  return (
    <>
      <TopBar className="sticky top-0" title={<span className="font-heading text-h3">{t("discover.title")}</span>} />
      <div className="relative isolate flex flex-col gap-6 px-4 pt-5 pb-10">
        <PetalPattern className="-z-10 h-56 text-primary/[0.05] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <p className="max-w-prose text-body text-muted-foreground">{t("discover.lede")}</p>

        {cards.isLoading ? (
          <Skeleton className="h-40 rounded-card" />
        ) : today ? (
          <DailyCard
            eyebrow={t("discover.daily")}
            title={today.title}
            meta={t("discover.dailyMeta")}
            actionLabel={t("discover.dailyOpen")}
            onOpen={() => navigate("/discover/card")}
          />
        ) : (
          <p className="rounded-card bg-muted p-5 text-body text-muted-foreground">{cards.isError ? t("discover.loadError") : t("discover.dailyNone")}</p>
        )}

        <nav aria-label={t("discover.title")} className="flex flex-col gap-3">
          {ENTRIES.map(({ to, title, body, icon: Icon }) => (
            <button
              key={to}
              type="button"
              onClick={() => navigate(to)}
              className="tactile flex min-h-18 items-center gap-4 rounded-card border-2 bg-card p-4 text-start [--lip:var(--outline-lip)]"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
                <Icon className="size-6" stroke={1.75} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body font-bold">{t(title)}</span>
                <span className="block text-label text-muted-foreground">{t(body)}</span>
              </span>
              <IconArrowLeft className="size-5 shrink-0 text-primary ltr:rotate-180" aria-hidden="true" />
            </button>
          ))}
        </nav>
      </div>
    </>
  )
}
