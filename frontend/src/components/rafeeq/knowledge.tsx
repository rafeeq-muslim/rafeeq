import * as React from "react"
import {
  IconBook2,
  IconMicrophone,
  IconSend2,
  IconSparkles,
  IconUserHeart,
} from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
import {
  Message,
  MessageContent,
  MessageFooter,
} from "@/components/ui/message"

/*
 * Knowledge & Ask (KNW). Rules that shape these components:
 * - Every Sharia answer ends with at least one SourceStrip (knw-01).
 * - Quran and hadith text comes from the database, never generated.
 * - The assistant never issues a fatwa; personal questions go to a human.
 * - The AI is always disclosed.
 */

/** «المصدر: …» — the amber strip that closes every Sharia answer. */
function SourceStrip({
  children,
  href,
  label = "المصدر",
  className,
}: {
  /** e.g. «سورة المائدة، الآية 6» */
  children: React.ReactNode
  href?: string
  /** Localised «المصدر» (Source / Sanggunian). */
  label?: string
  className?: string
}) {
  const body = (
    <>
      <IconBook2 className="size-4 shrink-0" stroke={1.75} aria-hidden="true" />
      <span className="min-w-0">
        <span className="font-bold">{label}: </span>
        {children}
      </span>
    </>
  )
  const classes = cn(
    "flex w-full items-start gap-2 rounded-md border-s-4 border-celebrate bg-celebrate-surface px-3 py-2 text-start text-label text-celebrate-surface-foreground",
    href && "transition-colors hover:bg-celebrate/25",
    className
  )
  return href ? (
    <a data-slot="source-strip" href={href} target="_blank" rel="noopener noreferrer" className={classes}>
      {body}
    </a>
  ) : (
    <div data-slot="source-strip" className={classes}>
      {body}
    </div>
  )
}

/** Persistent AI disclosure shown at the top of every Ask thread. */
function AiDisclosure({
  children = "إجابات رفيق يولّدها الذكاء الاصطناعي من مصادر معتمدة فقط، وقد يخطئ. المسائل الشخصية يجيب عنها مرشد.",
  className,
}: {
  children?: React.ReactNode
  className?: string
}) {
  return (
    <Marker data-slot="ai-disclosure" className={cn("text-caption", className)}>
      <MarkerIcon>
        <IconSparkles stroke={1.75} />
      </MarkerIcon>
      <MarkerContent>{children}</MarkerContent>
    </Marker>
  )
}

/** The user's question: violet bubble on the end side. */
function UserMessage({
  children,
  time,
}: {
  children: React.ReactNode
  time?: string
}) {
  return (
    <Message align="end" data-slot="user-message">
      <MessageContent>
        <Bubble variant="default" align="end">
          <BubbleContent dir="auto">{children}</BubbleContent>
        </Bubble>
        {time && <MessageFooter className="tabular-nums">{time}</MessageFooter>}
      </MessageContent>
    </Message>
  )
}

/**
 * Rafeeq's answer: white card bubble, the answer body, then the source
 * strip(s). `sources` is required: an answer without a source is not shown
 * as an answer (use ReferralCard instead).
 */
function AssistantMessage({
  children,
  sources,
  sourceLinks,
  sourceLabel,
  footer,
}: {
  children: React.ReactNode
  sources: React.ReactNode[]
  /** Origin URL for each source, same order as `sources`. */
  sourceLinks?: (string | undefined)[]
  sourceLabel?: string
  footer?: React.ReactNode
}) {
  return (
    <Message align="start" data-slot="assistant-message">
      <MessageContent>
        <Bubble variant="outline" align="start" className="max-w-[92%]">
          <BubbleContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">{children}</div>
            <div className="flex flex-col gap-1.5">
              {sources.map((s, i) => (
                <SourceStrip key={i} href={sourceLinks?.[i]} label={sourceLabel}>
                  {s}
                </SourceStrip>
              ))}
            </div>
          </BubbleContent>
        </Bubble>
        {footer && <MessageFooter>{footer}</MessageFooter>}
      </MessageContent>
    </Message>
  )
}

/**
 * «تحدث مع مرشدك»: shown when a question is personal, has no approved
 * source, or the user asks for a person. Emits the KNW → CMP referral event.
 */
function ReferralCard({
  title = "تحدث مع مرشدك",
  description = "هذا سؤال يحتاج إلى من يعرف حالك. مرشدك يرد عليك بلغتك، ورسالتك لا يراها غيره.",
  actionLabel = "أرسل السؤال إلى مرشدك",
  question,
  onRefer,
  className,
}: {
  title?: string
  description?: string
  actionLabel?: string
  /** CMP-01 R1: «تحتاج إنسانًا؟», asked right above the one-tap action. */
  question?: string
  onRefer?: () => void
  className?: string
}) {
  return (
    <Card data-slot="referral-card" size="sm" className={cn("border-primary/20 bg-secondary/60", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconUserHeart className="size-5 text-primary" stroke={1.75} aria-hidden="true" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardFooter className="flex-col items-stretch">
        {question && (
          <p data-slot="referral-question" className="text-label font-medium text-foreground">
            {question}
          </p>
        )}
        <Button className="w-full" onClick={onRefer}>
          {actionLabel}
        </Button>
      </CardFooter>
    </Card>
  )
}

/**
 * «اسأل رفيق بلغتك…»: the question composer. Enter sends (Shift+Enter adds a
 * line). The microphone shows only when `onVoice` is given (voice questions
 * are out of scope for KNW-01 today).
 */
function AskComposer({
  placeholder = "اسأل رفيق بلغتك…",
  value,
  onChange,
  onSend,
  onVoice,
  disabled,
  labels,
  className,
}: {
  placeholder?: string
  value?: string
  onChange?: (value: string) => void
  onSend?: () => void
  onVoice?: () => void
  disabled?: boolean
  /** Localised accessible names. */
  labels?: { input?: string; voice?: string; send?: string }
  className?: string
}) {
  return (
    <InputGroup data-slot="ask-composer" className={cn("rounded-panel shadow-card", className)}>
      <InputGroupTextarea
        aria-label={labels?.input ?? "سؤالك"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            if (!disabled) onSend?.()
          }
        }}
        rows={1}
        dir="auto"
        className="max-h-40 min-h-12 px-4 py-3 text-body"
      />
      <InputGroupAddon align="inline-end" className="gap-1 pe-2">
        {onVoice && (
          <InputGroupButton size="icon-sm" aria-label={labels?.voice ?? "اسأل بصوتك"} onClick={onVoice}>
            <IconMicrophone stroke={1.75} />
          </InputGroupButton>
        )}
        <InputGroupButton
          size="icon-sm"
          variant="default"
          aria-label={labels?.send ?? "أرسل"}
          onClick={onSend}
          disabled={disabled}
          className="rounded-full"
        >
          <IconSend2 stroke={1.75} className="rtl:-scale-x-100" />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

export {
  SourceStrip,
  AiDisclosure,
  UserMessage,
  AssistantMessage,
  ReferralCard,
  AskComposer,
}
