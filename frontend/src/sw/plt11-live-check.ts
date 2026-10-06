/**
 * PLT-11 R1 deploy check (pure part; scripts/check-live-cache.mjs does the
 * requests). Hashed files under /assets/ and fonts must be cacheable: a
 * `no-store` added by the host router makes every open download them again.
 */

/** Same-origin hashed JS/CSS files referenced by index.html. */
export function assetUrls(html: string): string[] {
  return [...new Set([...html.matchAll(/(?:src|href)="(\/(?:[\w-]+\/)*assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]))]
}

/** Font files referenced by a stylesheet (bundled fonts under /assets/, brand fonts under /fonts/). */
export function fontUrls(css: string, cssUrl: string): string[] {
  const out = new Set<string>()
  for (const m of css.matchAll(/url\(\s*["']?([^"')]+\.woff2)["']?\s*\)/g)) out.add(new URL(m[1], `https://x${cssUrl}`).pathname)
  return [...out]
}

/** The files the check requests: one script, one stylesheet, and one font of each kind found. */
export function pickTargets(html: string, cssByUrl: Record<string, string>): string[] {
  const assets = assetUrls(html)
  const js = assets.find((u) => u.endsWith(".js"))
  const css = assets.find((u) => u.endsWith(".css"))
  const fonts = css && cssByUrl[css] ? fontUrls(cssByUrl[css], css) : []
  const brandFont = fonts.find((u) => u.includes("/fonts/"))
  const bundledFont = fonts.find((u) => u.includes("/assets/"))
  return [js, css, brandFont, bundledFont].filter((u): u is string => !!u)
}

export type HeaderResult = { url: string; status: number; cacheControl: string | null }

/** One line per file that cannot be kept by the browser, naming the file and the header. */
export function cacheProblems(results: HeaderResult[]): string[] {
  const out: string[] = []
  for (const r of results) {
    if (r.status >= 400) out.push(`${r.url}: HTTP ${r.status}`)
    else if (r.cacheControl && /\bno-store\b/i.test(r.cacheControl)) out.push(`${r.url}: Cache-Control: ${r.cacheControl}`)
  }
  return out
}
