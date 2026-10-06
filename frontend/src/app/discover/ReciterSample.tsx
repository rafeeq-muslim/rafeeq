/**
 * KNW-08 R4 in the review desk: the Sharia reviewer listens to a sample of a
 * Quranpedia reciter's surahs, verse by verse over the stored text (as
 * learners will hear it, R2), then approves or returns the reciter with the
 * desk's buttons (recorded with the reviewer's name and date). The reviewer
 * taps a verse or uses «الآية السابقة/التالية» exactly as learners do (R2).
 */
import * as React from "react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { num, useT } from "@/app/i18n"
import { quranpediaUrl } from "@/app/lib/quranpedia"
import { SURA_AR } from "@/app/lesson/suras"
import { AYA_COUNT } from "./ayaCount"
import { ListeningPlayer, nextAya } from "./player"
import { followVerse } from "./reciters"
import { useSuraText } from "./verses"
import { VerseControls } from "./VerseControls"

export type ReciterReviewView = {
  title: string
  reciter: string
  riwaya: string
  source: string
  quranpedia_id: number
  url_pattern: string
  sample_suras: number[]
}

export function ReciterSample({ view }: { view: ReciterReviewView }) {
  const { t } = useT()
  const [sura, setSura] = React.useState(view.sample_suras[0] ?? 1)
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-heading text-h2 font-bold text-balance">{view.title}</h1>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body">
        <dt className="text-muted-foreground">{t("discover.quran.reciterPick")}</dt>
        <dd className="font-bold">{view.reciter}</dd>
        <dt className="text-muted-foreground">{t("desk.reciter.riwaya")}</dt>
        <dd>{view.riwaya}</dd>
        <dt className="text-muted-foreground">{t("discover.source")}</dt>
        <dd>
          <bdi>{view.source}</bdi> · <bdi dir="ltr" className="text-caption break-all">{view.url_pattern}</bdi>
        </dd>
      </dl>
      <p className="rounded-card bg-muted p-4 text-label text-muted-foreground">{t("desk.reciter.hint")}</p>

      <section className="flex flex-col gap-3" aria-labelledby="sample">
        <h2 id="sample" className="text-label font-bold text-muted-foreground">
          {t("desk.reciter.sample")}
        </h2>
        <div className="flex flex-wrap gap-2">
          {view.sample_suras.map((n) => (
            <Button key={n} size="sm" variant={n === sura ? "default" : "outline"} aria-pressed={n === sura} onClick={() => setSura(n)}>
              <span lang="ar">{SURA_AR[n - 1]}</span>
            </Button>
          ))}
        </div>
        <Select value={String(sura)} onValueChange={(v) => setSura(Number(v))}>
          <SelectTrigger className="w-full" aria-label={t("desk.reciter.otherSura")}>
            <SelectValue placeholder={t("desk.reciter.otherSura")} />
          </SelectTrigger>
          <SelectContent>
            {SURA_AR.map((name, i) => (
              <SelectItem key={i} value={String(i + 1)}>
                <span className="tabular-nums">{num(i + 1)}</span> · <span lang="ar">{name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <SampleSura key={`${view.quranpedia_id}:${sura}`} reciter={view.quranpedia_id} sura={sura} />
    </div>
  )
}

/** One surah of the sample, verse by verse, the verse being recited highlighted. */
export function SampleSura({ reciter, sura }: { reciter: number; sura: number }) {
  const { t } = useT()
  const text = useSuraText(sura, "ar")
  const count = AYA_COUNT[sura - 1] ?? 0
  const audioRef = React.useRef<HTMLAudioElement>(null)
  const playerRef = React.useRef<ListeningPlayer | null>(null)
  const listRef = React.useRef<HTMLOListElement>(null)
  const [current, setCurrent] = React.useState<number | null>(null)
  const [playing, setPlaying] = React.useState(false)
  const player = () => (playerRef.current ??= new ListeningPlayer(audioRef.current!))

  const play = (aya: number, fromStart = false) => {
    player().playVerse(sura, aya, quranpediaUrl(reciter, sura, aya), fromStart)
    setCurrent(aya)
    setPlaying(true)
  }

  React.useEffect(() => {
    const el = current == null ? null : listRef.current?.querySelector(`[data-aya="${current}"]`)
    if (el) followVerse(el)
  }, [current])

  return (
    <section className="flex flex-col gap-3">
      <audio
        ref={audioRef}
        preload="none"
        onPause={() => setPlaying(false)}
        onEnded={() => {
          const next = current == null ? null : nextAya(current, count)
          if (next != null) play(next)
          else {
            setPlaying(false)
            setCurrent(null)
          }
        }}
      />
      {count > 0 && (
        <VerseControls
          size="default"
          className="w-fit"
          playing={playing}
          at={current ?? 1}
          count={count}
          onToggle={() => {
            if (playing) {
              player().pause()
              setPlaying(false)
            } else play(current ?? 1)
          }}
          onJump={(aya) => play(aya, true)}
        />
      )}
      {text.isLoading ? (
        <Skeleton className="h-40 rounded-card" />
      ) : text.isError ? (
        <p className="text-body text-muted-foreground">{t("discover.quran.textError")}</p>
      ) : (
        <ol ref={listRef} className="flex flex-col divide-y">
          {(text.data?.ayat ?? []).map((a) => (
            <li
              key={a.aya}
              data-aya={a.aya}
              aria-current={current === a.aya ? "true" : undefined}
              className={cn("border-s-4 py-3 ps-3", current === a.aya ? "rounded-md border-primary bg-secondary" : "border-transparent")}
            >
              <button
                type="button"
                onClick={() => play(a.aya, true)}
                className="w-full rounded-md text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="sr-only">{t("discover.quran.reciteFrom", { n: num(a.aya) })}</span>
                <span lang="ar" dir="rtl" className="block font-quran text-[1.5rem] leading-[2.3] text-foreground">
                  {a.arabic} <span className="whitespace-nowrap text-primary">﴿{num(a.aya)}﴾</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
