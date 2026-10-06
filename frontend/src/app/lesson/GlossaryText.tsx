/**
 * PLT-03 R5 (KNW-03 R3, lesson side): a Sharia term in a lesson card is
 * shown with its approved glossary entry. The text itself is never changed
 * (KNW-03 R4): an occurrence of an approved term (or one of its approved
 * alternates) becomes a quiet button that opens the approved definition.
 *
 * Only terms the Sharia reviewer approved in this language come from
 * GET /api/glossary (KNW-03 R2); a language without approved terms shows the
 * card as it is, never a machine translation (R5). While
 * content/glossary/terms.json is empty this renders plain text. Scripture is
 * never marked: verses are in VerseBlock and hadith cards are skipped.
 */
import * as React from "react"
import { useQuery } from "@tanstack/react-query"

import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { api } from "@/app/lib/api"
import { useT } from "@/app/i18n"

export type GlossaryTerm = { concept: string; term: string; alternates: string[]; definition: string; source_ids: string[] }

export const useGlossary = (lang: string) =>
  useQuery({
    queryKey: ["glossary", lang],
    queryFn: () => api<{ lang: string; terms: GlossaryTerm[] }>(`/api/glossary?lang=${lang}`),
    staleTime: 60 * 60_000,
    retry: false,
    select: (r) => r.terms,
  })

export type Piece = string | { text: string; term: GlossaryTerm }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Split text into plain runs and the first occurrence of each approved term.
 * Whole words only (no letter or mark on either side); longer forms first. */
export function splitTerms(text: string, terms: GlossaryTerm[]): Piece[] {
  const forms = terms
    .flatMap((term) => [term.term, ...(term.alternates ?? [])].filter((f) => f && f.trim()).map((form) => ({ form: form.trim(), term })))
    .sort((a, b) => b.form.length - a.form.length)
  if (!forms.length || !text) return [text]
  const re = new RegExp(`(?<![\\p{L}\\p{M}])(${forms.map((f) => escape(f.form)).join("|")})(?![\\p{L}\\p{M}])`, "giu")
  const byForm = new Map(forms.map((f) => [f.form.toLocaleLowerCase(), f.term]))
  const seen = new Set<string>()
  const out: Piece[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    const term = byForm.get(m[0].toLocaleLowerCase())
    if (!term || seen.has(term.concept)) continue
    seen.add(term.concept)
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push({ text: m[0], term })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Card text with its approved terms marked; plain text when there are none. */
export function GlossaryText({ text, terms }: { text: string; terms: GlossaryTerm[] | undefined }) {
  const { t } = useT()
  const [open, setOpen] = React.useState<GlossaryTerm | null>(null)
  const pieces = React.useMemo(() => splitTerms(text, terms ?? []), [text, terms])
  if (pieces.length === 1 && typeof pieces[0] === "string") return <>{text}</>
  return (
    <>
      {pieces.map((p, i) =>
        typeof p === "string" ? (
          <React.Fragment key={i}>{p}</React.Fragment>
        ) : (
          <button
            key={i}
            type="button"
            data-glossary-term={p.term.concept}
            onClick={() => setOpen(p.term)}
            className="inline cursor-help font-[inherit] text-inherit underline decoration-primary/50 decoration-dotted underline-offset-4"
          >
            {p.text}
          </button>
        ),
      )}
      <Drawer open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DrawerContent className="mx-auto max-w-xl rounded-t-panel">
          <DrawerHeader className="text-start pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
            <p className="text-label text-muted-foreground">{t("lesson.glossary.approved")}</p>
            <DrawerTitle className="font-heading text-h3">{open?.term}</DrawerTitle>
            <DrawerDescription className="text-body text-foreground">{open?.definition}</DrawerDescription>
          </DrawerHeader>
        </DrawerContent>
      </Drawer>
    </>
  )
}
