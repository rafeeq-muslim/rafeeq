/**
 * CMP-01 open question «أخت بكل لغة» (default until decided): a sister's
 * request reaches sisters only, and the team is reminded that it needs a
 * sister and a brother who answer in each of Rafeeq's languages. One row per
 * language, one column per gender; a slot with nobody taking requests now is
 * marked. Counts only, never names (team screen).
 */
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { LOCALES, num, useT } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { type CoverageCell, useCoverage } from "../api"
import { langName } from "../format"

const GENDERS = [
  { gender: "f", label: "cmp.gaps.coverage.sisters" },
  { gender: "m", label: "cmp.gaps.coverage.brothers" },
] as const

function Slot({ cell }: { cell: CoverageCell | undefined }) {
  const { t } = useT()
  if (!cell) return null
  const paused = cell.responders - cell.available
  return (
    <div className="flex flex-col items-start gap-1" data-covered={cell.covered}>
      {cell.covered ? (
        <span className="text-label tabular-nums">{t("cmp.gaps.coverage.available", { count: num(cell.available) })}</span>
      ) : (
        <Badge variant="destructive">{t("cmp.gaps.coverage.nobody")}</Badge>
      )}
      {paused > 0 && <span className="text-caption text-muted-foreground tabular-nums">{t("cmp.gaps.coverage.paused", { count: num(paused) })}</span>}
    </div>
  )
}

export function ResponderCoverage() {
  const { t } = useT()
  const isTeam = useAuth((s) => !!s.me?.roles.some((r) => r === "team" || r === "admin"))
  const q = useCoverage(isTeam)
  if (!isTeam) return null
  const d = q.data
  const cell = (lang: string, gender: string) => d?.cells.find((c) => c.lang === lang && c.gender === gender)
  return (
    <section className="flex flex-col gap-3" aria-labelledby="coverage-title" data-slot="responder-coverage">
      <h2 id="coverage-title" className="font-heading text-h3 font-bold">
        {t("cmp.gaps.coverage.title")}
      </h2>
      <p className="text-label text-muted-foreground">{t("cmp.gaps.coverage.body")}</p>
      {q.isLoading || !d ? (
        <Skeleton className="h-32 rounded-card" />
      ) : (
        <>
          <table className="w-full border-separate border-spacing-y-1 text-start">
            <thead>
              <tr className="text-caption text-muted-foreground">
                <th scope="col" className="pb-1 text-start font-normal">
                  <span className="sr-only">{t("cmp.gaps.coverage.title")}</span>
                </th>
                {GENDERS.map((g) => (
                  <th key={g.gender} scope="col" className="pb-1 text-start font-normal">
                    {t(g.label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LOCALES.map((l) => (
                <tr key={l.code} className="bg-card">
                  <th scope="row" lang={l.code} className="rounded-s-md px-3 py-2 text-start text-body font-bold">
                    {langName(l.code)}
                  </th>
                  {GENDERS.map((g, i) => (
                    <td key={g.gender} className={i === GENDERS.length - 1 ? "rounded-e-md px-3 py-2" : "px-3 py-2"}>
                      <Slot cell={cell(l.code, g.gender)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {d.uncovered > 0 ? (
            <Alert variant="destructive" data-slot="coverage-missing">
              <AlertDescription>{t("cmp.gaps.coverage.missing", { count: num(d.uncovered) })}</AlertDescription>
            </Alert>
          ) : (
            <p className="text-label text-success">{t("cmp.gaps.coverage.allCovered")}</p>
          )}
          {d.without_gender > 0 && <p className="text-label text-muted-foreground">{t("cmp.gaps.coverage.noGender", { count: num(d.without_gender) })}</p>}
        </>
      )}
    </section>
  )
}
