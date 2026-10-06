/**
 * A Quran citation inside a lesson card. The words come only from the
 * stored QuranEnc record (KNW-02 R3, rules.md §1.3): Arabic always, and the
 * translation of the meanings in the learner's language, with its name.
 * Offline before first load: the reference alone, never a guess.
 */
import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { IconPlayerPauseFilled, IconPlayerPlayFilled } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/app/lib/api"
import { quranpediaUrl } from "@/app/lib/quranpedia"
import { num, useT, type Locale } from "@/app/i18n"
import type { QuranRef } from "@/app/learning/types"
import { suraName } from "./suras"

type Verses = {
  ayat: { aya: number; arabic: string; translation: string | null; url: string }[]
  source: { name: string; translation: string | null; version: string }
}

/** The quoted word span of a stored verse, or null when the span does not fit
 * it (then the whole verse is shown, as before). Words are never altered. */
export function excerptOf(arabic: string, words: [number, number] | undefined): string | null {
  if (!words) return null
  const all = arabic.split(" ")
  const [from, to] = words
  if (from < 1 || to < from || to > all.length) return null
  return all.slice(from - 1, to).join(" ")
}

/** LRN-01 R4 / LRN-09 R2: Quranpedia per-verse recitation 255 (Alafasy, Hafs),
 * the same file in every language (sources.md). */
export const LESSON_RECITER = 255

/** The file to play under this card, or null: only a whole single verse
 * (never an excerpt: the file would recite the words the card hides) that the
 * server marked approved (`content/quran_recitation.json`). */
export function recitationOf(quran: QuranRef): string | null {
  const [from, to] = quran.ayat
  if (!quran.recite || quran.excerpt != null || from !== to) return null
  return quranpediaUrl(LESSON_RECITER, quran.sura, from)
}

/** A plain «استمع» button: recitation only, no music or effects, nothing
 * loaded before it is pressed. */
function VerseRecitation({ src }: { src: string }) {
  const { t } = useT()
  const ref = React.useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const toggle = () => {
    const audio = ref.current
    if (!audio) return
    if (playing) return audio.pause()
    setFailed(false)
    audio.play()?.catch((e: unknown) => {
      if ((e as { name?: string })?.name !== "AbortError") setFailed(true)
    })
  }
  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <audio
        ref={ref}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          setPlaying(false)
          setFailed(true)
        }}
      />
      <Button variant="outline" size="sm" onClick={toggle}>
        {playing ? <IconPlayerPauseFilled data-icon="inline-start" /> : <IconPlayerPlayFilled data-icon="inline-start" />}
        {t(playing ? "lesson.recite.stop" : "lesson.listen")}
      </Button>
      {failed && (
        <p role="status" className="text-caption text-muted-foreground">
          {t("lesson.recite.offline")}
        </p>
      )}
    </div>
  )
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
  // An excerpt applies to a single verse whose span fits the stored text.
  const single = from === to
  const excerptShown = !!(single && q.data && excerptOf(q.data.ayat[0]?.arabic ?? "", quran.excerpt?.words))
  // The book's translation of the quoted part replaces the full translation (QuranEnc text is never cut).
  const bookTranslation = excerptShown && locale !== "ar" ? quran.excerpt?.translation : undefined
  const recite = recitationOf(quran)
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
                {(single && excerptOf(a.arabic, quran.excerpt?.words)) || a.arabic}{" "}
                <span className="whitespace-nowrap text-primary">﴿{num(a.aya)}﴾</span>{" "}
              </span>
            ))}
          </blockquote>
          {bookTranslation ? (
            <div dir="auto" className="mt-4 border-t border-primary/15 pt-4 font-reading text-reading text-foreground/90">
              <p>{bookTranslation}</p>
            </div>
          ) : (
            q.data.ayat.some((a) => a.translation) && (
              <div dir="auto" className="mt-4 flex flex-col gap-1 border-t border-primary/15 pt-4 font-reading text-reading text-foreground/90">
                {q.data.ayat.map((a) => a.translation && <p key={a.aya}>{a.translation}</p>)}
              </div>
            )
          )}
          {recite && <VerseRecitation src={recite} />}
        </>
      ) : (
        <p className="text-body text-muted-foreground">{t("lesson.verseOffline")}</p>
      )}
      <figcaption className="mt-4 flex flex-wrap items-center gap-x-2 text-caption text-muted-foreground">
        <span className="font-medium text-secondary-foreground">{ref}</span>
        {bookTranslation ? (
          <span>{t("lesson.bookTranslation")}</span>
        ) : (
          q.data?.source.translation && (
            // LRN-01 R3 (QuranEnc terms): the translation's version is shown with its name.
            <span>
              {t("lesson.translation", { name: q.data.source.translation })}
              {q.data.source.version && (
                <>
                  {" "}
                  (<bdi className="tabular-nums">{q.data.source.version}</bdi>)
                </>
              )}
            </span>
          )
        )}
        {q.data && !q.data.source.translation && <span>{q.data.source.name}</span>}
      </figcaption>
    </figure>
  )
}
