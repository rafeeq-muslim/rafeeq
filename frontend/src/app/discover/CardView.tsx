/**
 * KNW-07 today's card. The hadith is the stored HadeethEnc record, shown
 * apart from its explanation (rules.md §1.2), with its source strip. Text
 * only: no images of people (R3). No points, streak or "missed" count (R5).
 */
import { IconChevronDown } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { PetalList, PetalListItem, RafeeqSymbol, SpotIllustration } from "@/components/rafeeq"
import { useT } from "@/app/i18n"
import { cardOfDay, dayNumber } from "./daily"
import { DiscoverBar, SaveToggle, SourceLine } from "./parts"
import { useCards } from "./queries"
import type { DailyCardData } from "./types"

export default function CardView() {
  const { t, locale } = useT()
  const cards = useCards(locale)
  const card = cards.data ? cardOfDay(cards.data.cards, cards.data.total, dayNumber(new Date()), cards.data.previous) : null

  return (
    <>
      <DiscoverBar title={t("discover.daily")} end={card && <SaveToggle kind="card" refId={card.id} />} />
      <div className="flex flex-col gap-6 px-4 pt-5 pb-12">
        {cards.isLoading ? (
          <Skeleton className="h-72 rounded-card" />
        ) : card ? (
          <CardBody card={card} />
        ) : (
          <section className="flex flex-col items-center gap-4 py-10 text-center">
            <SpotIllustration kind="start" size={96} />
            <p className="max-w-sm text-body text-muted-foreground">{cards.isError ? t("discover.loadError") : t("discover.dailyNone")}</p>
          </section>
        )}
      </div>
    </>
  )
}

export function CardBody({ card }: { card: DailyCardData }) {
  const { t, locale } = useT()
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-label font-medium text-muted-foreground">{t("discover.card.today")}</p>
        <h1 dir="auto" className="font-heading text-h2 font-bold text-balance">
          {card.title}
        </h1>
        {card.rafeeq_wording && <Badge variant="outline">{t("discover.card.rafeeqWording")}</Badge>}
      </header>

      {/* The hadith: the source's own text, framed apart from any explanation. */}
      <figure className="relative isolate overflow-hidden rounded-card bg-secondary/60 px-5 py-6 text-secondary-foreground">
        <RafeeqSymbol size={140} title="" aria-hidden="true" tone="ink" className="absolute -end-10 -top-10 -z-10 opacity-[0.06]" />
        <figcaption className="mb-3 text-caption font-bold">{t("discover.card.hadith")}</figcaption>
        <blockquote dir="auto" lang={locale} className="font-reading text-reading text-foreground">
          {card.text}
        </blockquote>
        {card.text_ar && (
          <div className="mt-5 border-t border-primary/15 pt-4">
            <p className="mb-2 text-caption font-bold">{t("discover.card.original")}</p>
            <p lang="ar" dir="rtl" className="font-reading text-reading text-foreground">
              {card.text_ar}
            </p>
          </div>
        )}
        {(card.attribution || card.grade) && (
          <p dir="auto" className="mt-4 text-caption text-muted-foreground">
            {[card.attribution, card.grade && t("discover.card.grade", { grade: card.grade })].filter(Boolean).join(" · ")}
          </p>
        )}
      </figure>

      {card.benefits.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="card-benefits">
          <h2 id="card-benefits" className="font-heading text-h3 font-bold">
            {t("discover.card.benefits")}
          </h2>
          <PetalList>
            {card.benefits.map((b, i) => (
              <PetalListItem key={i} dir="auto">
                {b}
              </PetalListItem>
            ))}
          </PetalList>
        </section>
      )}

      {card.explanation && (
        <details className="group rounded-card border bg-card p-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-body font-bold [&::-webkit-details-marker]:hidden">
            {t("discover.card.explanation")}
            <IconChevronDown className="size-5 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <p dir="auto" className="mt-3 font-reading text-reading whitespace-pre-line text-foreground/90">
            {card.explanation}
          </p>
        </details>
      )}

      <SourceLine href={card.source.url}>
        <bdi>{card.source.name}</bdi>
      </SourceLine>
    </article>
  )
}
