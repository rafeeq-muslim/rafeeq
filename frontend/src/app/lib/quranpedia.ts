/** Quranpedia per-verse Hafs recitations (sources.md): one file per verse,
 * `{origin}/recitations/{reciter}/{sura:03d}{aya:03d}.mp3`. Shared by the
 * lesson verse player (LRN-01 R4, reciter 255) and Quran listening (KNW-08). */
export const QURANPEDIA_ORIGIN = "https://files.quranpedia.net"

const pad3 = (n: number) => String(n).padStart(3, "0")

export const quranpediaUrl = (reciter: number, sura: number, aya: number) =>
  `${QURANPEDIA_ORIGIN}/recitations/${reciter}/${pad3(sura)}${pad3(aya)}.mp3`
