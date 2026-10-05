/**
 * MOT-06 R1/R3: the group's mentor sets this week's goal, one of six kinds.
 * Lesson and unit goals never unlock anything (R2). Free text goes to the
 * Sharia reviewer first and is never shown before approval; an approved
 * template starts at once.
 */
import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useT } from "@/app/i18n"
import { useContent } from "@/app/learning/useContent"
import { visibleUnits } from "@/app/learning/path"
import { CHALLENGE_TYPES, type ChallengeType, type Group, challengeApi, errorCode } from "../api"

export function CreateChallenge({ group, open, onOpenChange }: { group: Group; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useT()
  const qc = useQueryClient()
  const { content } = useContent()
  const units = content ? visibleUnits(content.units) : []
  const [type, setType] = React.useState<ChallengeType>("lessons_each")
  const [lessonId, setLessonId] = React.useState("")
  const [unitId, setUnitId] = React.useState("")
  const [count, setCount] = React.useState(3)
  const [days, setDays] = React.useState("4")
  const [text, setText] = React.useState("")
  const [templateId, setTemplateId] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const templates = useQuery({
    queryKey: ["cmp", "templates", group.lang],
    queryFn: () => challengeApi.templates(group.lang),
    enabled: open && type === "free_text",
  })

  const body = (): Record<string, unknown> | null => {
    switch (type) {
      case "lesson":
        return lessonId ? { type, target_id: lessonId } : null
      case "unit":
        return unitId ? { type, target_id: unitId } : null
      case "lessons_each":
      case "group_total":
        return count >= 1 ? { type, target_count: count } : null
      case "days_each":
        return { type, target_count: Number(days) }
      case "free_text":
        return templateId ? { type, template_id: templateId } : text.trim().length >= 3 ? { type, text: text.trim(), text_lang: group.lang } : null
    }
  }

  const submit = async () => {
    const b = body()
    if (!b) return
    setPending(true)
    try {
      await challengeApi.create(group.id, b)
      await qc.invalidateQueries({ queryKey: ["cmp", "challenge", group.id] })
      onOpenChange(false)
    } catch (e) {
      if (errorCode(e) === "challenge_running") {
        // Someone (another tab) already set this week's goal: show it.
        await qc.invalidateQueries({ queryKey: ["cmp", "challenge", group.id] })
        onOpenChange(false)
      } else toast.error(t("common.error"))
    } finally {
      setPending(false)
    }
  }

  const reviewNeeded = type === "free_text" && !templateId
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-xl rounded-t-panel">
        <DrawerHeader className="text-start">
          <DrawerTitle className="font-heading text-h3">{t("cmp.ch.create")}</DrawerTitle>
          <DrawerDescription className="text-label">{t("cmp.ch.none")}</DrawerDescription>
        </DrawerHeader>
        <FieldGroup className="overflow-y-auto overscroll-contain px-4">
          <FieldSet>
            <FieldLegend variant="label">{t("cmp.ch.type")}</FieldLegend>
            <ToggleGroup type="single" variant="outline" value={type} onValueChange={(v) => v && setType(v as ChallengeType)} className="w-full flex-wrap">
              {CHALLENGE_TYPES.map((k) => (
                <ToggleGroupItem key={k} value={k} className="whitespace-normal">
                  {t(`cmp.ch.type.${k}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FieldSet>

          {type === "lesson" && (
            <Field>
              <FieldLabel>{t("cmp.ch.pickLesson")}</FieldLabel>
              <Select value={lessonId} onValueChange={setLessonId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("cmp.ch.pickLesson")} />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectGroup key={u.id}>
                      <SelectLabel>{u.title}</SelectLabel>
                      {u.lessons.map((id) => (
                        <SelectItem key={id} value={id}>
                          {content?.lessons[id]?.title ?? id}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>{t("cmp.ch.noLock")}</FieldDescription>
            </Field>
          )}

          {type === "unit" && (
            <Field>
              <FieldLabel>{t("cmp.ch.pickUnit")}</FieldLabel>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("cmp.ch.pickUnit")} />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>{t("cmp.ch.noLock")}</FieldDescription>
            </Field>
          )}

          {(type === "lessons_each" || type === "group_total") && (
            <Field>
              <FieldLabel htmlFor="ch-count">{t("cmp.ch.count")}</FieldLabel>
              <Input
                id="ch-count"
                type="number"
                inputMode="numeric"
                min={1}
                value={count}
                onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
                className="w-28 tabular-nums"
              />
            </Field>
          )}

          {type === "days_each" && (
            <FieldSet>
              <FieldLegend variant="label">{t("cmp.ch.days")}</FieldLegend>
              <ToggleGroup type="single" variant="outline" value={days} onValueChange={(v) => v && setDays(v)} className="flex-wrap">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <ToggleGroupItem key={d} value={String(d)} className="tabular-nums">
                    {d}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </FieldSet>
          )}

          {type === "free_text" && (
            <>
              <Field>
                <FieldLabel htmlFor="ch-text">{t("cmp.ch.text")}</FieldLabel>
                <Textarea
                  id="ch-text"
                  dir="auto"
                  maxLength={200}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value)
                    setTemplateId("")
                  }}
                  className="text-body"
                />
                <FieldDescription>{t("cmp.ch.textHint")}</FieldDescription>
              </Field>
              {(templates.data?.length ?? 0) > 0 && (
                <FieldSet>
                  <FieldLegend variant="label">{t("cmp.ch.template")}</FieldLegend>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    orientation="vertical"
                    value={templateId}
                    onValueChange={(v) => {
                      setTemplateId(v)
                      if (v) setText("")
                    }}
                    className="w-full"
                  >
                    {templates.data!.map((tp) => (
                      <ToggleGroupItem key={tp.id} value={tp.id} dir="auto" className="h-auto min-h-11 justify-start py-2 text-start whitespace-normal">
                        {tp.text}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </FieldSet>
              )}
            </>
          )}
        </FieldGroup>
        <DrawerFooter className="pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
          <Button size="lg" disabled={!body() || pending} onClick={() => void submit()}>
            {reviewNeeded ? t("cmp.ch.sendReview") : t("cmp.ch.start")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
