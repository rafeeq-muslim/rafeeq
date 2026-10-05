import { describe, expect, it } from "vitest"
import { ListeningPlayer, loadPosition, meaningAudioUrl, savePosition, type AudioLike } from "./player"
import { meaningLines } from "./verses"

function fakeAudio() {
  const log: string[] = []
  const el: AudioLike & { log: string[] } = {
    log,
    src: "",
    currentTime: 0,
    paused: true,
    play() {
      log.push(`play ${this.src}`)
      this.paused = false
    },
    pause() {
      log.push("pause")
      this.paused = true
    },
  }
  return el
}

function memoryStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe("KNW-08 Quran listening", () => {
  it("R3: playing a meaning stops the recitation first", () => {
    const el = fakeAudio()
    const p = new ListeningPlayer(el)
    p.playRecitation(1, "rec-001.mp3")
    el.currentTime = 42
    p.playMeaning(1, 3, "tl-001003.mp3")
    expect(el.log).toEqual(["pause", "play rec-001.mp3", "pause", "play tl-001003.mp3"])
    p.playRecitation(1, "rec-001.mp3")
    expect(el.src).toBe("rec-001.mp3")
    expect(el.currentTime).toBe(42) // the recitation resumes where it stopped
  })

  it("R3: meaning audio only where it matches the text (Tagalog Rowwad)", () => {
    expect(meaningAudioUrl("tl", 2, 255)).toBe("https://d.quranenc.com/data/audio/tagalog_rwwad/002255.mp3")
    expect(meaningAudioUrl("en", 2, 255)).toBeNull()
    expect(meaningAudioUrl("ar", 2, 255)).toBeNull()
  })

  it("R2: verse without stored translation shows Arabic only", () => {
    const lines = meaningLines([
      { aya: 1, arabic: "بِسْمِ اللَّهِ", translation: "Sa ngalan ni Allāh", url: "" },
      { aya: 2, arabic: "الْحَمْدُ لِلَّهِ", translation: null, url: "" },
    ])
    expect(lines).toEqual([
      { aya: 1, arabic: "بِسْمِ اللَّهِ", meaning: "Sa ngalan ni Allāh" },
      { aya: 2, arabic: "الْحَمْدُ لِلَّهِ", meaning: null },
    ])
  })

  it("R6: position is kept per surah on this device only", () => {
    const here = memoryStorage()
    savePosition(18, { time: 300, aya: 20 }, here)
    expect(loadPosition(18, here)).toEqual({ time: 300, aya: 20 })
    expect(loadPosition(19, here)).toBeNull()
    const otherDevice = memoryStorage()
    expect(loadPosition(18, otherDevice)).toBeNull() // starts from the beginning
  })
})
