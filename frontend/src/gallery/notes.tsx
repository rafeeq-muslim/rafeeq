import * as React from "react"
import { IconCheck, IconCopy, IconMessage2, IconNotes, IconTrash, IconX } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

/*
 * Review notes for the gallery.
 * - Published as a claude.ai artifact: each «ملاحظة» button opens the shell's
 *   own comment composer anchored to that component (comments capability,
 *   composer-only), so the team's threads live in one shared place and
 *   Claude can read them.
 * - Opened as a local HTML file: notes are kept in this browser
 *   (localStorage) and can be copied as one text block to send back.
 */

type LocalNote = { id: string; target: string; text: string; at: number }
type CommentsApi = {
  openComposer: (t: { element: Element }) => Promise<{ opened: boolean }>
}
type Mode = "loading" | "shell" | "local"

const KEY = "rafeeq-ds-notes-v1"

function readNotes(): LocalNote[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as LocalNote[]) : []
  } catch {
    return []
  }
}
function writeNotes(notes: LocalNote[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(notes))
  } catch {
    /* storage blocked: notes stay for this visit only */
  }
}

type NotesCtx = {
  mode: Mode
  notes: LocalNote[]
  add: (target: string, text: string) => void
  remove: (id: string) => void
  openShell: (el: Element) => Promise<boolean>
}

const Ctx = React.createContext<NotesCtx | null>(null)

function NotesProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = React.useState<Mode>("loading")
  const [notes, setNotes] = React.useState<LocalNote[]>(() => readNotes())
  const api = React.useRef<CommentsApi | null>(null)

  React.useEffect(() => {
    let alive = true
    const w = window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }
    if (!w.claude?.use) {
      setMode("local")
      return
    }
    w.claude
      .use("comments")
      .then((c) => {
        if (!alive) return
        api.current = (c as CommentsApi | null) ?? null
        setMode(c ? "shell" : "local")
      })
      .catch(() => alive && setMode("local"))
    return () => {
      alive = false
    }
  }, [])

  const value = React.useMemo<NotesCtx>(
    () => ({
      mode,
      notes,
      add: (target, text) =>
        setNotes((prev) => {
          const next = [...prev, { id: `${Date.now()}-${prev.length}`, target, text, at: Date.now() }]
          writeNotes(next)
          return next
        }),
      remove: (id) =>
        setNotes((prev) => {
          const next = prev.filter((n) => n.id !== id)
          writeNotes(next)
          return next
        }),
      openShell: async (el) => {
        if (!api.current) return false
        try {
          const r = await api.current.openComposer({ element: el })
          return r.opened
        } catch (e) {
          const code = (e as { code?: string }).code
          if (code === "unavailable" || code === "not_granted" || code === "forbidden") {
            api.current = null
            setMode("local")
          }
          return false
        }
      },
    }),
    [mode, notes]
  )

  return (
    <Ctx.Provider value={value}>
      {children}
      {mode === "local" && <NotesTray />}
    </Ctx.Provider>
  )
}

function useNotes() {
  return React.useContext(Ctx)
}

/**
 * The «ملاحظة» control on a demo or screen. `targetRef` is the element the
 * note is about (the shell anchors its comment there).
 */
