/**
 * The Rafeeq team creates an organisation after checking it is licensed
 * (ORG-01 open question, default until decided): name and languages; each
 * language gets one code (ORG-01 R1). Then a one-time code for its
 * coordinator (valid 7 days).
 */
import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { IconCopy } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { LOCALES, num, useT } from "@/app/i18n"
import { langName } from "@/app/companion/format"
import { adminOrgApi } from "./api"

export function AdminOrgs() {
  const { t } = useT()
  const qc = useQueryClient()
  const [name, setName] = React.useState("")
  const [langs, setLangs] = React.useState<string[]>([])
  const list = useQuery({ queryKey: ["admin-orgs"], queryFn: adminOrgApi.list })
  const create = useMutation({
    mutationFn: () => adminOrgApi.create(name.trim(), langs),
    onSuccess: () => {
      setName("")
      setLangs([])
      void qc.invalidateQueries({ queryKey: ["admin-orgs"] })
    },
    onError: () => toast.error(t("common.error")),
  })
  const copy = (text: string) => void navigator.clipboard?.writeText(text).then(() => toast.success(t("common.copied")), () => undefined)
  const invite = useMutation({
    mutationFn: (id: string) => adminOrgApi.invite(id),
    onSuccess: (r) => {
      toast(r.code)
      copy(r.code)
    },
    onError: () => toast.error(t("common.error")),
  })

  return (
    <section className="flex flex-col gap-4 border-t pt-6" aria-labelledby="orgs">
      <h2 id="orgs" className="font-heading text-h3 font-bold">
        {t("org.admin.title")}
      </h2>
      <p className="text-label text-muted-foreground">{t("org.admin.hint")}</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim().length >= 2 && langs.length) create.mutate()
        }}
      >
        <Field>
          <FieldLabel htmlFor="org-name">{t("org.admin.name")}</FieldLabel>
          <Input id="org-name" dir="auto" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>{t("org.admin.langs")}</FieldLabel>
          <ToggleGroup type="multiple" variant="outline" value={langs} onValueChange={setLangs} aria-label={t("org.admin.langs")} className="justify-start">
            {LOCALES.map((l) => (
              <ToggleGroupItem key={l.code} value={l.code} lang={l.code}>
                {l.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <Button type="submit" className="w-fit" disabled={create.isPending || name.trim().length < 2 || langs.length === 0}>
          {t("org.admin.create")}
        </Button>
      </form>
      <ul className="flex flex-col gap-3">
        {list.data?.map((o) => (
          <li key={o.id} className="flex flex-col gap-2 rounded-card border-2 bg-card p-4">
            <p className="text-body font-bold">
              <bdi>{o.name}</bdi>
            </p>
            <p className="text-caption text-muted-foreground">{t("org.admin.coordinators", { n: num(o.coordinators) })}</p>
            <ul className="flex flex-wrap gap-2">
              {o.codes.map((c) => (
                <li key={c.code} className="flex items-center gap-1 rounded-md border px-2 py-1 text-label">
                  <span>{langName(c.lang)}</span>
                  <code dir="ltr" className="font-mono">
                    {c.code}
                  </code>
                </li>
              ))}
            </ul>
            <Button variant="secondary" size="sm" className="w-fit" disabled={invite.isPending} onClick={() => invite.mutate(o.id)}>
              <IconCopy data-icon="inline-start" stroke={1.75} />
              {t("org.admin.coordInvite")}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
