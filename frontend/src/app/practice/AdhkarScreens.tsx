/**
 * PRC-07 daily adhkar. R1: only approved adhkar in the learner's language.
 * R2: verses come from the stored Quran record (VerseBlock). R3: Arabic
 * with the source's own meaning; never transliteration, never machine
 * translation. R4: the repeat count is text — no counter, nothing recorded.
 * R5: the reciter's voice only, served by Rafeeq. R6: the group for this time
 * of day comes first.
 */
import * as React from "react"
import { useNavigate, useParams } from "react-router"
import { IconPlayerPauseFilled, IconPlayerPlayFilled } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useT, type Key } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { VerseBlock } from "@/app/lesson/VerseBlock"
import { useAdhkarChapter, useAdhkarIndex, useNow, useRamadan, type Dhikr } from "./api"
import { orderedGroups, suggestGroup, type GroupKey } from "./adhkar"
import { countOf } from "./plural"
import { dayTimes } from "./times"
import { BackBar, NavRow, SourceLine } from "./ui"

export function AdhkarIndexScreen() {
  const { t, locale } = useT()
  const navigate = useNavigate()
  const city = useDevice((s) => s.city)
  const now = useNow(60_000)
  const { today, isRamadan } = useRamadan(now)
  const q = useAdhkarIndex()
  const suggested = suggestGroup(city ? dayTimes(city, today, { ramadan: isRamadan(today) }) : null, now)
  const groups = q.data ? orderedGroups(suggested).map((k) => q.data.groups.find((g) => g.key === k)).filter((g) => g !== undefined) : []

  return (
    <>
      <BackBar title={t("practice.adhkar")} />
      <div className="flex flex-col gap-6 px-4 pt-4 pb-10">
        <p className="text-body text-muted-foreground">{t("practice.adhkar.lede")}</p>
        {q.isLoading && <Skeleton className="h-40 rounded-card" />}
        {q.isError && <p className="text-body text-muted-foreground">{t("common.offline")}</p>}
        {groups.map((g) => (
          <section key={g.key} aria-labelledby={`g-${g.key}`} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h2 id={`g-${g.key}`} className="flex-1 font-heading text-h3 font-bold">
                {t(`practice.adhkar.group.${g.key}` as Key)}
              </h2>
              {g.key === suggested && <Badge variant="secondary">{t("practice.adhkar.now")}</Badge>}
            </div>
            {g.chapters.map((c) => (
              <NavRow
                key={c.id}
                title={<bdi dir="auto">{c.title}</bdi>}
                meta={c.approved_count > 0 ? countOf(locale, "adhkar", c.approved_count) : t("practice.adhkar.inReview")}
                disabled={c.approved_count === 0}
                onClick={() => navigate(`/practice/adhkar/${c.id}`)}
              />
            ))}
          </section>
        ))}
        {q.data && (
          <SourceLine href={q.data.source.url}>
            <bdi>{q.data.source.name}</bdi>
          </SourceLine>
        )}
      </div>
    </>
  )
}

/** One audio element for the whole chapter: starting one dhikr stops the other. */
function useSinglePlayer() {
  const ref = React.useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = React.useState<string | null>(null)
  React.useEffect(() => () => ref.current?.pause(), [])
  const toggle = (id: string, src: string) => {
    if (!ref.current) {
      ref.current = new Audio()
      ref.current.addEventListener("ended", () => setPlaying(null))
      ref.current.addEventListener("pause", () => setPlaying(null))
    }
    const a = ref.current
    if (playing === id) {
      a.pause()
      return
    }
    a.src = src
    void a.play().then(() => setPlaying(id), () => setPlaying(null))
  }
  return { playing, toggle }
}

function DhikrCard({ d, playing, onPlay }: { d: Dhikr; playing: boolean; onPlay: () => void }) {
  const { t, locale } = useT()
  return (
    <article className="flex flex-col gap-4 rounded-card bg-card p-5 shadow-card">
      <div lang="ar" dir="rtl" className="flex flex-col gap-3">
        {d.segments.map((s, i) =>
          s.t === "text" ? (
            <p key={i} className="font-reading text-[1.3rem] leading-[2.3] text-foreground">
              {s.text}
            </p>
          ) : (
            <VerseBlock key={i} quran={{ sura: s.sura, ayat: [s.from, s.to] }} />
          ),
        )}
      </div>
      {d.meaning && (
        <div className="border-t pt-3">
          <p className="text-label font-medium text-muted-foreground">{t("practice.adhkar.meaning")}</p>
          <p dir="auto" className="font-reading text-reading text-foreground/90">
            {d.meaning}
          </p>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="tabular-nums">
          {countOf(locale, "times", d.repeat)}
        </Badge>
        <span className="flex-1" />
        {/* R5 (error): no file on Rafeeq's server → no button, no failure message. */}
        {d.audio && (
          <Button variant="outline" size="sm" onClick={onPlay} aria-pressed={playing}>
            {playing ? <IconPlayerPauseFilled data-icon="inline-start" /> : <IconPlayerPlayFilled data-icon="inline-start" />}
            {playing ? t("practice.adhkar.pause") : t("practice.adhkar.listen")}
          </Button>
        )}
      </div>
    </article>
  )
}

export function AdhkarChapterScreen() {
  const { t, locale } = useT()
  const { chapterId = "" } = useParams()
  const q = useAdhkarChapter(Number(chapterId))
  const player = useSinglePlayer()

  return (
    <>
      <BackBar title={q.data ? <bdi dir="auto">{q.data.title}</bdi> : t("practice.adhkar")} to="/practice/adhkar" />
      <div className="flex flex-col gap-4 px-4 pt-4 pb-10">
        {locale === "tl" && <p className="rounded-md bg-muted p-3 text-label text-muted-foreground">{t("practice.adhkar.noTagalog")}</p>}
        {q.isLoading && <Skeleton className="h-48 rounded-card" />}
        {q.data && q.data.items.length === 0 && <p className="text-body text-muted-foreground">{t("practice.adhkar.inReview")}</p>}
        {q.data?.items.map((d) => (
          <DhikrCard
            key={d.id}
            d={d}
            playing={player.playing === d.id}
            onPlay={() => player.toggle(d.id, `/api/practice/adhkar/audio/${d.id.replace("hisn-", "")}.mp3`)}
          />
        ))}
        {q.data && q.data.items.length > 0 && (
          <SourceLine href={q.data.source.url}>
            <bdi>{q.data.source.name}</bdi>
          </SourceLine>
        )}
      </div>
    </>
  )
}

export type { GroupKey }
