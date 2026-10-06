/**
 * PLT-11 R6: the precache size budget. Pure functions, used by
 * scripts/check-size.mjs after `vite build` (CI) and by the tests.
 */

export type PrecacheFile = { url: string; raw: number; gzip: number }

export type SizeBudget = {
  /** Precache totals recorded in the repo (frontend/size-budget.json). */
  files: number
  raw: number
  gzip: number
  /** Allowed growth over the budget before the build fails (0.1 = 10%). */
  tolerance: number
  /** Largest audio, video or data file allowed in the precache. */
  maxDataFileBytes: number
}

const DATA_OR_MEDIA = /\.(json|geojson|csv|tsv|txt|xml|pdf|wasm|bin|db|sqlite|mp3|m4a|aac|ogg|oga|opus|wav|flac|mp4|m4v|webm|mov)$/i

export type BudgetResult = { ok: boolean; errors: string[]; total: { files: number; raw: number; gzip: number } }

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`

export function checkBudget(files: PrecacheFile[], budget: SizeBudget, isOnDemand: (url: string) => boolean = () => false): BudgetResult {
  const total = {
    files: files.length,
    raw: files.reduce((s, f) => s + f.raw, 0),
    gzip: files.reduce((s, f) => s + f.gzip, 0),
  }
  const errors: string[] = []
  const limit = 1 + budget.tolerance
  if (total.raw > budget.raw * limit)
    errors.push(`precache raw size ${kb(total.raw)} is more than ${Math.round(budget.tolerance * 100)}% over the budget ${kb(budget.raw)}`)
  if (total.gzip > budget.gzip * limit)
    errors.push(`precache gzip size ${kb(total.gzip)} is more than ${Math.round(budget.tolerance * 100)}% over the budget ${kb(budget.gzip)}`)
  for (const f of files) {
    if (DATA_OR_MEDIA.test(f.url) && f.raw > budget.maxDataFileBytes)
      errors.push(`${f.url} (${kb(f.raw)}) is an audio, video or data file over ${kb(budget.maxDataFileBytes)} in the precache`)
    if (isOnDemand(f.url)) errors.push(`${f.url} must load on demand, not be precached (PLT-11 R2)`)
  }
  return { ok: errors.length === 0, errors, total }
}

export function formatReport(files: PrecacheFile[], budget: SizeBudget, result: BudgetResult, top = 15): string {
  const rows = [...files].sort((a, b) => b.raw - a.raw).slice(0, top)
  const pct = (n: number, of: number) => `${n >= of ? "+" : ""}${(((n - of) / of) * 100).toFixed(1)}%`
  const { total } = result
  return [
    `Precache (PLT-11 R6): ${total.files} files, ${kb(total.raw)} raw, ${kb(total.gzip)} gzip`,
    `Budget:               ${budget.files} files, ${kb(budget.raw)} raw (${pct(total.raw, budget.raw)}), ${kb(budget.gzip)} gzip (${pct(total.gzip, budget.gzip)}); fails above +${Math.round(budget.tolerance * 100)}%`,
    `Largest files:`,
    ...rows.map((f) => `  ${kb(f.raw).padStart(10)} ${kb(f.gzip).padStart(10)}  ${f.url}`),
    ...(result.ok ? ["OK"] : ["FAILED:", ...result.errors.map((e) => `  - ${e}`)]),
  ].join("\n")
}

/** The precache URLs injected into dist/sw.js (`{"revision":…,"url":"…"}` entries). */
export function manifestUrls(swSource: string): string[] {
  return [...swSource.matchAll(/\{"revision":(?:"[^"]*"|null),"url":"([^"]+)"\}|\{"url":"([^"]+)","revision":(?:"[^"]*"|null)\}/g)].map((m) => m[1] ?? m[2])
}
