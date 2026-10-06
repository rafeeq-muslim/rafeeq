/**
 * KNW-08 listening: one audio element for the whole screen, so a meaning
 * never plays over the recitation (R3), and no other sound is added (R1).
 * The stop position lives on this device only (R6).
 */

/** The part of HTMLAudioElement we use (lets tests pass a fake). */
export type AudioLike = {
  src: string
  currentTime: number
  paused: boolean
  play: () => Promise<void> | void
  pause: () => void
}

export type Track =
  | { kind: "recitation"; sura: number }
  | { kind: "verse"; sura: number; aya: number }
  | { kind: "meaning"; sura: number; aya: number }

/** KNW-08 R2: after a verse's file ends, the next verse of the surah; null at its end. */
export const nextAya = (aya: number, count: number): number | null => (aya < count ? aya + 1 : null)

export class ListeningPlayer {
  track: Track | null = null
  private recitationTime = 0
  private recSura = 0
  /** The verse file last played (per-verse recitation), and where it stopped. */
  private verseAt: { sura: number; aya: number; url: string; time: number } | null = null
  private el: AudioLike
  constructor(el: AudioLike) {
    this.el = el
  }

  /** Recitation of a whole surah, resuming from `from` seconds. */
  playRecitation(sura: number, url: string, from = 0) {
    this.el.pause()
    const resuming = this.track?.kind === "recitation" && this.track.sura === sura
    if (!resuming) {
      // Coming back from a meaning of the same surah resumes the recitation where it stopped.
      const time = this.recSura === sura ? this.recitationTime : from
      this.el.src = url
      this.el.currentTime = time
    }
    this.track = { kind: "recitation", sura }
    this.recSura = sura
    void this.el.play()
  }

  /**
   * R2/R4: one verse of a per-verse recitation (Quranpedia), so the verse
   * highlighted is exactly the file playing. Unpausing, or coming back from
   * a meaning, resumes the same verse where it stopped.
   */
  playVerse(sura: number, aya: number, url: string) {
    this.el.pause()
    const same = this.verseAt?.sura === sura && this.verseAt.aya === aya && this.verseAt.url === url
    if (!(same && this.track?.kind === "verse")) {
      this.el.src = url
      this.el.currentTime = same ? this.verseAt!.time : 0
    }
    this.verseAt = { sura, aya, url, time: 0 }
    this.track = { kind: "verse", sura, aya }
    void this.el.play()
  }

  /** R3: the recitation stops first, then the meaning plays alone. */
  playMeaning(sura: number, aya: number, url: string) {
    this.keepTime()
    this.el.pause()
    this.el.src = url
    this.el.currentTime = 0
    this.track = { kind: "meaning", sura, aya }
    void this.el.play()
  }

  pause() {
    this.keepTime()
    this.el.pause()
  }

  private keepTime() {
    if (this.track?.kind === "recitation") this.recitationTime = this.el.currentTime
    if (this.track?.kind === "verse" && this.verseAt) this.verseAt.time = this.el.currentTime
  }

  /** Seconds into the surah's recitation (for R6). */
  recitationPosition(): number {
    return this.track?.kind === "recitation" ? this.el.currentTime : this.recitationTime
  }
}

/** QuranEnc per-ayah meaning audio. Only where the audio matches the text shown (Tagalog Rowwad). */
export function meaningAudioUrl(locale: string, sura: number, aya: number): string | null {
  if (locale !== "tl") return null
  const p = (n: number) => String(n).padStart(3, "0")
  return `https://d.quranenc.com/data/audio/tagalog_rwwad/${p(sura)}${p(aya)}.mp3`
}

// --- R6: stop position on this device only --------------------------------------

export type Position = { time: number; aya: number }
const KEY = (sura: number) => `rafeeq.quranPos.${sura}`

export function loadPosition(sura: number, storage: Pick<Storage, "getItem"> = localStorage): Position | null {
  try {
    const raw = storage.getItem(KEY(sura))
    return raw ? (JSON.parse(raw) as Position) : null
  } catch {
    return null
  }
}

export function savePosition(sura: number, pos: Position, storage: Pick<Storage, "setItem"> = localStorage) {
  try {
    storage.setItem(KEY(sura), JSON.stringify(pos))
    storage.setItem(LAST_KEY, String(sura)) // PLT-09 R2: «يومي» continues the last surah
  } catch {
    /* storage blocked: start from the beginning next time */
  }
}

// PLT-09 R2: the last surah listened to, on this device only (like R6).
const LAST_KEY = "rafeeq.quranLast"

export function lastSura(storage: Pick<Storage, "getItem"> = localStorage): number | null {
  try {
    const n = Number(storage.getItem(LAST_KEY))
    return Number.isInteger(n) && n >= 1 && n <= 114 ? n : null
  } catch {
    return null
  }
}
