/**
 * CMP-04 one-tap report. The reason decides what happens at once: marriage,
 * money and recruitment hide the message for everyone until the team
 * reviews it (R2). The sender never learns who reported (R4). Optionally
 * blocks the sender too (R5).
 */
import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useT } from "@/app/i18n"
import { REASONS, type ReportReason, safetyApi } from "./api"
import { useSendError } from "./Chat"

export type ReportTarget = { type: "group_message" | "help_message"; id: string; authorId?: string | null }

export function ReportSheet({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  const { t } = useT()
  const qc = useQueryClient()
  const toMessage = useSendError()
  const [reason, setReason] = React.useState<ReportReason | "">("")
  const [note, setNote] = React.useState("")
  const [alsoBlock, setAlsoBlock] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  React.useEffect(() => {
    if (target) {
      setReason("")
      setNote("")
      setAlsoBlock(false)
    }
  }, [target])

  const send = async () => {
    if (!target || !reason) return
    setPending(true)
    try {
      const out = await safetyApi.report(target.type, target.id, reason, note.trim())
      if (alsoBlock && target.authorId) await safetyApi.block(target.authorId)
      toast.success(out.hidden_for_all ? t("cmp.report.doneHidden") : t("cmp.report.done"))
      await qc.invalidateQueries({ queryKey: ["cmp"] })
      onClose()
    } catch (e) {
      toast.error(toMessage(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <Drawer open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="mx-auto max-w-xl rounded-t-panel">
        <DrawerHeader className="text-start">
          <DrawerTitle className="font-heading text-h3">{t("cmp.report.title")}</DrawerTitle>
          <DrawerDescription className="text-body">{t("cmp.report.body")}</DrawerDescription>
        </DrawerHeader>
        <FieldGroup className="overflow-y-auto overscroll-contain px-4">
          <ToggleGroup
            type="single"
            variant="outline"
            value={reason}
            onValueChange={(v) => setReason(v as ReportReason | "")}
            className="w-full flex-wrap"
            aria-label={t("cmp.report.title")}
          >
            {REASONS.map((r) => (
              <ToggleGroupItem key={r} value={r} className="whitespace-normal">
                {t(`cmp.reason.${r}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Field>
            <FieldLabel htmlFor="report-note">{t("cmp.report.note")}</FieldLabel>
            <Textarea id="report-note" value={note} maxLength={500} dir="auto" onChange={(e) => setNote(e.target.value)} className="text-body" />
          </Field>
          {target?.authorId && (
            <Field orientation="horizontal">
              <Checkbox id="report-block" checked={alsoBlock} onCheckedChange={(v) => setAlsoBlock(v === true)} />
              <FieldLabel htmlFor="report-block" className="text-body font-normal">
                {t("cmp.report.alsoBlock")}
              </FieldLabel>
            </Field>
          )}
        </FieldGroup>
        <DrawerFooter className="pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
          <Button size="lg" disabled={!reason || pending} onClick={() => void send()}>
            {t("cmp.report.send")}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
