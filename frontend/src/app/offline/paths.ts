/**
 * PLT-15: which same-origin API answers stay on the device for offline use,
 * shared by the service worker module (sw/plt15-offline.ts) and the page's
 * warm-up (warmup.ts). Small, the same for every learner, never personal:
 * adhkar text (R3), the approved practice lines and sighting announcements,
 * the glossary of lessons (R2), and the cards and library lists that saved
 * items resolve against (R4). Adhkar audio and library search are not kept.
 */
export const OFFLINE_CACHE = "rafeeq-offline"
/** The existing sw.ts caches: lesson content and Quran passages, and images. */
export const CONTENT_CACHE = "rafeeq-content"
export const MEDIA_CACHE = "rafeeq-media"

const EXACT = new Set(["/api/practice/adhkar", "/api/practice/lines", "/api/practice/sightings", "/api/discover/cards", "/api/discover/library", "/api/glossary"])

export function keptOffline(pathname: string): boolean {
  if (EXACT.has(pathname)) return true
  // One adhkar chapter: /api/practice/adhkar/{id} (not the audio files).
  return /^\/api\/practice\/adhkar\/\d+$/.test(pathname)
}
