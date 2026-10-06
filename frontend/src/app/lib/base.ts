/** PLT-10 R2: the app lives under /app; the landing page is at /. Router
 * links and navigate() add the base themselves; use appUrl() only for raw
 * URLs (window.location, links shared outside the app, push targets). */
export const APP_BASE = "/app"

/** "/welcome?x" -> "/app/welcome?x"; already prefixed or external URLs unchanged. */
export function appUrl(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path
  if (path === APP_BASE || path.startsWith(`${APP_BASE}/`) || path.startsWith(`${APP_BASE}?`) || path.startsWith(`${APP_BASE}#`)) return path
  return path === "/" ? `${APP_BASE}/` : `${APP_BASE}${path}`
}

/** The app path without its base, for code that matches routes on location.pathname. */
export function stripBase(pathname: string): string {
  if (pathname === APP_BASE) return "/"
  return pathname.startsWith(`${APP_BASE}/`) ? pathname.slice(APP_BASE.length) : pathname
}

/** Service worker: only app pages fall back to the cached app shell; "/" is the landing page. */
export const APP_NAVIGATION = /^\/app(\/|$)/

/** Service worker: where a notification opens. Pushes queued before the move carry "/next" etc. */
export const notificationTarget = (url?: string): string => appUrl(url || "/")
