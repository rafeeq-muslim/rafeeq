/**
 * ORG-01 in «حسابي». R3: someone who did not open the link types the
 * organisation's code and is asked the same question. R3 ex2: a wrong code
 * says only «تحقق من الرمز». R4: unlink any time; nobody is told.
 */
import * as React from "react"
import { IconBuildingCommunity } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useT } from "@/app/i18n"
import { codeInfo, linkOrg, unlinkOrg, type CodeInfo } from "./api"
import { OrgQuestion } from "./OrgQuestion"
import { useOrgLink } from "./store"

export function OrgSection() {
  const { t } = useT()
  const link = useOrgLink((s) => s.link)
  const [code, setCode] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [asking, setAsking] = React.useState<CodeInfo | null>(null)
  const [busy, setBusy] = React.useState(false)

  const check = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    setInvalid(false)
    try {
      setAsking(await codeInfo(code.trim()))
    } catch {
      setInvalid(true)
    } finally {
      setBusy(false)
    }
  }

  const answer = async (yes: boolean) => {
    if (!yes) {
      setAsking(null)
      setCode("")
      toast(t("org.me.declined"))
      return
    }
    setBusy(true)
    try {
      const r = await linkOrg(code.trim())
      toast.success(t("org.me.linkedToast", { name: r.name ?? "" }))
      setAsking(null)
      setCode("")
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(false)
    }
  }

  const unlink = async () => {
    setBusy(true)
    try {
      await unlinkOrg()
      toast(t("org.me.unlinked"))
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(false)
    }
  }

  if (link)
    return (
      <div className="flex flex-col gap-3 rounded-card border-2 bg-card p-4" data-slot="org-linked">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
            <IconBuildingCommunity className="size-5" stroke={1.75} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-body font-bold">{t("org.me.linked", { name: "⁨" + link.name + "⁩" })}</p>
            <p className="text-label text-muted-foreground">{t("org.me.linkedHint")}</p>
          </div>
        </div>
        <Button variant="outline" className="w-fit" disabled={busy} onClick={() => void unlink()}>
          {t("org.me.unlink")}
        </Button>
      </div>
    )

  if (asking)
    return (
      <div className="rounded-card border-2 bg-card p-4">
        <OrgQuestion name={asking.name} busy={busy} onYes={() => void answer(true)} onNo={() => void answer(false)} />
      </div>
    )

  return (
    <form onSubmit={check} className="flex flex-col gap-3 rounded-card border-2 bg-card p-4">
      <Field data-invalid={invalid || undefined}>
        <FieldLabel htmlFor="org-code">{t("org.me.codeLabel")}</FieldLabel>
        <Input
          id="org-code"
          dir="ltr"
          autoCapitalize="characters"
          autoComplete="off"
          aria-invalid={invalid || undefined}
          value={code}
          onChange={(e) => {
            setCode(e.target.value)
            setInvalid(false)
          }}
        />
        {invalid ? <FieldError>{t("org.me.invalid")}</FieldError> : <FieldDescription>{t("org.me.codeHint")}</FieldDescription>}
      </Field>
      <Button type="submit" variant="secondary" className="w-fit" disabled={busy || !code.trim()}>
        {t("org.me.check")}
      </Button>
    </form>
  )
}
