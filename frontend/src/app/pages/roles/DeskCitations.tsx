/**
 * Review desk helpers (knw-audit-gaps).
 * KNW-05 R2: a card's cited hadith beside it, from the stored HadeethEnc record
 * (text, grade, reference), never the card's own wording of it.
 * KNW-03 R3 ex2: glossary concepts the item writes with a non-approved spelling.
 */
import { dirOf, num, useT, type Locale } from "@/app/i18n"

export type HadithRecord = {
  text: string
  grade: string | null
  attribution: string | null
  reference: string | null
  url: string
  version: string
}
export type GlossaryFlag = { concept: string; found: string; term: string }

export function HadithCitations({ ids, records, lang }: { ids: number[]; records: Record<string, HadithRecord | null> | undefined; lang: Locale }) {
  const { t } = useT()
  return (
    <ul className="flex flex-col gap-2">
      {ids.map((id) => {
        const h = records?.[String(id)]
        if (!h)
          return (
            <li key={id} className="rounded-md bg-danger-surface px-3 py-2 text-label text-destructive">
              {t("desk.cite.missing", { id: num(id) })}
            </li>
          )
        return (
          <li key={id} className="flex flex-col gap-2 rounded-md border-s-4 border-primary bg-muted px-3 py-2">
            <span className="text-caption text-muted-foreground">
              {t("desk.cite.hadith")} · <bdi dir="ltr">HadeethEnc #{id}</bdi>
            </span>
            <p lang={lang} dir={dirOf(lang)} className="font-reading text-reading whitespace-pre-line">
              {h.text}
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-label">
              <dt className="text-muted-foreground">{t("desk.cite.grade")}</dt>
              <dd lang={lang}>{h.grade ?? "—"}</dd>
              <dt className="text-muted-foreground">{t("desk.cite.reference")}</dt>
              <dd lang={lang}>{[h.attribution, h.reference].filter(Boolean).join(" · ") || "—"}</dd>
            </dl>
            <a href={h.url} target="_blank" rel="noreferrer" className="w-fit text-caption text-primary underline" dir="ltr">
              {h.url}
            </a>
          </li>
        )
      })}
    </ul>
  )
}

export function GlossaryFlags({ flags }: { flags: GlossaryFlag[] | undefined }) {
  const { t } = useT()
  if (!flags?.length) return null
  return (
    <section className="flex flex-col gap-2 rounded-card bg-warning-surface p-4 text-warning" aria-labelledby="glossary-flags">
      <h2 id="glossary-flags" className="text-label font-bold">
        {t("desk.glossary.title")}
      </h2>
      <ul className="flex flex-col gap-1 text-label">
        {flags.map((f) => (
          <li key={`${f.concept}:${f.found}`}>
            <bdi>{f.concept}</bdi>: {t("desk.glossary.flag", { found: f.found, term: f.term })}
          </li>
        ))}
      </ul>
    </section>
  )
}
