/**
 * A Quran citation inside a lesson card. The words come only from the
 * stored QuranEnc record (KNW-02 R3, rules.md §1.3): Arabic always, and the
 * translation of the meanings in the learner's language, with its name.
 * Offline before first load: the reference alone, never a guess.
 */
import { useQuery } from "@tanstack/react-query"

import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/app/lib/api"
import { num, useT, type Locale } from "@/app/i18n"
import type { QuranRef } from "@/app/learning/types"
import { suraName } from "./suras"

type Verses = {
  ayat: { aya: number; arabic: string; translation: string | null; url: string }[]
  source: { name: string; translation: string | null; version: string }
}

export function VerseBlock({ quran, lang }: { quran: QuranRef; /** Reviewer desk: the language under review. */ lang?: Locale }) {
  const { t, locale: uiLocale } = useT()
  const locale = lang ?? uiLocale
  const [from, to] = quran.ayat
  const q = useQuery({
    queryKey: ["quran", quran.sura, from, to, locale],
    queryFn: () => api<Verses>(`/api/scripture/quran?sura=${quran.sura}&from=${from}&to=${to}&lang=${locale}`),
    staleTime: Infinity,
    retry: 1,
  })
  const ref = t("lesson.verseRef", { s: suraName(quran.sura, locale), a: from === to ? num(from) : `${num(from)}–${num(to)}` })

  return (
    <figure className="relative isolate overflow-hidden rounded-card bg-secondary/60 px-5 py-6 text-secondary-foreground">
      {q.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3 self-center" />
        </div>
      ) : q.data ? (
        <>
          <blockquote lang="ar" dir="rtl" className="text-center font-quran text-[1.65rem] leading-[2.6] text-foreground">
            {q.data.ayat.map((a) => (
              <span key={a.aya}>
                {a.arabic} <span className="whitespace-nowrap text-primary">﴿{num(a.aya)}﴾</span>{" "}
              </span>
            ))}
          </blockquote>
          {q.data.ayat.some((a) => a.translation) && (
            <div dir="auto" className="mt-4 flex flex-col gap-1 border-t border-primary/15 pt-4 font-reading text-reading text-foreground/90">
              {q.data.ayat.map((a) => a.translation && <p key={a.aya}>{a.translation}</p>)}
            </div>
          )}
        </>
      ) : (
        <p className="text-body text-muted-foreground">{t("lesson.verseOffline")}</p>
      )}
      <figcaption className="mt-4 flex flex-wrap items-center gap-x-2 text-caption text-muted-foreground">
        <span className="font-medium text-secondary-foreground">{ref}</span>
        {q.data?.source.translation && <span>{t("lesson.translation", { name: q.data.source.translation })}</span>}
        {q.data && !q.data.source.translation && <span>{q.data.source.name}</span>}
      </figcaption>
    </figure>
  )
}
