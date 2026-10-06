/**
 * LRN-03 R2: the three exercise types. Each is controlled (the player owns
 * the value) so the check, the feedback sheet and the retry live in one
 * place. Ordering and matching use taps, not drag: reliable with one thumb,
 * with screen readers, and in both directions.
 *
 * LRN-03 R3 (after a mistake): the learner's own answer stays on screen.
 * Ordering marks each misplaced step with its correct number; matching marks
 * each wrong pair with its right partner.
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

/** LRN-03 R3: the heading after a mistake fits the exercise type. */
export const incorrectKey = (e: Exercise) =>
  e.type === "choose" ? ("lesson.incorrect" as const) : e.type === "order" ? ("lesson.incorrectOrder" as const) : ("lesson.incorrectMatch" as const)

/** LRN-03 R3: the steps are the cards' own names, so ordering quotes no card. */
export const quotesCard = (e: Exercise) => e.type !== "order"

/** LRN-03 R3: the feedback panel never covers the exercise. The page keeps
 * room below the exercise for the footer's real height, so a long exercise
 * scrolls above the panel. */
export function useFooterSpace<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = React.useRef<T>(null)
  const [h, setH] = React.useState(0)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => setH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, h]
}

type Props<E, V> = {
  exercise: E
  value: V
  onChange: (v: V) => void
  result: Result
  /** Attempt number: a returning exercise gets a new option order (LRN-03 R3, issue #9). */
  round?: number
}

export function ExerciseView({ exercise, value, onChange, result, round = 0 }: Props<Exercise, Value>) {
  // A value left over from the previous exercise must never reach the next one
  // in the wrong shape (issue #9: review crashed going from choose to match).
  if (exercise.type === "choose")
    return <Choose exercise={exercise} value={typeof value === "string" ? value : null} onChange={onChange} result={result} round={round} />
  const list = Array.isArray(value) ? value : []
  if (exercise.type === "order") return <Order exercise={exercise} value={list as string[]} onChange={onChange} result={result} round={round} />
  return <Match exercise={exercise} value={list as [string, string][]} onChange={onChange} result={result} round={round} />
}

function Choose({ exercise, value, onChange, result, round = 0 }: Props<ChooseExercise, string | null>) {
  const { t } = useT()
  const options = React.useMemo(() => shuffle(exercise.options, `${exercise.id}:${round}`), [exercise, round])
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
  wrong,
  disabled,
  mark,
  className,
}: {
  children: React.ReactNode
  onClick?: () => void
  selected?: boolean
  done?: boolean
  wrong?: boolean
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
        wrong && "border-warning bg-warning-surface [--lip:var(--warning)]",
        className,
      )}
    >
      {mark}
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  )
}

const Num = ({ n, tone = "primary" }: { n: number; tone?: "primary" | "success" | "warning" }) => (
  <span
    aria-hidden="true"
    className={cn(
      "grid size-7 shrink-0 place-items-center rounded-full text-label font-bold tabular-nums",
      tone === "primary" ? "bg-primary text-primary-foreground" : tone === "success" ? "bg-success text-white" : "bg-warning text-background",
    )}
  >
    {num(n)}
  </span>
)

function Order({ exercise, value, onChange, result, round = 0 }: Props<OrderExercise, string[]>) {
  const { t } = useT()
  const bank = React.useMemo(() => shuffleAway(exercise.items, exercise.answer, `${exercise.id}:${round}`), [exercise, round])
  const byId = (id: string) => exercise.items.find((i) => i.id === id) as Item

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-col gap-2" aria-label={t("lesson.order")}>
        {value.map((id, i) => {
          const right = exercise.answer.indexOf(id)
          const misplaced = result === "incorrect" && right !== i
          return (
            <li key={id}>
              <Tile
                onClick={() => !result && onChange(value.filter((x) => x !== id))}
                disabled={!!result}
                done={!!result && !misplaced}
                wrong={misplaced}
                mark={<Num n={misplaced ? right + 1 : i + 1} tone={misplaced ? "warning" : result ? "success" : "primary"} />}
              >
                {byId(id).text}
                {misplaced && <span className="sr-only"> {t("lesson.rightStep", { n: num(right + 1) })}</span>}
              </Tile>
            </li>
          )
        })}
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

function Match({ exercise, value, onChange, result, round = 0 }: Props<MatchExercise, [string, string][]>) {
  const { t } = useT()
  const [left, setLeft] = React.useState<string | null>(null)
  const lefts = React.useMemo(() => shuffle(exercise.left, `${exercise.id}:l:${round}`), [exercise, round])
  const rights = React.useMemo(() => shuffle(exercise.right, `${exercise.id}:r:${round}`), [exercise, round])
  const pairs = value
  const pairOf = (id: string, side: 0 | 1) => pairs.findIndex((p) => p[side] === id)
  const isRight = ([l, r]: [string, string]) => exercise.answer.some(([a, b]) => a === l && b === r)
  const wrongPair = (id: string, side: 0 | 1) => result === "incorrect" && pairOf(id, side) >= 0 && !isRight(pairs[pairOf(id, side)])
  const partner = (leftId: string) => exercise.right.find((r) => exercise.answer.some(([a, b]) => a === leftId && b === r.id))?.text

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
  const mark = (i: number, wrong: boolean) => (i >= 0 ? <Num n={i + 1} tone={wrong ? "warning" : result ? "success" : "primary"} /> : null)

  return (
    <div className="grid grid-cols-2 gap-3" role="group" aria-label={t("lesson.match")}>
      <ul className="flex flex-col gap-2">
        {lefts.map((it) => (
          <li key={it.id}>
            <Tile
              onClick={() => pickLeft(it.id)}
              selected={left === it.id}
              done={!!result && !wrongPair(it.id, 0)}
              wrong={wrongPair(it.id, 0)}
              disabled={!!result}
              mark={mark(pairOf(it.id, 0), wrongPair(it.id, 0))}
            >
              {it.text}
              {wrongPair(it.id, 0) && (
                <span className="mt-1 block text-label font-medium text-warning">{t("lesson.rightPartner", { text: partner(it.id) ?? "" })}</span>
              )}
            </Tile>
          </li>
        ))}
      </ul>
      <ul className="flex flex-col gap-2">
        {rights.map((it) => (
          <li key={it.id}>
            <Tile
              onClick={() => pickRight(it.id)}
              done={!!result && !wrongPair(it.id, 1)}
              wrong={wrongPair(it.id, 1)}
              disabled={!!result || (!left && pairOf(it.id, 1) < 0)}
              mark={mark(pairOf(it.id, 1), wrongPair(it.id, 1))}
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
