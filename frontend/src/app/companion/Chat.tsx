/**
 * Conversation pieces shared by help threads (CMP-01/02/03) and group chat
 * (CMP-05): a message list built from the shadcn Message/Bubble primitives
 * and a composer that explains, never just fails, when a message is refused
 * (contact details, CMP-01 R5).
 */
import * as React from "react"
import { IconDots, IconSend2 } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"
import { Message, MessageContent, MessageFooter, MessageHeader } from "@/components/ui/message"
import { useT } from "@/app/i18n"
import { errorCode } from "./api"
import { time } from "./format"

export type ChatAction = { label: string; onSelect: () => void; destructive?: boolean }

export type ChatItem = {
  id: string
  mine: boolean
  name?: string | null
  /** e.g. «المرشد»: a quiet label after the name. */
  tag?: string | null
  body: string
  at: string
  /** The author's own message that was hidden for review (CMP-04 R5). */
  hidden?: boolean
  actions?: ChatAction[]
}

export function ChatList({ items, empty, className }: { items: ChatItem[]; empty?: React.ReactNode; className?: string }) {
  const { t, locale } = useT()
  const endRef = React.useRef<HTMLDivElement>(null)
  const last = items.at(-1)?.id
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [last])

  if (items.length === 0) return <div className={cn("py-6", className)}>{empty}</div>
  return (
    <ol className={cn("flex flex-col gap-4", className)} aria-live="polite">
      {items.map((m) => (
        <li key={m.id}>
          <Message align={m.mine ? "end" : "start"}>
            <MessageContent>
              {!m.mine && m.name && (
                <MessageHeader className="gap-1.5 text-caption">
                  <bdi className="font-bold text-foreground">{m.name}</bdi>
                  {m.tag && <span className="text-primary">· {m.tag}</span>}
                </MessageHeader>
              )}
              <Bubble variant={m.hidden ? "muted" : m.mine ? "default" : "outline"} align={m.mine ? "end" : "start"}>
                <BubbleContent dir="auto" className="whitespace-pre-wrap">
                  {m.body}
                </BubbleContent>
              </Bubble>
              <MessageFooter className="gap-1 text-caption">
                <span className="tabular-nums">{time(m.at, locale)}</span>
                {m.hidden && <span className="text-warning">· {t("cmp.thread.hidden")}</span>}
                {m.actions && m.actions.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="-my-2 size-9 text-muted-foreground" aria-label={t("cmp.thread.more")}>
                        <IconDots stroke={1.75} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align={m.mine ? "end" : "start"}>
                      {m.actions.map((a) => (
                        <DropdownMenuItem key={a.label} variant={a.destructive ? "destructive" : "default"} onSelect={a.onSelect} className="min-h-11 text-label">
                          {a.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </MessageFooter>
            </MessageContent>
          </Message>
        </li>
      ))}
      <div ref={endRef} />
    </ol>
  )
}

/** Friendly copy for a refused send (copy.md: what happened + what to do). */
export function useSendError() {
  const { t } = useT()
  return (e: unknown) => {
    const code = errorCode(e)
    if (code === "contact_not_allowed") return t("cmp.err.contact")
    if (code === "empty_message") return t("cmp.err.empty")
    if (code === "rate_limited") return t("cmp.err.rate")
    if (code === "gender_required") return t("cmp.err.gender")
    return t("common.error")
  }
}

export function Composer({
  placeholder,
  onSend,
  label,
  className,
}: {
  placeholder: string
  /** Resolve to clear the box; throw to keep the text and show why. */
  onSend: (text: string) => Promise<unknown>
  label?: string
  className?: string
}) {
  const { t } = useT()
  const [text, setText] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const toMessage = useSendError()
  const id = React.useId()

  const send = async () => {
    const body = text.trim()
    if (!body || pending) return
    setPending(true)
    setError(null)
    try {
      await onSend(body)
      setText("")
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 -mx-4 flex flex-col gap-1.5 border-t bg-background/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] backdrop-blur",
        className
      )}
    >
      <InputGroup className="rounded-panel bg-card shadow-card">
        <InputGroupTextarea
          aria-label={label ?? placeholder}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          placeholder={placeholder}
          value={text}
          dir="auto"
          rows={1}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send()
          }}
          className="max-h-40 min-h-12 px-4 py-3 text-body"
        />
        <InputGroupAddon align="inline-end" className="pe-2">
          <InputGroupButton
            size="icon-sm"
            variant="default"
            aria-label={t("cmp.help.sendAria")}
            disabled={pending || !text.trim()}
            onClick={() => void send()}
            className="size-10 rounded-full"
          >
            <IconSend2 stroke={1.75} className="rtl:-scale-x-100" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {error && (
        <p id={`${id}-err`} role="alert" className="px-2 text-caption text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
