import {
  IconAlertTriangle,
  IconClock,
  IconHeadset,
  IconLanguage,
  IconLifebuoy,
} from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"

/*
 * Companion & Community (CMP). A human is always one tap away (cmp-01).
 * Danger cases go to a person immediately; we never invent helpline
 * numbers: the panel points to local emergency services generically until
 * verified numbers per country exist in the sources log.
 */

/** «أريد إنسانًا»: always visible on Ask and lesson screens. */
function HumanHelpButton({
  label = "أريد إنسانًا",
  onClick,
  className,
}: {
  label?: string
  onClick?: () => void
  className?: string
}) {
  return (
    <Button
      data-slot="human-help-button"
      variant="outline"
      size="sm"
      onClick={onClick}
      className={className}
    >
      <IconHeadset data-icon="inline-start" stroke={1.75} />
      {label}
    </Button>
  )
}

/**
 * Shown the moment the assistant detects harm, eviction or risk to life
 * (KNW → CMP «حالة خطر»). Human first; no AI answer is shown with it.
 */
function DangerHelpPanel({
  title = "لست وحدك، وسنوصلك بإنسان الآن",
  description = "إن كنت في خطر مباشر فاتصل بالطوارئ في بلدك. وإن استطعت الانتظار دقائق فسيتواصل معك أحد فريقنا بلغتك.",
  primaryLabel = "تحدث مع إنسان الآن",
  secondaryLabel = "أرقام الطوارئ في بلدي",
  onPrimary,
  onSecondary,
  className,
}: {
  title?: string
  description?: string
  primaryLabel?: string
  secondaryLabel?: string
  onPrimary?: () => void
  onSecondary?: () => void
  className?: string
}) {
  return (
    <div data-slot="danger-help-panel" role="alert" className={cn("flex flex-col gap-3", className)}>
      <Alert variant="destructive">
        <IconLifebuoy stroke={1.75} />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
      </Alert>
      <Button size="lg" className="w-full" onClick={onPrimary}>
        <IconHeadset data-icon="inline-start" stroke={1.75} />
        {primaryLabel}
      </Button>
      <Button size="lg" variant="outline" className="w-full" onClick={onSecondary}>
        <IconAlertTriangle data-icon="inline-start" stroke={1.75} />
        {secondaryLabel}
      </Button>
    </div>
  )
}

type RequestStatus = "new" | "waiting" | "answered" | "urgent"

const STATUS: Record<RequestStatus, { label: string; variant: "info" | "warning" | "success" | "destructive" }> = {
  new: { label: "جديد", variant: "info" },
  waiting: { label: "بانتظار ردك", variant: "warning" },
  answered: { label: "تم الرد", variant: "success" },
  urgent: { label: "عاجل", variant: "destructive" },
}

/** A request in the mentor inbox (CMP-02). Shows only what the user allowed. */
function HelpRequestItem({
  displayName,
  language,
  preview,
  waited,
  status,
  onOpen,
  className,
}: {
  displayName: string
  language: string
  preview: string
  /** e.g. «منذ 20 دقيقة» */
  waited: string
  status: RequestStatus
  onOpen?: () => void
  className?: string
}) {
  const s = STATUS[status]
  return (
    <Item
      data-slot="help-request-item"
      data-status={status}
      variant="outline"
      className={cn("bg-card", status === "urgent" && "border-destructive/40", className)}
    >
      <ItemMedia>
        <Avatar size="lg">
          <AvatarFallback>{displayName.slice(0, 1)}</AvatarFallback>
        </Avatar>
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="text-body">
          <bdi>{displayName}</bdi>
          <Badge variant={s.variant}>{s.label}</Badge>
        </ItemTitle>
        <ItemDescription className="text-label" dir="auto">
          {preview}
        </ItemDescription>
        <div className="flex flex-wrap items-center gap-3 text-caption text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <IconLanguage className="size-3.5" stroke={1.75} aria-hidden="true" />
            {language}
          </span>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <IconClock className="size-3.5" stroke={1.75} aria-hidden="true" />
            {waited}
          </span>
        </div>
      </ItemContent>
      <ItemActions>
        <Button size="sm" variant={status === "urgent" ? "default" : "outline"} onClick={onOpen}>
          افتح
        </Button>
      </ItemActions>
    </Item>
  )
}

/** A suggested mentor (CMP-03): matched by language and gender. */
function MentorCard({
  name,
  languages,
  note,
  onChoose,
  className,
}: {
  name: string
  languages: string[]
  note?: string
  onChoose?: () => void
  className?: string
}) {
  return (
    <Item data-slot="mentor-card" variant="outline" className={cn("bg-card", className)}>
      <ItemMedia>
        <Avatar size="lg">
          <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
        </Avatar>
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="text-body">{name}</ItemTitle>
        <div className="flex flex-wrap gap-1.5">
          {languages.map((l) => (
            <Badge key={l} variant="secondary">
              {l}
            </Badge>
          ))}
        </div>
        {note && <ItemDescription className="text-label">{note}</ItemDescription>}
      </ItemContent>
      <ItemActions>
        <Button size="sm" onClick={onChoose}>
          اختره
        </Button>
      </ItemActions>
    </Item>
  )
}

export { HumanHelpButton, DangerHelpPanel, HelpRequestItem, MentorCard }
export type { RequestStatus }