function NoteButton({
  target,
  targetRef,
  className,
}: {
  target: string
  targetRef: React.RefObject<HTMLElement | null>
  className?: string
}) {
  const ctx = useNotes()
  const [open, setOpen] = React.useState(false)
  const [text, setText] = React.useState("")
  if (!ctx || ctx.mode === "loading") return null
  const mine = ctx.notes.filter((n) => n.target === target)

  return (
    <div className={cn("flex flex-col gap-2", className)} data-uncommentable>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            if (ctx.mode === "shell" && targetRef.current) {
              const opened = await ctx.openShell(targetRef.current)
              if (opened) return
            }
            setOpen((o) => !o)
          }}
          aria-expanded={ctx.mode === "local" ? open : undefined}
        >
          <IconMessage2 data-icon="inline-start" />
          ملاحظة
        </Button>
        {mine.length > 0 && <Badge variant="info">{`${mine.length} ملاحظة محفوظة`}</Badge>}
      </div>
      {ctx.mode === "local" && open && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const t = text.trim()
            if (!t) return
            ctx.add(target, t)
            setText("")
            setOpen(false)
          }}
        >
          <Textarea
            id={`note-${target}`}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 2000))}
            placeholder={`ملاحظتك على ${target}`}
            className="min-h-20"
            autoFocus
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!text.trim()}>
              احفظ الملاحظة
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      )}
      {ctx.mode === "local" && mine.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {mine.map((n) => (
            <li key={n.id} className="flex items-start gap-2 rounded-md bg-info-surface px-3 py-2 text-label">
              <span className="min-w-0 flex-1 whitespace-pre-wrap" dir="auto">
                {n.text}
              </span>
              <button
                type="button"
                aria-label="احذف الملاحظة"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => ctx.remove(n.id)}
              >
                <IconTrash className="size-4" stroke={1.75} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function notesAsText(notes: LocalNote[]) {
  const by = new Map<string, LocalNote[]>()
  for (const n of notes) by.set(n.target, [...(by.get(n.target) ?? []), n])
  return [...by.entries()]
    .map(([t, list]) => `## ${t}\n${list.map((n) => `- ${n.text.replace(/\n/g, "\n  ")}`).join("\n")}`)
    .join("\n\n")
}

/** Floating tray (local mode): all notes, and one button to copy them. */
function NotesTray() {
  const ctx = useNotes()
  const [open, setOpen] = React.useState(false)
  const [copied, setCopied] = React.useState<"" | "ok" | "fail">("")
  const textRef = React.useRef<HTMLTextAreaElement>(null)
  if (!ctx) return null
  const all = notesAsText(ctx.notes)
  return (
    <div className="fixed end-4 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-40 flex flex-col items-end gap-2">
      {open && (
        <div className="flex max-h-[70dvh] w-[min(26rem,calc(100vw-2rem))] flex-col gap-3 overflow-hidden rounded-panel border-2 bg-card p-4 shadow-raised">
          <div className="flex items-center gap-2">
            <p className="flex-1 font-heading text-h3 font-bold">ملاحظاتك</p>
            <Button variant="ghost" size="icon-sm" aria-label="أغلق" onClick={() => setOpen(false)}>
              <IconX />
            </Button>
          </div>
          {ctx.notes.length === 0 ? (
            <p className="text-label text-muted-foreground">
              لا ملاحظات بعد. اضغط «ملاحظة» تحت أي مكوّن أو شاشة واكتب رأيك؛ تُحفظ في هذا المتصفح.
            </p>
          ) : (
            <>
              <textarea
                ref={textRef}
                readOnly
                value={all}
                dir="auto"
                className="min-h-40 flex-1 resize-none rounded-md border bg-background p-3 text-label"
              />
              <Button
                onClick={() => {
                  const done = () => {
                    setCopied("ok")
                    window.setTimeout(() => setCopied(""), 1800)
                  }
                  navigator.clipboard?.writeText(all).then(done, () => {
                    textRef.current?.select()
                    setCopied("fail")
                  })
                }}
              >
                {copied === "ok" ? <IconCheck data-icon="inline-start" /> : <IconCopy data-icon="inline-start" />}
                {copied === "ok" ? "نُسخت" : copied === "fail" ? "حدّدنا النص؛ انسخه يدويًا" : "انسخ كل الملاحظات"}
              </Button>
            </>
          )}
        </div>
      )}
      <Button size="lg" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <IconNotes data-icon="inline-start" />
        {`ملاحظاتك (${ctx.notes.length})`}
      </Button>
    </div>
  )
}

export { NotesProvider, NoteButton, useNotes }
