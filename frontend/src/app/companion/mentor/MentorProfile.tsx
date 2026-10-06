/**
 * The mentor's own card (CMP-03 R3) and limits (CMP-02 R4; iERA: set
 * availability, avoid burnout; Osool p.102: 5–10 per mentor) —
 * /inbox/profile. Availability is shown to learners before they write;
 * the personal cap is 8 by default and at most 10 (group members are
 * counted apart); pausing stops new learners and new requests from the
 * pool, while current mentees and urgent requests stay.
 */
import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/app/i18n"
import { type MentorProfile as Profile, errorCode, inboxApi, useMentorProfile } from "../api"
import { ScreenBar } from "../Screen"

function Form({ profile }: { profile: Profile }) {
  const { t } = useT()
  const qc = useQueryClient()
  const [about, setAbout] = React.useState(profile.about)
  const [availability, setAvailability] = React.useState(profile.availability)
  const [accepting, setAccepting] = React.useState(profile.accepting)
  const [capacity, setCapacity] = React.useState(profile.capacity)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const save = async () => {
    setPending(true)
    setError(null)
    try {
      const next = await inboxApi.saveProfile({ about, availability, accepting, capacity })
      qc.setQueryData(["cmp", "profile"], next)
      toast.success(t("cmp.profile.saved"))
    } catch (e) {
      setError(errorCode(e) === "contact_not_allowed" ? t("cmp.err.contact") : t("common.error"))
    } finally {
      setPending(false)
    }
  }

  return (
    <FieldGroup className="px-4 pt-5">
      <Field data-invalid={!!error || undefined}>
        <FieldLabel htmlFor="about">{t("cmp.profile.about")}</FieldLabel>
        <Textarea id="about" dir="auto" maxLength={400} rows={4} value={about} onChange={(e) => setAbout(e.target.value)} className="text-body" />
        <FieldDescription>{t("cmp.profile.aboutHint")}</FieldDescription>
        {error && <FieldError>{error}</FieldError>}
      </Field>
      <Field>
        <FieldLabel htmlFor="availability">{t("cmp.profile.availability")}</FieldLabel>
        <Input
          id="availability"
          dir="auto"
          maxLength={120}
          value={availability}
          placeholder={t("cmp.profile.availabilityHint")}
          onChange={(e) => setAvailability(e.target.value)}
        />
      </Field>
      <Field orientation="horizontal" className="justify-between">
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="accepting" className="text-body">
            {t("cmp.profile.accepting")}
          </FieldLabel>
          <FieldDescription>{t("cmp.profile.acceptingHint")}</FieldDescription>
        </div>
        <Switch id="accepting" checked={accepting} onCheckedChange={setAccepting} />
      </Field>
      <Field>
        <FieldLabel htmlFor="capacity">{t("cmp.profile.capacity")}</FieldLabel>
        <Input
          id="capacity"
          type="number"
          inputMode="numeric"
          min={1}
          max={10}
          value={capacity}
          onChange={(e) => setCapacity(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
          className="w-28 tabular-nums"
        />
        <FieldDescription>{t("cmp.profile.capacityHint")}</FieldDescription>
      </Field>
      <Button size="lg" disabled={pending} onClick={() => void save()}>
        {t("cmp.profile.save")}
      </Button>
    </FieldGroup>
  )
}

export default function MentorProfile() {
  const { t } = useT()
  const profile = useMentorProfile()
  return (
    <>
      <ScreenBar title={t("cmp.inbox.profile")} back="/inbox" />
      {profile.data ? <Form profile={profile.data} /> : <Skeleton className="mx-4 mt-5 h-64 rounded-card" />}
    </>
  )
}
