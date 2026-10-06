/**
 * PRC-05 prayer reminders on the web. R1: off until turned on, chosen
 * prayers only; Ramadan's suhoor and iftar reminders appear in Ramadan, off.
 * R2: neutral text unless the prayer name is chosen (with a preview).
 * R3: at the time or minutes before. R6: the honest note — on the web they
 * arrive only while Rafeeq is open on this device.
 */
import { useNavigate } from "react-router"
import { IconInfoCircle } from "@tabler/icons-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { useT } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { useNow, useRamadan } from "./api"
import { countOf } from "./plural"
import { REMINDER_OFFSETS as OFFSETS, reminderText, upcomingReminders } from "./reminders"
import { usePractice, type ReminderSettings } from "./store"
import { formatTimeFull, PRAYER_KEYS, type PrayerKey } from "./times"
import { BackBar, prayerName } from "./ui"

function Row({ id, label, checked, onChange, hint }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="flex min-h-14 items-center gap-3">
      <label htmlFor={id} className="min-w-0 flex-1">
        <span className="block text-body font-medium">{label}</span>
        {hint && <span className="block text-label text-muted-foreground">{hint}</span>}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

export default function RemindersScreen() {
  const { t, locale } = useT()
  const navigate = useNavigate()
  const city = useDevice((s) => s.city)
  const r = usePractice((s) => s.reminders)
  const set = usePractice((s) => s.set)
  const now = useNow()
  const { state, isRamadan } = useRamadan(now)
  const patch = (p: Partial<ReminderSettings>) => set({ reminders: { ...r, ...p } })
  const togglePrayer = (k: PrayerKey, on: boolean) =>
    patch({ prayers: on ? PRAYER_KEYS.filter((x) => x === k || r.prayers.includes(x)) : r.prayers.filter((x) => x !== k) })

  const upcoming = city ? upcomingReminders(city, r, now, isRamadan)[0] : undefined

  return (
    <>
      <BackBar title={t("practice.reminders")} />
      <div className="flex flex-col gap-5 px-4 pt-4 pb-10">
        {/* R6: honest about the web. */}
        <Alert variant="info">
          <IconInfoCircle stroke={1.75} />
          <AlertTitle>{t("practice.reminders.webTitle")}</AlertTitle>
          <AlertDescription>{t("practice.reminders.webNote")}</AlertDescription>
        </Alert>

        {!city ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-body text-muted-foreground">{t("practice.reminders.noCity")}</p>
            <Button onClick={() => navigate("/practice/city")}>{t("practice.chooseCity")}</Button>
          </div>
        ) : (
          <>
            <Row id="rem-on" label={t("practice.reminders.enable")} checked={r.enabled} onChange={(v) => patch({ enabled: v })} />

            <fieldset disabled={!r.enabled} className="flex flex-col gap-5 disabled:opacity-60">
              <section className="flex flex-col gap-1">
                <legend className="text-label font-medium text-muted-foreground">{t("practice.reminders.which")}</legend>
                {PRAYER_KEYS.map((k) => (
                  <label key={k} className="flex min-h-12 items-center gap-3 border-b border-border/70">
                    <Checkbox checked={r.prayers.includes(k)} onCheckedChange={(v) => togglePrayer(k, v === true)} className="size-6 rounded-md" />
                    <span className="text-body">{prayerName(t, k)}</span>
                  </label>
                ))}
              </section>

              <section className="flex flex-col gap-2">
                <h2 className="text-label font-medium text-muted-foreground">{t("practice.reminders.when")}</h2>
                <div role="radiogroup" aria-label={t("practice.reminders.when")} className="flex flex-wrap gap-2">
                  {OFFSETS.map((m) => (
                    <Button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={r.offset === m}
                      size="sm"
                      variant={r.offset === m ? "default" : "outline"}
                      className="tabular-nums"
                      onClick={() => patch({ offset: m })}
                    >
                      {m === 0 ? t("practice.reminders.atTime") : t("practice.reminders.minutesBefore", { count: countOf(locale, "minutes", m) })}
                    </Button>
                  ))}
                </div>
              </section>

              <section className="flex flex-col gap-2">
                <Row
                  id="rem-name"
                  label={t("practice.reminders.showName")}
                  hint={t("practice.reminders.showNameHint")}
                  checked={r.showName}
                  onChange={(v) => patch({ showName: v })}
                />
                {upcoming && (
                  <p className="rounded-md bg-muted p-3 text-label">
                    {t("practice.reminders.preview", { time: formatTimeFull(upcoming.at, city.tz, locale), text: reminderText(upcoming, r, locale, city.tz) })}
                  </p>
                )}
              </section>

              {state.kind === "ramadan" && (
                <section className="flex flex-col gap-1 border-t pt-4">
                  <h2 className="font-heading text-h3 font-bold">{t("practice.ramadan.title")}</h2>
                  <Row id="rem-suhoor" label={t("practice.reminders.suhoor")} checked={r.suhoor} onChange={(v) => patch({ suhoor: v })} />
                  <Row id="rem-iftar" label={t("practice.reminders.iftar")} checked={r.iftar} onChange={(v) => patch({ iftar: v })} />
                </section>
              )}
            </fieldset>
            <p className="text-caption text-muted-foreground">{t("practice.reminders.silent")}</p>
          </>
        )}
      </div>
    </>
  )
}
