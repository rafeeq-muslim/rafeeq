/**
 * MOT-03 badge names. R1: two kinds only, a unit badge (`unit-<id>`) and a
 * learning-days badge (`days-7|30|66`). R3: a unit badge is shown only by
 * the name the Sharia reviewer approved in the learner's language (the
 * unit's `badge_name` as served by /api/content, which carries approved
 * text only); until then it is kept but not shown, never machine-translated.
 */
import type { Content } from "@/app/learning/types"

export type BadgeView = { kind: "unit" | "days"; label: string; days?: number; unitTitle?: string }

/** How to show a badge, or null while its name is not approved in this language. */
export function badgeView(id: string, content: Pick<Content, "units"> | undefined, daysLabel: (n: number) => string): BadgeView | null {
  if (id.startsWith("days-")) {
    const n = Number(id.slice(5))
    return Number.isFinite(n) && n > 0 ? { kind: "days", label: daysLabel(n), days: n } : null
  }
  if (id.startsWith("unit-")) {
    const unit = content?.units.find((u) => `unit-${u.id}` === id)
    const name = unit?.badge_name?.trim()
    return unit && name ? { kind: "unit", label: name, unitTitle: unit.title } : null
  }
  return null
}
