/**
 * PRC-01 R5: qibla direction from true north (great circle, `adhan`). A live
 * compass is optional: only when the device gives an absolute heading and,
 * on iOS, after the learner taps to allow it. Without a compass the screen
 * shows the bearing and how to use it — never a failure message. The short
 * reassurance line appears only once the Sharia reviewer approved it.
 */
import * as React from "react"
import { useNavigate } from "react-router"
import { IconCompass } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { PETAL } from "@/components/rafeeq"
import { useT } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { useLines } from "./api"
import { cityName } from "./cities"
import { qiblaBearing } from "./times"
import { BackBar } from "./ui"

type Compass = { heading: number | null; status: "idle" | "active" | "unavailable"; start: () => void }

type OrientationEventIOS = DeviceOrientationEvent & { webkitCompassHeading?: number }
type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> }

function useCompass(): Compass {
  const [heading, setHeading] = React.useState<number | null>(null)
  const [status, setStatus] = React.useState<Compass["status"]>(() =>
    typeof window !== "undefined" && "DeviceOrientationEvent" in window ? "idle" : "unavailable",
  )
  const cleanup = React.useRef<() => void>(() => {})
  const got = React.useRef(false)

  const start = React.useCallback(async () => {
    const Ctor = window.DeviceOrientationEvent as OrientationCtor | undefined
    if (!Ctor) return setStatus("unavailable")
    if (typeof Ctor.requestPermission === "function") {
      try {
        if ((await Ctor.requestPermission()) !== "granted") return setStatus("unavailable")
      } catch {
        return setStatus("unavailable")
      }
    }
    const onAbsolute = (e: DeviceOrientationEvent) => {
      if (e.absolute && e.alpha != null) {
        got.current = true
        setHeading((360 - e.alpha) % 360)
      }
    }
    const onIOS = (e: DeviceOrientationEvent) => {
      const h = (e as OrientationEventIOS).webkitCompassHeading
      if (typeof h === "number") {
        got.current = true
        setHeading(h)
      }
    }
    window.addEventListener("deviceorientationabsolute", onAbsolute as EventListener)
    window.addEventListener("deviceorientation", onIOS)
    setStatus("active")
    // No reading within 3 s: no usable compass; the bearing and how-to stay.
    const timer = setTimeout(() => {
      if (!got.current) setStatus("unavailable")
    }, 3000)
    cleanup.current = () => {
      clearTimeout(timer)
      window.removeEventListener("deviceorientationabsolute", onAbsolute as EventListener)
      window.removeEventListener("deviceorientation", onIOS)
    }
  }, [])

  React.useEffect(() => () => cleanup.current(), [])
  return { heading, status, start: () => void start() }
}

function Dial({ bearing, heading }: { bearing: number; heading: number | null }) {
  const { t } = useT()
  const rotate = heading == null ? 0 : -heading
  const aligned = heading != null && Math.abs(((bearing - heading + 540) % 360) - 180) < 5
  return (
    <div className="relative mx-auto aspect-square w-full max-w-72" role="img" aria-label={t("practice.qibla.bearing", { deg: bearing })}>
      <svg viewBox="0 0 200 200" className="size-full overflow-visible" style={{ rotate: `${rotate}deg`, transition: "rotate 200ms var(--rf-ease)" }}>
        <circle cx="100" cy="100" r="92" className="fill-card stroke-border" strokeWidth="2" />
        <circle cx="100" cy="100" r="74" fill="none" className="stroke-border" strokeWidth="1" strokeDasharray="2 6" />
        {Array.from({ length: 12 }, (_, k) => (
          <line key={k} x1="100" y1="10" x2="100" y2={k % 3 ? 16 : 22} transform={`rotate(${k * 30} 100 100)`} className="stroke-muted-foreground" strokeWidth="2" strokeLinecap="round" />
        ))}
        <text x="100" y="38" textAnchor="middle" className="fill-foreground text-label font-bold">
          {t("practice.qibla.north")}
        </text>
        <g transform={`rotate(${bearing} 100 100)`}>
          <line x1="100" y1="100" x2="100" y2="34" className="stroke-primary" strokeWidth="4" strokeLinecap="round" />
          <g transform="translate(100 30) scale(0.42) translate(-60 -32)">
            <ellipse cx={PETAL.cx} cy={PETAL.cy} rx={PETAL.rx * 1.4} ry={PETAL.ry} className={aligned ? "fill-success" : "fill-primary"} />
          </g>
        </g>
        <circle cx="100" cy="100" r="7" className="fill-primary" />
      </svg>
    </div>
  )
}

export default function QiblaScreen() {
  const { t, locale } = useT()
  const navigate = useNavigate()
  const city = useDevice((s) => s.city)
  const lines = useLines()
  const compass = useCompass()

  if (!city) {
    return (
      <>
        <BackBar title={t("practice.qibla")} />
        <div className="flex flex-col items-start gap-4 px-4 pt-6">
          <p className="text-body text-muted-foreground">{t("practice.qiblaNoCity")}</p>
          <Button onClick={() => navigate("/practice/city")}>{t("practice.chooseCity")}</Button>
        </div>
      </>
    )
  }

  const bearing = qiblaBearing(city.lat, city.lng)
  return (
    <>
      <BackBar title={t("practice.qibla")} />
      <div className="flex flex-col gap-5 px-4 pt-6 pb-10">
        <div className="text-center">
          <p className="text-label text-muted-foreground">
            <bdi>{cityName(city, locale)}</bdi>
          </p>
          <p className="font-heading text-h1 font-bold tabular-nums">{t("practice.qibla.degrees", { deg: bearing })}</p>
          <p className="text-body text-muted-foreground">{t("practice.qibla.fromNorth")}</p>
        </div>

        <Dial bearing={bearing} heading={compass.status === "active" ? compass.heading : null} />

        {compass.status === "idle" && (
          <Button variant="secondary" className="self-center" onClick={compass.start}>
            <IconCompass data-icon="inline-start" stroke={1.75} />
            {t("practice.qibla.useCompass")}
          </Button>
        )}
        {compass.status === "active" && compass.heading != null && <p className="text-center text-label text-muted-foreground">{t("practice.qibla.compassOn")}</p>}

        {/* R5 (error): no compass → the bearing and how to use it, no failure message. */}
        <section className="flex flex-col gap-2 rounded-card bg-muted p-4">
          <h2 className="text-body font-bold">{t("practice.qibla.howTitle")}</h2>
          <p className="text-body">{t("practice.qibla.how", { deg: bearing })}</p>
        </section>

        {lines.qibla_direction && <p className="text-body text-muted-foreground">{lines.qibla_direction}</p>}
      </div>
    </>
  )
}
