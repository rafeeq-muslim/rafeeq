/**
 * The verified helplines of the danger case, shown at once and offline
 * (companion README; research/08). One tap calls. For a country without a
 * verified list the panel says to call the local emergency number and shows
 * no number (research/08 §1.3).
 */
import * as React from "react"
import { IconPhone } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useT } from "@/app/i18n"
import { COUNTRIES, type Country, HELPLINES, deviceCountry } from "./helplineNumbers"

export function Helplines({ initialCountry, className }: { initialCountry?: Country; className?: string }) {
  const { t } = useT()
  const [country, setCountry] = React.useState<Country>(() => initialCountry ?? deviceCountry())
  const lines = country === "other" ? [] : HELPLINES[country]

  return (
    <section data-slot="helplines" aria-labelledby="helplines-title" className={cn("flex flex-col gap-3", className)}>
      <h2 id="helplines-title" className="text-label font-bold">
        {t("cmp.helplines.title")}
      </h2>
      <ToggleGroup
        type="single"
        variant="outline"
        value={country}
        onValueChange={(v) => v && setCountry(v as Country)}
        aria-label={t("cmp.helplines.country")}
        className="w-full flex-wrap"
      >
        {COUNTRIES.map((c) => (
          <ToggleGroupItem key={c} value={c}>
            {t(`cmp.helplines.${c}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {lines.length === 0 ? (
        <p className="text-body">{t("cmp.helplines.otherBody")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lines.map((l) => (
            <li key={`${country}-${l.number}`}>
              <Item asChild variant="outline" className="min-h-14 bg-card text-start">
                <a href={`tel:${l.number}`}>
                  <ItemMedia>
                    <IconPhone className="size-5 text-primary" stroke={1.75} aria-hidden="true" />
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="text-h3 tabular-nums">
                      <bdi dir="ltr">{l.number}</bdi>
                    </ItemTitle>
                    <ItemDescription className="text-label">{t(l.label)}</ItemDescription>
                  </ItemContent>
                </a>
              </Item>
            </li>
          ))}
        </ul>
      )}
      <p className="text-caption text-muted-foreground">{t("cmp.helplines.note")}</p>
    </section>
  )
}
