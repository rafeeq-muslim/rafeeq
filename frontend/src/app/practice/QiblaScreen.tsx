/**
 * PRC-01 R5: qibla direction from true north (great circle, `adhan`). A live
 * compass is optional: only when the device gives an absolute heading. It
 * starts by itself where no permission is needed (Android) and after a tap
 * on iOS; the dial turns with the phone and says which way to turn. Without a compass the screen
 * shows the bearing and how to use it — never a failure message. The short
 * reassurance line appears only once the Sharia reviewer approved it.
 */
import * as React from "react"
import { useNavigate } from "react-router"
import { IconCompass } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { PETAL } from "@/components/rafeeq"
import { useT } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { useLines } from "./api"
import { cityName } from "./cities"
import { isAligned, screenHeading, smoothHeading, turnToQibla, unwrapRotation, wrap360 } from "./compass"
import { qiblaBearing } from "./times"
import { BackBar } from "./ui"

type Compass = {
  heading: number | null
  /** Dial rotation, unwrapped so it always turns the short way round. */
  rotation: number
  needsPermission: boolean
  status: "idle" | "active" | "unavailable"
  needsCalibration: boolean
  start: () => void
}

type OrientationEventIOS = DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number }
type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> }

function screenAngle(): number {
  return window.screen?.orientation?.angle ?? 0
}

/**
 * Live heading of the top of the screen. Starts by itself where no
 * permission is needed (Android); iOS needs a tap («شغّل البوصلة»).
 * Readings are smoothed so the dial does not shake.
 */
function useCompass(): Compass {
  const [heading, setHeading] = React.useState<number | null>(null)
  const [rotation, setRotation] = React.useState(0)
  const [needsCalibration, setNeedsCalibration] = React.useState(false)
  const [status, setStatus] = React.useState<Compass["status"]>(() =>
    typeof window !== "undefined" && "DeviceOrientationEvent" in window ? "idle" : "unavailable",
  )
  const cleanup = React.useRef<() => void>(() => {})
  const last = React.useRef<number | null>(null)

  const listen = React.useCallback(() => {
    cleanup.current()
    const push = (raw: number) => {
      const h = smoothHeading(last.current, screenHeading(raw, screenAngle()))
      last.current = h
      setHeading(h)
      setRotation((r) => unwrapRotation(r, wrap360(-h)))
      setStatus("active")
    }
    const onAbsolute = (e: DeviceOrientationEvent) => {
      if (e.absolute && e.alpha != null) push(360 - e.alpha)
    }
    const onIOS = (e: DeviceOrientationEvent) => {
      const ios = e as OrientationEventIOS
      if (typeof ios.webkitCompassHeading === "number") {
        push(ios.webkitCompassHeading)
        // Accuracy in degrees; negative or large means the sensor needs a figure-8.
        const acc = ios.webkitCompassAccuracy
        setNeedsCalibration(typeof acc === "number" && (acc < 0 || acc > 25))
      }
    }
    window.addEventListener("deviceorientationabsolute", onAbsolute as EventListener)
    window.addEventListener("deviceorientation", onIOS)
    // No reading within 3 s: no usable compass; the bearing and how-to stay.
    const timer = setTimeout(() => {
      if (last.current == null) setStatus("unavailable")
    }, 3000)
    cleanup.current = () => {
      clearTimeout(timer)
      window.removeEventListener("deviceorientationabsolute", onAbsolute as EventListener)
      window.removeEventListener("deviceorientation", onIOS)
    }
  }, [])

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
    listen()
  }, [listen])

  // Where no permission prompt exists, the compass starts on its own.
  React.useEffect(() => {
    const Ctor = window.DeviceOrientationEvent as OrientationCtor | undefined
    if (Ctor && typeof Ctor.requestPermission !== "function") listen()
    return () => cleanup.current()
  }, [listen])

  const needsPermission = typeof window !== "undefined" && typeof (window.DeviceOrientationEvent as OrientationCtor | undefined)?.requestPermission === "function"
  return { heading, rotation, needsPermission, status, needsCalibration, start: () => void start() }
}

