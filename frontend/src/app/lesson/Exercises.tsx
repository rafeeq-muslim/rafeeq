/**
 * LRN-03 R2: the three exercise types. Each is controlled (the player owns
 * the value) so the check, the feedback sheet and the retry live in one
 * place. Ordering and matching use taps, not drag: reliable with one thumb,
 * with screen readers, and in both directions.
 */
import * as React from "react"

import { cn } from "@/lib/utils"
import { RadioGroup } from "@/components/ui/radio-group"
import { ExerciseOption } from "@/components/rafeeq"
import { num, useT } from "@/app/i18n"
import { checkChoose, checkMatch, checkOrder, shuffle, shuffleAway } from "@/app/learning/session"
import type { ChooseExercise, Exercise, Item, MatchExercise, OrderExercise } from "@/app/learning/types"

export type Value = string | null | string[] | [string, string][]
export type Result = "correct" | "incorrect" | null

export const emptyValue = (e: Exercise): Value => (e.type === "choose" ? null : [])

export function ready(e: Exercise, v: Value): boolean {
  if (e.type === "choose") return typeof v === "string"
  if (e.type === "order") return Array.isArray(v) && v.length === e.items.length
  return Array.isArray(v) && v.length === e.left.length
}

export function check(e: Exercise, v: Value): boolean {
  if (e.type === "choose") return checkChoose(e, v as string)
  if (e.type === "order") return checkOrder(e, v as string[])
  return checkMatch(e, v as [string, string][])
}

type Props<E, V> = { exercise: E; value: V; onChange: (v: V) => void; result: Result }

export function ExerciseView({ exercise, value, onChange, result }: Props<Exercise, Value>) {
  // A value left over from the previous exercise must never reach the next one
  // in the wrong shape (issue #9: review crashed going from choose to match).
  if (exercise.type === "choose")
    return <Choose exercise={exercise} value={typeof value === "string" ? value : null} onChange={onChange} result={result} />
  const list = Array.isArray(value) ? value : []
  if (exercise.type === "order") return <Order exercise={exercise} value={list as string[]} onChange={onChange} result={result} />
  return <Match exercise={exercise} value={list as [string, string][]} onChange={onChange} result={result} />
}

function Choose({ exercise, value, onChange, result }: Props<ChooseExercise, string | null>) {
  const { t } = useT()
  const options = React.useMemo(() => shuffle(exercise.options, exercise.id), [exercise])
  return (
    <RadioGroup value={value ?? ""} onValueChange={(v) => !result && onChange(v)} className="gap-3" aria-label={exercise.prompt}>
      {options.map((o) => (
        <ExerciseOption
          key={o.id}
          value={o.id}
          title={o.text}
          correctLabel={t("lesson.correct")}
          disabled={!!result && o.id !== value && o.id !== exercise.answer}
          state={result && o.id === exercise.answer ? "correct" : result === "incorrect" && o.id === value ? "incorrect" : "idle"}
        />
      ))}
    </RadioGroup>
  )
}

function Tile({
  children,
  onClick,
  selected,
  done,
  disabled,
  mark,
  className,
}: {
  children: React.ReactNode
  onClick?: () => void
  selected?: boolean
  done?: boolean
  disabled?: boolean
  mark?: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "tactile flex min-h-14 w-full items-center gap-3 rounded-card border-2 bg-card px-4 py-3 text-start text-body font-bold [--lip:var(--outline-lip)] disabled:cursor-default",
        selected && "border-primary bg-secondary [--lip:var(--primary)]",
        done && "border-success bg-success-surface [--lip:var(--success)]",
        className,
      )}
    >
      {mark}
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  )
}

const Num = ({ n, tone = "primary" }: { n: number; tone?: "primary" | "success" }) => (
  <span
    aria-hidden="true"
    className={cn(
      "grid size-7 shrink-0 place-items-center rounded-full text-label font-bold tabular-nums",
      tone === "primary" ? "bg-primary text-primary-foreground" : "bg-success text-white",
    )}
  >
    {num(n)}
  </span>
)

function Order({ exercise, value, onChange, result }: Props<OrderExercise, string[]>) {
  const { t } = useT()
  const bank = React.useMemo(() => shuffleAway(exercise.items, exercise.answer, exercise.id), [exercise])
  const byId = (id: string) => exercise.items.find((i) => i.id === id) as Item
  const shown = result === "incorrect" ? exercise.answer : value

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-col gap-2" aria-label={t("lesson.order")}>
        {shown.map((id, i) => (
          <li key={id}>
            <Tile
              onClick={() => !result && onChange(value.filter((x) => x !== id))}
              disabled={!!result}
              done={!!result}
              mark={<Num n={i + 1} tone={result ? "success" : "primary"} />}
            >
              {byId(id).text}
            </Tile>
          </li>
        ))}
        {!result &&
          Array.from({ length: exercise.items.length - value.length }).map((_, i) => (
            <li key={`slot-${i}`} aria-hidden="true" className="h-14 rounded-card border-2 border-dashed border-border" />
          ))}
      </ol>
      {!result && (
        <ul className="flex flex-col gap-2 border-t pt-5">
          {bank
            .filter((it) => !value.includes(it.id))
            .map((it) => (
              <li key={it.id}>
                <Tile onClick={() => onChange([...value, it.id])}>{it.text}</Tile>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}

function Match({ exercise, value, onChange, result }: Props<MatchExercise, [string, string][]>) {
  const { t } = useT()
  const [left, setLeft] = React.useState<string | null>(null)
  const lefts = React.useMemo(() => shuffle(exercise.left, `${exercise.id}:l`), [exercise])
  const rights = React.useMemo(() => shuffle(exercise.right, `${exercise.id}:r`), [exercise])
  const pairs = result === "incorrect" ? exercise.answer : value
  const pairOf = (id: string, side: 0 | 1) => pairs.findIndex((p) => p[side] === id)

  const pickLeft = (id: string) => {
    if (result) return
    const i = pairOf(id, 0)
    if (i >= 0) return onChange(value.filter((_, k) => k !== i))
    setLeft(left === id ? null : id)
  }
  const pickRight = (id: string) => {
    if (result) return
    const i = pairOf(id, 1)
    if (i >= 0) return onChange(value.filter((_, k) => k !== i))
    if (left) {
      onChange([...value, [left, id]])
      setLeft(null)
    }
  }
  const mark = (i: number) => (i >= 0 ? <Num n={i + 1} tone={result ? "success" : "primary"} /> : null)

  return (
    <div className="grid grid-cols-2 gap-3" role="group" aria-label={t("lesson.match")}>
      <ul className="flex flex-col gap-2">
        {lefts.map((it) => (
          <li key={it.id}>
            <Tile onClick={() => pickLeft(it.id)} selected={left === it.id} done={!!result} disabled={!!result} mark={mark(pairOf(it.id, 0))}>
              {it.text}
            </Tile>
          </li>
        ))}
      </ul>
      <ul className="flex flex-col gap-2">
        {rights.map((it) => (
          <li key={it.id}>
            <Tile
              onClick={() => pickRight(it.id)}
              done={!!result}
              disabled={!!result || (!left && pairOf(it.id, 1) < 0)}
              mark={mark(pairOf(it.id, 1))}
              className="text-label font-medium"
            >
              {it.text}
            </Tile>
          </li>
        ))}
      </ul>
    </div>
  )
}
