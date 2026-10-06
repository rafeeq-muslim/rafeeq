/**
 * PRC-01 R2: choose the city from an offline list, searched in the
 * learner's language. The device time zone suggests cities (no permission);
 * location is optional, used once on the device to pick the nearest listed
 * city, and never stored or sent. R1: the city is saved on this device only.
 */
import * as React from "react"
import { useNavigate } from "react-router"
import { IconCurrentLocation, IconSearch } from "@tabler/icons-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useT } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { cityName, countryName, deviceTimeZone, loadCities, locateCity, searchCities, suggestCities, toCity, type CityRow } from "./cities"
import { BackBar } from "./ui"

export default function CityPicker() {
  const { t, locale } = useT()
  const navigate = useNavigate()
  const current = useDevice((s) => s.city)
  const setDevice = useDevice((s) => s.set)
  const [rows, setRows] = React.useState<CityRow[] | null>(null)
  const [q, setQ] = React.useState("")
  const [locating, setLocating] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)

  React.useEffect(() => {
    void loadCities().then(setRows)
  }, [])

  const choose = (r: CityRow) => {
    setDevice({ city: toCity(r) })
    navigate("/practice")
  }

  const locate = () => {
    if (!rows) return
    if (!("geolocation" in navigator)) {
      setNotice(t("practice.city.locationDenied"))
      return
    }
    setLocating(true)
    setNotice(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        // R2/R3: never a far city in another time zone; say so honestly instead.
        const found = locateCity(rows, pos.coords.latitude, pos.coords.longitude)
        if (found.kind === "city") choose(found.row)
        else setNotice(t(found.kind === "highLatitude" ? "practice.city.farAwayHigh" : "practice.city.farAway"))
      },
      () => {
        // R2 (error): back to the list with a calm message; prayer times stay available.
        setLocating(false)
        setNotice(t("practice.city.locationDenied"))
      },
      { maximumAge: 600_000, timeout: 15_000, enableHighAccuracy: false },
    )
  }

  const searching = q.trim() !== ""
  const results = rows ? (searching ? searchCities(rows, q) : suggestCities(rows, deviceTimeZone())) : []

  return (
    <>
      <BackBar title={t("practice.city")} />
      <div className="flex flex-col gap-4 px-4 pt-4 pb-10">
        <label className="relative block">
          <span className="sr-only">{t("practice.city.search")}</span>
          <IconSearch className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" stroke={1.75} aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("practice.city.search")}
            autoFocus
            className="h-12 w-full rounded-md border border-input bg-card ps-12 pe-4 text-body outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>

        {notice && (
          <Alert variant="info">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        <section aria-labelledby="city-list" className="flex flex-col gap-1">
          <h2 id="city-list" className={rows && !searching && !results.length ? "sr-only" : "text-label font-medium text-muted-foreground"}>
            {searching ? t("practice.city.results") : t("practice.city.suggested")}
          </h2>
          {!rows ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-14 rounded-md" />
              <Skeleton className="h-14 rounded-md" />
            </div>
          ) : results.length ? (
            <ul className="flex flex-col">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => choose(r)}
                    aria-current={current?.id === r.id ? "true" : undefined}
                    className="flex min-h-14 w-full items-center gap-3 border-b border-border/70 px-1 text-start hover:bg-muted aria-[current=true]:font-bold"
                  >
                    <span className="min-w-0 flex-1">
                      <bdi className="block truncate text-body">{cityName(r, locale)}</bdi>
                      <span className="block text-label text-muted-foreground">{countryName(r.c, locale)}</span>
                    </span>
                    {current?.id === r.id && <span className="text-label text-primary">{t("practice.city.current")}</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            // R2 (error): a village that is not listed. With nothing typed and no
            // listed city in the device's zone (e.g. Europe/London), invite a search.
            <p className="py-3 text-body text-muted-foreground">{t(searching ? "practice.city.none" : "practice.city.typeToSearch")}</p>
          )}
        </section>

        <div className="flex flex-col gap-2 border-t pt-4">
          <Button variant="secondary" onClick={locate} disabled={!rows || locating}>
            <IconCurrentLocation data-icon="inline-start" stroke={1.75} />
            {locating ? t("common.loading") : t("practice.city.useLocation")}
          </Button>
          <p className="text-caption text-muted-foreground">{t("practice.city.locationNote")}</p>
        </div>
        <p className="text-caption text-muted-foreground">
          {t("practice.city.credit")}{" "}
          <a className="underline" href="https://www.geonames.org/" target="_blank" rel="noreferrer noopener">
            GeoNames
          </a>{" "}
          <bdi dir="ltr">(CC BY 4.0)</bdi>
        </p>
      </div>
    </>
  )
}
