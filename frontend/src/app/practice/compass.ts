/**
 * PRC-01 R5: pure helpers for the live qibla compass. Angles are degrees
 * clockwise from north.
 */

/** Wraps any angle into [0, 360). */
export function wrap360(deg: number): number {
  return ((deg % 360) + 360) % 360
}

/**
 * Signed turn from the way the phone faces to the qibla, in (-180, 180]:
 * positive = turn right (clockwise), negative = turn left.
 */
export function turnToQibla(bearing: number, heading: number): number {
  const d = wrap360(bearing - heading)
  return d > 180 ? d - 360 : d
}

/** Within this many degrees the learner is facing the qibla's direction. */
export const ALIGNED_DEG = 5

export function isAligned(bearing: number, heading: number): boolean {
  return Math.abs(turnToQibla(bearing, heading)) <= ALIGNED_DEG
}

/**
 * Low-pass filter on a circle, so the dial stops shaking without lagging.
 * Blends through 0/360 correctly (359 and 1 average to 0, not 180).
 */
export function smoothHeading(prev: number | null, next: number, factor = 0.25): number {
  if (prev == null) return wrap360(next)
  return wrap360(prev + turnToQibla(next, prev) * factor)
}

/**
 * The dial's rotation never jumps across 0/360: it keeps turning from where
 * it is by the shortest way, so CSS does not spin it all the way round.
 */
export function unwrapRotation(prevRotation: number, target: number): number {
  return prevRotation + turnToQibla(target, wrap360(prevRotation))
}

/** Heading of the top of the screen, from a raw sensor heading and the screen's rotation. */
export function screenHeading(sensorHeading: number, screenAngle: number): number {
  return wrap360(sensorHeading + screenAngle)
}
