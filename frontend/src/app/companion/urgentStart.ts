/**
 * Security review 2026-10-07 (B-M2): an urgent request is created only after
 * a tap inside the app. The danger panel passes this router state when it
 * opens the urgent screen; a link (`?kind=urgent`), which cannot carry router
 * state, shows the same screen with the button instead.
 */
export const URGENT_START = { urgentStart: true } as const

export const tappedInApp = (state: unknown): boolean =>
  typeof state === "object" && state !== null && (state as { urgentStart?: unknown }).urgentStart === true
