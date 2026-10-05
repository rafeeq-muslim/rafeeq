/**
 * PRC-02 habits (draft feature, on the device only). R1: suggested or own
 * habit; the type is chosen before saving and an own habit is worship unless
 * changed. R2: worship habits show today's mark and «private» only — no count,
 * no streak, no points, no event. R3: other habits show the days kept.
 * R5: no missed days. R6: delete with its log.
 */
import * as React from "react"
import { IconEyeOff, IconPlus, IconTrash } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { SpotIllustration } from "@/components/rafeeq"
import { useT, type Key } from "@/app/i18n"
import { deleteHabit, habitView, localDay, newHabit, SUGGESTED, toggleToday } from "./habits"
import { countOf } from "./plural"
import { usePractice, type Habit } from "./store"
import { BackBar } from "./ui"

function HabitRow({ h, onDelete }: { h: Habit; onDelete: () => void }) {
  const { t, locale } = useT()
  const id = React.useId()
  const log = usePractice((s) => s.log)
  const set = usePractice((s) => s.set)
  const today = localDay()
  const v = habitView(h, log, today)
  const title = h.suggested ? t(`practice.habits.s.${h.suggested}` as Key) : h.title
  const toggle = () => set({ log: toggleToday(h, log, today) })
  return (
    <li className="flex min-h-16 items-center gap-3 rounded-md border bg-card px-4 py-2">
      <Checkbox id={id} checked={v.checkedToday} onCheckedChange={toggle} className="size-6 rounded-md" />
      <label htmlFor={id} className="min-w-0 flex-1">
        <bdi dir="auto" className="block text-body font-medium">
          {title}
        </bdi>
      </label>
      {v.private ? (
        <Badge variant="outline" className="text-muted-foreground">
          <IconEyeOff data-icon="inline-start" stroke={1.75} />
          {t("practice.habits.private")}
        </Badge>
      ) : (
        <Badge variant="secondary" className="tabular-nums">
          {countOf(locale, "days", v.daysKept ?? 0)}
        </Badge>
      )}
      <Button variant="ghost" size="icon" aria-label={t("practice.habits.delete")} onClick={onDelete}>
        <IconTrash stroke={1.75} />
      </Button>
    </li>
  )
}

function AddHabit({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useT()
  const habits = usePractice((s) => s.habits)
  const set = usePractice((s) => s.set)
  const [title, setTitle] = React.useState("")
  const [kind, setKind] = React.useState<"worship" | "life">("worship")
  const taken = new Set(habits.map((h) => h.suggested).filter(Boolean))

  const add = (h: Habit) => {
    set({ habits: [...habits, h] })
    setTitle("")
    setKind("worship")
    onOpenChange(false)
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{t("practice.habits.add")}</DrawerTitle>
          <DrawerDescription>{t("practice.habits.addBody")}</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-5 overflow-y-auto overscroll-contain px-4">
          <div className="flex flex-wrap gap-2">
            {SUGGESTED.filter((s) => !taken.has(s.key)).map((s) => (
              <Button key={s.key} variant="outline" size="sm" onClick={() => add(newHabit({ suggested: s.key }))}>
                {t(`practice.habits.s.${s.key}` as Key)}
              </Button>
            ))}
          </div>
          <form
            className="flex flex-col gap-3 border-t pt-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (title.trim()) add(newHabit({ title, worship: kind === "worship" }))
            }}
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-label font-medium">{t("practice.habits.own")}</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={60}
                dir="auto"
                className="h-12 w-full rounded-md border border-input bg-card px-4 text-body outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="text-label font-medium">{t("practice.habits.kind")}</span>
              <ToggleGroup type="single" value={kind} onValueChange={(v) => v && setKind(v as "worship" | "life")} className="w-full">
                <ToggleGroupItem value="worship" className="flex-1">
                  {t("practice.habits.kindWorship")}
                </ToggleGroupItem>
                <ToggleGroupItem value="life" className="flex-1">
                  {t("practice.habits.kindLife")}
                </ToggleGroupItem>
              </ToggleGroup>
              <p className="text-caption text-muted-foreground">{t(kind === "worship" ? "practice.habits.kindWorshipNote" : "practice.habits.kindLifeNote")}</p>
            </div>
            <DrawerFooter className="px-0">
              <Button type="submit" size="lg" disabled={!title.trim()}>
                {t("practice.habits.save")}
              </Button>
            </DrawerFooter>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

export default function HabitsScreen() {
  const { t } = useT()
  const habits = usePractice((s) => s.habits)
  const log = usePractice((s) => s.log)
  const set = usePractice((s) => s.set)
  const [adding, setAdding] = React.useState(false)
  const [removing, setRemoving] = React.useState<Habit | null>(null)

  return (
    <>
      <BackBar
        title={t("practice.habits")}
        end={
          habits.length > 0 && (
            <Button variant="ghost" size="icon" aria-label={t("practice.habits.add")} onClick={() => setAdding(true)}>
              <IconPlus stroke={1.75} />
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-4 px-4 pt-4 pb-10">
        <p className="text-body text-muted-foreground">{t("practice.private")}</p>
        {habits.length === 0 ? (
          <section className="flex flex-col items-center gap-4 py-6 text-center">
            <SpotIllustration kind="start" size={96} />
            <p className="max-w-80 text-body text-muted-foreground">{t("practice.habits.emptyBody")}</p>
            <Button onClick={() => setAdding(true)}>
              <IconPlus data-icon="inline-start" stroke={1.75} />
              {t("practice.habits.add")}
            </Button>
          </section>
        ) : (
          <ul className="flex flex-col gap-2">
            {habits.map((h) => (
              <HabitRow key={h.id} h={h} onDelete={() => setRemoving(h)} />
            ))}
          </ul>
        )}
        <p className="text-caption text-muted-foreground">{t("practice.habits.deviceOnly")}</p>
      </div>

      <AddHabit open={adding} onOpenChange={setAdding} />

      <AlertDialog open={removing !== null} onOpenChange={(v) => !v && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("practice.habits.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("practice.habits.deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removing) set(deleteHabit(habits, log, removing.id))
                setRemoving(null)
              }}
            >
              {t("practice.habits.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
