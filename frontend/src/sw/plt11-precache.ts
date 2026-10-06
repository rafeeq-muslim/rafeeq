/**
 * PLT-11 R2/R3: what the service worker precaches at install. Only the learner
 * shell; role pages, the design gallery, the cities data and the Quran font
 * come down the first time they are opened and are then kept by the runtime
 * cache (sw/plt11-caching.ts, R1). Used by vite.config.ts and by the size
 * check (scripts/check-size.mjs), so the build and CI agree.
 */

/** Lazy page chunks a learner never opens (by Vite chunk name). */
export const ROLE_CHUNKS = [
  "Admin",
  "Team",
  "Inbox", // mentor + team inbox
  "ReviewDesk",
  "Referrals",
  "Org",
  "ReportsQueue", // used only by Inbox and Team
  "App", // design gallery (/design)
] as const

/** Loaded on first use only (R2, R3). */
export const ON_DEMAND_GLOBS = [
  ...ROLE_CHUNKS.map((n) => `assets/${n}-*.js`),
  "assets/cities-data-*.js", // prayer-times city list (Qibla / city picker)
  "assets/amiri-quran-*", // Quran font: only when Quran text is shown
  "fonts/**", // brand font (Thmanyah, not in the repo): each weight on first use
]

export const PRECACHE_GLOB_PATTERNS = ["**/*.{js,css,html,svg,woff2,png}"]

export const PRECACHE_GLOB_IGNORES = [
  "landing/**",
  "brand/*-1024.png",
  // Fallback fonts: unicode-range subsets, fetched only for the scripts on screen.
  "assets/ibm-plex-*",
  "assets/noto-naskh-*",
  ...ON_DEMAND_GLOBS,
]

/** The cities JSON gets a predictable chunk name so R2 can leave it out. */
export function chunkFileName(chunk: { facadeModuleId?: string | null }): string {
  return chunk.facadeModuleId?.replace(/\\/g, "/").endsWith("/practice/cities.json") ? "assets/cities-data-[hash].js" : "assets/[name]-[hash].js"
}

/** The subset of glob syntax used above (`*`, `**`) as a RegExp over dist-relative paths. */
export function globToRegExp(glob: string): RegExp {
  const body = glob
    .split("**")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*"))
    .join(".*")
  return new RegExp(`^${body}$`)
}

const onDemand = ON_DEMAND_GLOBS.map(globToRegExp)

/** R2: true for a file that must not be in the precache. */
export const isOnDemand = (path: string) => onDemand.some((re) => re.test(path))