function Dial({ bearing, heading, rotation }: { bearing: number; heading: number | null; rotation: number }) {
  const { t } = useT()
  const live = heading != null
  const aligned = live && isAligned(bearing, heading)
  return (
    <div className="relative mx-auto aspect-square w-full max-w-72" role="img" aria-label={t("practice.qibla.bearing", { deg: bearing })}>
      {/* Fixed mark: where the top of the phone points. */}
      {live && (
        <svg viewBox="0 0 20 12" aria-hidden="true" className="absolute inset-x-0 -top-3 z-10 mx-auto w-5">
          <path d="M10 12 L0 0 H20 Z" className={aligned ? "fill-success" : "fill-foreground"} />
        </svg>
      )}
      <svg
        viewBox="0 0 200 200"
        className="size-full overflow-visible transition-[rotate] duration-200 ease-rafeeq motion-reduce:transition-none"
        style={{ rotate: `${live ? rotation : 0}deg` }}
      >
        <circle cx="100" cy="100" r="92" className={cn("fill-card", aligned ? "stroke-success" : "stroke-border")} strokeWidth={aligned ? 4 : 2} />
        <circle cx="100" cy="100" r="74" fill="none" className="stroke-border" strokeWidth="1" strokeDasharray="2 6" />
        {Array.from({ length: 12 }, (_, k) => (
          <line key={k} x1="100" y1="10" x2="100" y2={k % 3 ? 16 : 22} transform={`rotate(${k * 30} 100 100)`} className="stroke-muted-foreground" strokeWidth="2" strokeLinecap="round" />
        ))}
        {/* The north letter stays upright while the dial turns. */}
        <text x="100" y="38" textAnchor="middle" transform={`rotate(${live ? -rotation : 0} 100 32)`} className="fill-foreground text-label font-bold">
          {t("practice.qibla.north")}
        </text>
        <g transform={`rotate(${bearing} 100 100)`}>
          <line x1="100" y1="100" x2="100" y2="34" className={aligned ? "stroke-success" : "stroke-primary"} strokeWidth="4" strokeLinecap="round" />
          <g transform="translate(100 30) scale(0.42) translate(-60 -32)">
            <ellipse cx={PETAL.cx} cy={PETAL.cy} rx={PETAL.rx * 1.4} ry={PETAL.ry} className={aligned ? "fill-success" : "fill-primary"} />
          </g>
        </g>
        <circle cx="100" cy="100" r="7" className={aligned ? "fill-success" : "fill-primary"} />
      </svg>
    </div>
  )
}

/** Live guidance under the dial: which way to turn, or that the learner is facing the qibla. */
function Guidance({ bearing, heading, needsCalibration }: { bearing: number; heading: number; needsCalibration: boolean }) {
  const { t } = useT()
  const turn = turnToQibla(bearing, heading)
  const aligned = isAligned(bearing, heading)
  const wasAligned = React.useRef(false)

  // A short buzz once, on the moment the learner reaches the qibla.
  React.useEffect(() => {
    if (aligned && !wasAligned.current) navigator.vibrate?.(30)
    wasAligned.current = aligned
  }, [aligned])

  const deg = Math.round(Math.abs(turn))
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <p aria-hidden={aligned || undefined} className={cn("text-h3 font-bold tabular-nums", aligned ? "text-success" : "text-foreground")}>
        {aligned ? t("practice.qibla.facing") : turn > 0 ? t("practice.qibla.turnRight", { deg }) : t("practice.qibla.turnLeft", { deg })}
      </p>
      {/* Screen readers hear only the change into or out of alignment, not every degree. */}
      <p className="sr-only" aria-live="polite">
        {aligned ? t("practice.qibla.facing") : ""}
      </p>
      <p className="text-label text-muted-foreground">{needsCalibration ? t("practice.qibla.calibrate") : t("practice.qibla.compassOn")}</p>
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

        <Dial bearing={bearing} heading={compass.status === "active" ? compass.heading : null} rotation={compass.rotation} />

        {compass.status === "active" && compass.heading != null && (
          <Guidance bearing={bearing} heading={compass.heading} needsCalibration={compass.needsCalibration} />
        )}

        {compass.status === "idle" && compass.needsPermission && (
          <Button variant="secondary" className="self-center" onClick={compass.start}>
            <IconCompass data-icon="inline-start" stroke={1.75} />
            {t("practice.qibla.useCompass")}
          </Button>
        )}

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
