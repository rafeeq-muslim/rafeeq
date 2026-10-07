/**
 * Earlier messages of a conversation, on demand (security review 2026-10-07,
 * A-M4). The server sends the last 200 messages and says whether older ones
 * exist; `?before=<id of the first one>` reads the page before them. The
 * open screen keeps polling the last page only; pages loaded here sit in
 * front of it. A message pushed out of the last page by new ones while the
 * screen is open is kept, so nothing goes missing in the middle.
 *
 * `reset()` drops what was loaded (back to the last page): the screens call
 * it after a report, so a message hidden by it is never shown from here
 * (CMP-04 R2).
 */
import * as React from "react"

type Msg = { id: string; created_at: string }
type Page<M> = { messages: M[]; has_earlier?: boolean }

export function useEarlier<M extends Msg>(
  threadId: string | undefined,
  latest: M[] | undefined,
  hasEarlier: boolean | undefined,
  fetchBefore: (before: string) => Promise<Page<M>>,
) {
  const [older, setOlder] = React.useState<M[]>([])
  const [slid, setSlid] = React.useState<M[]>([])
  const [more, setMore] = React.useState<boolean | null>(null) // null: nothing loaded yet, the last page decides
  const [loading, setLoading] = React.useState(false)
  const prev = React.useRef<M[]>([])
  const loaded = React.useRef(false)

  const reset = React.useCallback(() => {
    setOlder([])
    setSlid([])
    setMore(null)
    loaded.current = false
  }, [])

  React.useEffect(() => {
    reset()
    prev.current = []
  }, [threadId, reset])

  React.useEffect(() => {
    if (!latest) return
    const first = latest[0]
    if (loaded.current && first) {
      const now = new Set(latest.map((m) => m.id))
      const out = prev.current.filter((m) => !now.has(m.id) && m.created_at <= first.created_at)
      if (out.length > 0) setSlid((s) => [...s, ...out])
    }
    prev.current = latest
  }, [latest])

  const messages = React.useMemo(() => {
    const seen = new Set<string>()
    return [...older, ...slid, ...(latest ?? [])].filter((m) => !seen.has(m.id) && seen.add(m.id))
  }, [older, slid, latest])

  const loadEarlier = React.useCallback(async () => {
    const first = messages[0]
    if (!first || loading) return
    setLoading(true)
    try {
      const page = await fetchBefore(first.id)
      loaded.current = true
      setOlder((o) => [...page.messages, ...o])
      setMore(!!page.has_earlier)
    } finally {
      setLoading(false)
    }
  }, [messages, loading, fetchBefore])

  return { messages, hasEarlier: more ?? !!hasEarlier, loading, loadEarlier, reset }
}
