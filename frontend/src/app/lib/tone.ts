/**
 * PLT-07 the Rafeeq tone. R1: short (under two seconds), not musical (no
 * melody, no instrument, nothing like the adhan or recitation), and never
 * used before the Sharia reviewer approves it. R2: on the web it plays only
 * while Rafeeq is open (a web notification cannot carry its own sound;
 * outside the app the device's own sound is heard). R3: the person can turn
 * the tone off and keep the alert.
 *
 * No tone has been designed or approved yet (PLT-07 open question: until
 * then in-app alerts stay silent), so APPROVED_TONE is null and playTone()
 * does nothing. To add one: put the file under public/sounds/, record the
 * reviewer's approval (name and date) here and in sources.md, and set
 * APPROVED_TONE. Nothing else changes.
 */
import { useDevice } from "@/app/stores/device"

export type ApprovedTone = {
  /** Served by Rafeeq itself, e.g. "/sounds/rafeeq-tone.mp3". */
  src: string
  /** The Sharia reviewer who approved it, and when (PLT-07 R1). */
  approvedBy: string
  approvedOn: string
  /** Under 2000 ms (R1). */
  durationMs: number
}

export const APPROVED_TONE: ApprovedTone | null = null

/** A tone may be used only when it is approved and short (R1). */
export function usableTone(tone: ApprovedTone | null = APPROVED_TONE): ApprovedTone | null {
  if (!tone || !tone.src || !tone.approvedBy || !tone.approvedOn) return null
  return tone.durationMs > 0 && tone.durationMs < 2000 ? tone : null
}

/** Play the tone for an in-app alert. Returns whether it played. */
export function playTone(tone: ApprovedTone | null = APPROVED_TONE): boolean {
  const ok = usableTone(tone)
  if (!ok || !useDevice.getState().toneOn) return false // R3: off = silent alert
  if (typeof document === "undefined" || document.visibilityState !== "visible") return false // R2: app open only
  try {
    void new Audio(ok.src).play().catch(() => undefined)
    return true
  } catch {
    return false
  }
}
