/**
 * KNW-08 listening to the Quran. The recitation plays as recorded, with no
 * other sound (R1); the text and the translation of its meanings come from
 * the stored QuranEnc record (R2); a meaning never plays over the recitation
 * (R3); the reciter and source are named (R4); nothing is counted or
 * rewarded (R5); where the learner stopped stays on this device (R6).
 *
 * R2/R4 (decision 2026-10-06): once the Sharia reviewer has approved a
 * Quranpedia per-verse Hafs reciter, the surah plays verse by verse and the
 * stored verse being recited is highlighted and kept in view; until then,
 * al-Muaiqly's per-surah file plays as before. Nothing is shown outside the
 * page (no lock-screen metadata), so discreet mode stays discreet.
 *
 * R2 (learning owner's request, 2026-10-06): tapping a verse recites from it,
 * then the verses after it follow as usual; «الآية السابقة» / «الآية التالية»
 * next to play jump one verse and recite it (VerseControls). Per-verse
 * reciters only: al-Muaiqly's single surah file has no verse boundaries.
 */
import * as React from "react"
import { useNavigate, useParams } from "react-router"
import { IconArrowLeft, IconSearch, IconVolume } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { num, useT } from "@/app/i18n"
import { SURA_AR, SURA_LATIN, suraName } from "@/app/lesson/suras"
import { AYA_COUNT } from "./ayaCount"
import { DiscoverBar, SourceLine } from "./parts"
import { ListeningPlayer, loadPosition, meaningAudioUrl, nextAya, savePosition } from "./player"
import { useRecitation } from "./queries"
import { followVerse, loadReciterChoice, pickReciter, saveReciterChoice, verseUrl } from "./reciters"
import { meaningLines, useSuraText } from "./verses"
import { DownloadControl, OnlineOnlyNote } from "@/app/downloads/DownloadControl" // PLT-12
import { PlayButton, VerseControls } from "./VerseControls"

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
  const count = AYA_COUNT[sura - 1] ?? 0
  const text = useSuraText(sura, locale)
  const recData = useRecitation(locale).data
  const rec = recData?.recitation ?? null
  // R4: approved Quranpedia reciters replace al-Muaiqly once there is one.
  const reciters = recData?.reciters ?? []
  const [chosen, setChosen] = React.useState(() => loadReciterChoice())
  // PLT-12 R6: al-Muaiqly (IslamHouse) stays selectable: the one recitation that can be downloaded.
  const reciter = rec && chosen === rec.id ? null : pickReciter(reciters, chosen)
  const recUrl = reciter ? null : rec?.suras[String(sura)]
  const canRecite = reciter ? count > 0 : !!(rec && recUrl)

  const audioRef = React.useRef<HTMLAudioElement>(null)
  const playerRef = React.useRef<ListeningPlayer | null>(null)
  const [playing, setPlaying] = React.useState<null | "recitation" | number>(null)
  // R2: the verse being recited (verse by verse), highlighted and kept in view.
  const [current, setCurrent] = React.useState<number | null>(null)
  const currentRef = React.useRef<number | null>(null)
  React.useEffect(() => {
    currentRef.current = current
  }, [current])
  const saved = React.useMemo(() => loadPosition(sura), [sura])
  // The verse play starts from, and the one the previous/next jumps count from.
  const at = Math.min(count, Math.max(1, current ?? saved?.aya ?? 1))
  const topAya = React.useRef(saved?.aya ?? 1)
  const listRef = React.useRef<HTMLOListElement>(null)

  const player = () => (playerRef.current ??= new ListeningPlayer(audioRef.current!))

  // R6: remember where the learner stopped, on this device only.
  const remember = React.useCallback(() => {
    const p = playerRef.current
    if (p?.track?.kind === "verse" || (p?.track?.kind === "meaning" && currentRef.current)) {
      savePosition(sura, { time: 0, aya: currentRef.current ?? topAya.current })
      return
    }
    savePosition(sura, { time: p?.recitationPosition() ?? saved?.time ?? 0, aya: topAya.current })
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

  // R2: when the highlight moves, the screen follows it if it is not visible.
  React.useEffect(() => {
    if (current == null) return
    const el = listRef.current?.querySelector(`[data-aya="${current}"]`)
    if (el) followVerse(el)
  }, [current])

  const playVerse = (aya: number, fromStart = false) => {
    if (!reciter) return
    player().playVerse(sura, aya, verseUrl(reciter, sura, aya), fromStart)
    setCurrent(aya)
    setPlaying("recitation")
  }

  const toggleRecitation = () => {
    if (playing === "recitation") {
      player().pause()
      setPlaying(null)
      remember()
    } else if (reciter) {
      playVerse(at)
    } else if (recUrl) {
      player().playRecitation(sura, recUrl, saved?.time ?? 0)
      setPlaying("recitation")
    }
  }

  const chooseReciter = (id: string) => {
    if (playing === "recitation") player().pause()
    setPlaying(null)
    setChosen(id)
    saveReciterChoice(id)
  }

  const onEnded = () => {
    const track = playerRef.current?.track
    if (track?.kind === "verse" && reciter) {
      const next = nextAya(track.aya, count)
      if (next != null) return playVerse(next)
      setCurrent(null)
      setPlaying(null)
      savePosition(sura, { time: 0, aya: 1 }) // the surah ended: next time from its start
      return
    }
    setPlaying(null)
    remember()
  }

  const playMeaning = (aya: number) => {
    const url = meaningAudioUrl(locale, sura, aya)
    if (!url) return
    topAya.current = aya
    player().playMeaning(sura, aya, url)
    setPlaying(aya)
    remember()
  }

  // R2: tapping a verse, or «الآية السابقة/التالية», recites that verse from its start.
  const reciteFrom = (aya: number) => playVerse(aya, true)

  const lines = text.data ? meaningLines(text.data.ayat) : []
  const source = text.data?.source
  const reciterName = reciter?.reciter ?? rec?.reciter
  const reciterSource = reciter?.source ?? rec?.source

  return (
    <>
      <DiscoverBar title={suraName(sura, locale)} back="/discover/quran" />
      {/* One element for every sound on this screen (R3); no controls of our own add sound (R1). */}
      <audio ref={audioRef} preload="none" onEnded={onEnded} onPause={() => setPlaying((p) => (p === "recitation" ? null : p))} />

      <div className="flex flex-col gap-5 px-4 pt-5 pb-4">
        <header className="flex flex-col items-center gap-1 rounded-panel bg-secondary/60 px-5 py-6 text-center text-secondary-foreground">
          <p lang="ar" dir="rtl" className="font-quran text-h1 leading-normal text-foreground">
            سورة {SURA_AR[sura - 1]}
          </p>
          <p className="text-label tabular-nums">{t("discover.quran.ayat", { n: num(count) })}</p>
          <p className="text-caption text-muted-foreground">{t("discover.quran.position")}</p>
        </header>

        {!rec && !reciter && <p className="rounded-card bg-muted p-4 text-label text-muted-foreground">{t("discover.quran.noAudio")}</p>}

        {(reciters.length > 1 || (reciters.length > 0 && rec)) && (reciter || rec) && (
          <div className="flex flex-col gap-2">
            <span className="text-label font-bold">{t("discover.quran.reciterPick")}</span>
            <Select value={reciter?.id ?? rec?.id} onValueChange={chooseReciter}>
              <SelectTrigger className="w-full" aria-label={t("discover.quran.reciterPick")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reciters.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    <bdi>{r.reciter}</bdi>
                  </SelectItem>
                ))}
                {rec && (
                  <SelectItem value={rec.id}>
                    <bdi>{t("downloads.downloadable", { name: rec.reciter })}</bdi>
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* PLT-12 R1/R6: download this surah with the IslamHouse recitation; Quranpedia reciters play online only. */}
        {reciter ? <OnlineOnlyNote /> : rec && recUrl && <DownloadControl itemId={`surah:${sura}:${locale}`} lang={locale} />}

        {text.isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
          </div>
        ) : text.isError ? (
          <p className="text-body text-muted-foreground">{t("discover.quran.textError")}</p>
        ) : (
          <ol ref={listRef} className="flex flex-col divide-y">
            {lines.map((l) => {
              const now = current === l.aya
              return (
                <li
                  key={l.aya}
                  data-aya={l.aya}
                  aria-current={now ? "true" : undefined}
                  className={cn("flex scroll-mt-20 flex-col gap-3 border-s-4 py-5 ps-3", now ? "rounded-md border-primary bg-secondary" : "border-transparent")}
                >
                  {now && <span className="sr-only">{t("discover.quran.nowReciting")}</span>}
                  {reciter ? (
                    <button
                      type="button"
                      onClick={() => reciteFrom(l.aya)}
                      className="w-full rounded-md text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span className="sr-only">{t("discover.quran.reciteFrom", { n: num(l.aya) })}</span>
                      <VerseText arabic={l.arabic} aya={l.aya} />
                    </button>
                  ) : (
                    <VerseText arabic={l.arabic} aya={l.aya} />
                  )}
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
              )
            })}
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
            {reciterName && (
              <>
                {" · "}
                {t("discover.quran.reciter", { name: reciterName })} (<bdi>{reciterSource}</bdi>)
              </>
            )}
          </SourceLine>
        )}
      </div>

      {canRecite && reciterName && (
        <div className="sticky bottom-3 z-20 px-4">
          <div className="flex items-center gap-3 rounded-panel bg-card p-3 shadow-raised">
            {reciter ? (
              <VerseControls playing={playing === "recitation"} at={at} count={count} onToggle={toggleRecitation} onJump={reciteFrom} />
            ) : (
              <PlayButton playing={playing === "recitation"} onToggle={toggleRecitation} />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-label font-bold">
                {playing === "recitation" && current
                  ? t("discover.quran.nowVerse", { n: num(current) })
                  : playing === "recitation" || !(reciter ? (current ?? saved?.aya ?? 1) > 1 : saved?.time)
                    ? t("discover.quran.play")
                    : t("discover.quran.resume", { n: num(current ?? saved?.aya ?? 1) })}
              </p>
              <p className="truncate text-caption text-muted-foreground">{t("discover.quran.reciter", { name: reciterName })}</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** The stored verse text and its number (R2: never generated). */
function VerseText({ arabic, aya }: { arabic: string; aya: number }) {
  return (
    <span lang="ar" dir="rtl" className="block font-quran text-[1.6rem] leading-[2.4] text-foreground">
      {arabic} <span className="whitespace-nowrap text-primary">﴿{num(aya)}﴾</span>
    </span>
  )
}
