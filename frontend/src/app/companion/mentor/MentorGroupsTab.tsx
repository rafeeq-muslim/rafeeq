/**
 * CMP-05 R1: a mentor's groups, each in their own gender and one of their
 * languages, 10 members by default and at most 15, with a join code to
 * share. All of a mentor's groups hold at most 25 places together; his
 * personal mentees are counted apart (CMP-02 R4).
 */
import * as React from "react"
import { useNavigate } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { IconChevronLeft, IconCopy, IconPlus } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { SpotIllustration } from "@/components/rafeeq"
import { num, useT } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { ApiError } from "@/app/lib/api"
import { type Group, errorCode, groupApi, useMyGroups } from "../api"
import { langName } from "../format"

export const GROUP_MAX = 15
export const MENTOR_GROUP_PLACES = 25

/** The reason a group could not be created or resized, in words (CMP-05 R1 ex3). */
export function groupError(t: ReturnType<typeof useT>["t"], e: unknown): string {
  const code = errorCode(e)
  if (code === "contact_not_allowed") return t("cmp.err.contact")
  if (code === "mentor_member_limit") {
    const remaining = e instanceof ApiError ? Number((e.detail as { remaining?: number })?.remaining ?? 0) : 0
    return t("cmp.groups.err.limit", { limit: MENTOR_GROUP_PLACES, n: remaining })
  }
  if (code === "below_members") return t("cmp.groups.err.belowMembers")
  return t("common.error")
}

/** The mentor changes a group's cap, within 15 and his 25 places (CMP-05 R1). */
export function GroupCapacity({ group }: { group: Group }) {
  const { t } = useT()
  const qc = useQueryClient()
  const [capacity, setCapacity] = React.useState(group.capacity)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const save = async () => {
    setPending(true)
    setError(null)
    try {
      await groupApi.setCapacity(group.id, capacity)
      await qc.invalidateQueries({ queryKey: ["cmp"] })
      toast.success(t("cmp.groups.capacitySaved"))
    } catch (e) {
      setError(groupError(t, e))
    } finally {
      setPending(false)
    }
  }
  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor="group-cap">{t("cmp.groups.capacity")}</FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          id="group-cap"
          type="number"
          inputMode="numeric"
          min={2}
          max={GROUP_MAX}
          value={capacity}
          onChange={(e) => setCapacity(Math.max(2, Math.min(GROUP_MAX, Number(e.target.value) || 2)))}
          className="w-28 tabular-nums"
        />
        <Button variant="outline" disabled={pending || capacity === group.capacity} onClick={() => void save()}>
          {t("common.save")}
        </Button>
      </div>
      <FieldDescription>{t("cmp.groups.capacityHint", { max: GROUP_MAX, limit: MENTOR_GROUP_PLACES })}</FieldDescription>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

export function CopyCode({ code }: { code: string }) {
  const { t } = useT()
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-caption text-muted-foreground">{t("cmp.groups.code")}</span>
      <code dir="ltr" className="rounded-sm bg-muted px-2 py-0.5 font-mono text-label font-bold">
        {code}
      </code>
      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        aria-label={t("common.copy")}
        onClick={(e) => {
          e.stopPropagation()
          void navigator.clipboard?.writeText(code).then(() => toast.success(t("common.copied")))
        }}
      >
        <IconCopy stroke={1.75} />
      </Button>
    </span>
  )
}

function CreateGroup({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useT()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const me = useAuth((s) => s.me)
  const langs = me?.languages.length ? me.languages : [me?.locale ?? "ar"]
  const [name, setName] = React.useState("")
  const [lang, setLang] = React.useState(langs[0])
  const [capacity, setCapacity] = React.useState(10)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const create = async () => {
    setPending(true)
    setError(null)
    try {
      const g = await groupApi.create(name.trim(), lang, capacity)
      await qc.invalidateQueries({ queryKey: ["cmp", "groups"] })
      onOpenChange(false)
      navigate(`/inbox/g/${g.id}`)
    } catch (e) {
      setError(groupError(t, e))
    } finally {
      setPending(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-xl rounded-t-panel">
        <DrawerHeader className="text-start">
          <DrawerTitle className="font-heading text-h3">{t("cmp.groups.create")}</DrawerTitle>
          <DrawerDescription className="text-body">{t("cmp.groups.createHint")}</DrawerDescription>
        </DrawerHeader>
        <FieldGroup className="overflow-y-auto overscroll-contain px-4">
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="group-name">{t("cmp.groups.name")}</FieldLabel>
            <Input id="group-name" dir="auto" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <FieldSet>
            <FieldLegend variant="label">{t("cmp.groups.lang")}</FieldLegend>
            <ToggleGroup type="single" variant="outline" value={lang} onValueChange={(v) => v && setLang(v)} className="flex-wrap">
              {langs.map((l) => (
                <ToggleGroupItem key={l} value={l} lang={l}>
                  {langName(l)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FieldSet>
          <Field>
            <FieldLabel htmlFor="group-capacity">{t("cmp.groups.capacity")}</FieldLabel>
            <Input
              id="group-capacity"
              type="number"
              inputMode="numeric"
              min={2}
              max={GROUP_MAX}
              value={capacity}
              onChange={(e) => setCapacity(Math.max(2, Math.min(GROUP_MAX, Number(e.target.value) || 2)))}
              className="w-28 tabular-nums"
            />
            <FieldDescription>{t("cmp.groups.capacityHint", { max: GROUP_MAX, limit: MENTOR_GROUP_PLACES })}</FieldDescription>
          </Field>
        </FieldGroup>
        <DrawerFooter className="pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
          <Button size="lg" disabled={name.trim().length < 2 || pending} onClick={() => void create()}>
            {t("cmp.groups.create")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

export function MentorGroupsTab() {
  const { t } = useT()
  const navigate = useNavigate()
  const groups = useMyGroups()
  const [creating, setCreating] = React.useState(false)
  const led = (groups.data ?? []).filter((g) => g.role === "mentor")

  return (
    <div className="flex flex-col gap-4">
      {groups.isLoading ? (
        <Skeleton className="h-32 rounded-card" />
      ) : led.length === 0 ? (
        <section className="flex flex-col items-center gap-3 py-6 text-center">
          <SpotIllustration kind="companion" size={96} />
          <p className="max-w-sm text-body text-muted-foreground">{t("cmp.groups.empty")}</p>
        </section>
      ) : (
        <ul className="flex flex-col gap-3">
          {led.map((g) => (
            <li key={g.id}>
              <div className="flex flex-col gap-2 rounded-card bg-card p-4 shadow-card">
                <button type="button" onClick={() => navigate(`/inbox/g/${g.id}`)} className="flex min-h-11 items-center gap-3 text-start">
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-body font-bold">
                      <bdi>{g.name}</bdi>
                    </span>
                    <span className="text-label text-muted-foreground">
                      <span lang={g.lang}>{langName(g.lang)}</span> · {t("cmp.group.membersCount", { n: num(g.members_count) })}
                    </span>
                  </span>
                  <IconChevronLeft className="size-5 text-primary ltr:rotate-180" aria-hidden="true" />
                </button>
                {g.join_code && <CopyCode code={g.join_code} />}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button size="lg" variant="secondary" onClick={() => setCreating(true)}>
        <IconPlus data-icon="inline-start" stroke={1.75} />
        {t("cmp.groups.create")}
      </Button>
      <CreateGroup open={creating} onOpenChange={setCreating} />
    </div>
  )
}
