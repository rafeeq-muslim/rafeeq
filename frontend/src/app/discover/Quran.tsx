/**
 * KNW-08 listening to the Quran. The recitation plays as recorded, with no
 * other sound (R1); the text and the translation of its meanings come from
 * the stored QuranEnc record (R2); a meaning never plays over the recitation
 * (R3); the reciter and source are named (R4); nothing is counted or
 * rewarded (R5); where the learner stopped stays on this device (R6).
 */
import * as React from "react"
import { useNavigate, useParams } from "react-router"
import { IconArrowLeft, IconPlayerPauseFilled, IconPlayerPlayFilled, IconSearch, IconVolume } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { num, useT } from "@/app/i18n"
import { SURA_AR, SURA_LATIN, suraName } from "@/app/lesson/suras"
import { AYA_COUNT } from "./ayaCount"
import { DiscoverBar, SourceLine } from "./parts"
import { ListeningPlayer, loadPosition, meaningAudioUrl, savePosition } from "./player"
import { useRecitation } from "./queries"
import { meaningLines, useSuraText } from "./verses"

const normalize = (s: string) => s.toLowerCase().replace(/[ً-ْٰ'\-\s]/g, "").replace(/^(ال|al|an|ar|as|at|ad|adh|az|ash)/, "")

export function SuraList() {
  const { t, locale } = useT()
  const navigate = useNavigate()
  const [q, setQ] = React.useState("")
  const query = normalize(q)
  const suras = Array.from({ length: 114 }, (_, i) => i + 1).filter(
    (n) => !query || String(n) === q.trim() || normalize(SURA_AR[n - 1]).includes(query) || normalize(SURA_LATIN[n - 1]).includes(query),
  )
  return (
    <>
      <DiscoverBar title={t("discover.quran")} />
      <div className="flex flex-col gap-4 px-4 pt-4 pb-12">
        <label className="relative block">
          <span className="sr-only">{t("discover.quran.search")}</span>
          <IconSearch className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("discover.quran.search")} className="ps-12" />
        </label>
        <ol className="divide-y">
          {suras.map((n) => (
            <li key={n}>
              <button type="button" onClick={() => navigate(`/discover/quran/${n}`)} className="flex min-h-15 w-full items-center gap-4 py-2.5 text-start">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-label font-bold text-secondary-foreground tabular-nums">
                  {num(n)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-bold">{suraName(n, locale)}</span>
                  <span className="block text-label text-muted-foreground tabular-nums">{t("discover.quran.ayat", { n: num(AYA_COUNT[n - 1]) })}</span>
                </span>
                {locale !== "ar" && (
                  <span lang="ar" dir="rtl" className="font-quran text-h3 text-primary">
                    {SURA_AR[n - 1]}
                  </span>
                )}
                <IconArrowLeft className="size-5 shrink-0 text-muted-foreground ltr:rotate-180" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      </div>
    </>
  )
}

export function SuraPage() {
  const { t, locale } = useT()
  const sura = Math.min(114, Math.max(1, Number(useParams().sura) || 1))
  const text = useSuraText(sura, locale)
  const rec = useRecitation(locale).data?.recitation ?? null
  const recUrl = rec?.suras[String(sura)]

  const audioRef = React.useRef<HTMLAudioElement>(null)
  const playerRef = React.useRef<ListeningPlayer | null>(null)
  const [playing, setPlaying] = React.useState<null | "recitation" | number>(null)
  const saved = React.useMemo(() => loadPosition(sura), [sura])
  const topAya = React.useRef(saved?.aya ?? 1)
  const listRef = React.useRef<HTMLOListElement>(null)

  const player = () => (playerRef.current ??= new ListeningPlayer(audioRef.current!))

  // R6: remember where the learner stopped, on this device only.
  const remember = React.useCallback(() => {
    savePosition(sura, { time: playerRef.current?.recitationPosition() ?? saved?.time ?? 0, aya: topAya.current })
  }, [sura, saved])

  React.useEffect(() => {
    const list = listRef.current
    if (!list || !text.data) return
    if (saved && saved.aya > 1) list.querySelector(`[data-aya="${saved.aya}"]`)?.scrollIntoView({ block: "start" })
    const io = new IntersectionObserver(
      (entries) => {
        const first = entries.filter((e) => e.isIntersecting).map((e) => Number((e.target as HTMLElement).dataset.aya))
        if (first.length) topAya.current = Math.min(...first)
      },
      { rootMargin: "-20% 0px -60% 0px" },
    )
    list.querySelectorAll("[data-aya]").forEach((el) => io.observe(el))
    return () => {
      io.disconnect()
      remember()
    }
  }, [text.data, saved, remember])

  const toggleRecitation = () => {
    if (!recUrl) return
    if (playing === "recitation") {
      player().pause()
      setPlaying(null)
      remember()
    } else {
      player().playRecitation(sura, recUrl, saved?.time ?? 0)
      setPlaying("recitation")
    }
  }

  const playMeaning = (aya: number) => {
    const url = meaningAudioUrl(locale, sura, aya)
    if (!url) return
    topAya.current = aya
    player().playMeaning(sura, aya, url)
    setPlaying(aya)
    remember()
  }

  const lines = text.data ? meaningLines(text.data.ayat) : []
  const source = text.data?.source

  return (
    <>
      <DiscoverBar title={suraName(sura, locale)} back="/discover/quran" />
      {/* One element for every sound on this screen (R3); no controls of our own add sound (R1). */}
      <audio
        ref={audioRef}
        preload="none"
        onEnded={() => {
          setPlaying(null)
          remember()
        }}
        onPause={() => setPlaying((p) => (p === "recitation" ? null : p))}
      />

      <div className="flex flex-col gap-5 px-4 pt-5 pb-4">
        <header className="flex flex-col items-center gap-1 rounded-panel bg-secondary/60 px-5 py-6 text-center text-secondary-foreground">
          <p lang="ar" dir="rtl" className="font-quran text-h1 leading-normal text-foreground">
            سورة {SURA_AR[sura - 1]}
          </p>
          <p className="text-label tabular-nums">{t("discover.quran.ayat", { n: num(AYA_COUNT[sura - 1]) })}</p>
          <p className="text-caption text-muted-foreground">{t("discover.quran.position")}</p>
        </header>

        {!rec && <p className="rounded-card bg-muted p-4 text-label text-muted-foreground">{t("discover.quran.noAudio")}</p>}

        {text.isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
          </div>
        ) : text.isError ? (
          <p className="text-body text-muted-foreground">{t("discover.quran.textError")}</p>
        ) : (
          <ol ref={listRef} className="flex flex-col divide-y">
            {lines.map((l) => (
              <li key={l.aya} data-aya={l.aya} className="flex scroll-mt-20 flex-col gap-3 py-5">
                <p lang="ar" dir="rtl" className="font-quran text-[1.6rem] leading-[2.4] text-foreground">
                  {l.arabic} <span className="whitespace-nowrap text-primary">﴿{num(l.aya)}﴾</span>
                </p>
                {l.meaning && (
                  <div className="flex items-start gap-2">
                    <p dir="auto" className="min-w-0 flex-1 font-reading text-reading text-foreground/90">
                      {l.meaning}
                    </p>
                    {meaningAudioUrl(locale, sura, l.aya) && (
                      <Button
                        variant={playing === l.aya ? "secondary" : "ghost"}
                        size="icon"
                        aria-label={t("discover.quran.listenMeaning", { n: num(l.aya) })}
                        onClick={() => playMeaning(l.aya)}
                      >
                        <IconVolume stroke={1.75} />
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        {source && (
          <SourceLine>
            <bdi>{source.name}</bdi>
            {source.translation && (
              <>
                {" · "}
                {t("discover.quran.meaning")}: <bdi>{source.translation}</bdi> <bdi className="tabular-nums">{source.version}</bdi>
              </>
            )}
            {rec && (
              <>
                {" · "}
                {t("discover.quran.reciter", { name: rec.reciter })} (<bdi>{rec.source}</bdi>)
              </>
            )}
          </SourceLine>
        )}
      </div>

      {rec && recUrl && (
        <div className="sticky bottom-3 z-20 px-4">
          <div className="flex items-center gap-3 rounded-panel bg-card p-3 shadow-raised">
            <Button size="icon-lg" aria-label={t(playing === "recitation" ? "discover.quran.pause" : "discover.quran.play")} onClick={toggleRecitation}>
              {playing === "recitation" ? <IconPlayerPauseFilled /> : <IconPlayerPlayFilled />}
            </Button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-label font-bold">
                {playing === "recitation" || !saved?.time ? t("discover.quran.play") : t("discover.quran.resume", { n: num(saved.aya) })}
              </p>
              <p className="truncate text-caption text-muted-foreground">{t("discover.quran.reciter", { name: rec.reciter })}</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
