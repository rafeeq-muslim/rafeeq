import * as React from "react"
import { IconCheck, IconCode, IconCopy } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PetalList, PetalListItem } from "@/components/rafeeq"

/** A titled block in the gallery. */
function Section({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-28 flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="font-heading text-h2 font-bold">
          {title}
        </h2>
        {description && <p className="max-w-3xl text-body text-muted-foreground">{description}</p>}
      </header>
      {children}
    </section>
  )
}

/**
 * One component on the page: what it is, its rules, a live preview and the
 * code to copy. Mirrors the component-doc template in docs/design-system.md.
 */
function Demo({
  name,
  domain,
  description,
  rules,
  code,
  children,
  stack = false,
  previewClassName,
}: {
  /** Code name, e.g. "SourceStrip" */
  name: string
  /** Feature or domain ID, e.g. "KNW-01" */
  domain?: string
  description: React.ReactNode
  rules?: React.ReactNode[]
  code?: string
  children: React.ReactNode
  /** Stack the preview vertically (full-width components). */
  stack?: boolean
  previewClassName?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  return (
    <article
      data-slot="demo"
      className="flex flex-col overflow-hidden rounded-card border bg-card shadow-card"
    >
      <div className="flex flex-col gap-2 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-h3 font-bold" dir="ltr">
            {name}
          </h3>
          {domain && <Badge variant="secondary">{domain}</Badge>}
        </div>
        <p className="text-body text-muted-foreground">{description}</p>
        {rules && rules.length > 0 && (
          <PetalList className="mt-1">
            {rules.map((r, i) => (
              <PetalListItem key={i} tone={i % 2 ? "amber" : "violet"} className="text-label">
                {r}
              </PetalListItem>
            ))}
          </PetalList>
        )}
      </div>
      <div
        className={cn(
          "border-t bg-background p-5",
          stack ? "flex flex-col gap-4" : "flex flex-wrap items-center gap-4",
          previewClassName
        )}
      >
        {children}
      </div>
      {code && (
        <div className="border-t">
          <div className="flex items-center gap-2 px-3 py-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              <IconCode data-icon="inline-start" />
              {open ? "أخفِ الكود" : "اعرض الكود"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ms-auto"
              onClick={() => {
                navigator.clipboard?.writeText(code.trim())
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? <IconCheck data-icon="inline-start" /> : <IconCopy data-icon="inline-start" />}
              {copied ? "نُسخ" : "انسخ"}
            </Button>
          </div>
          {open && (
            <pre
              dir="ltr"
              className="overflow-x-auto bg-ink px-5 py-4 text-start font-mono text-caption leading-relaxed text-mist"
            >
              <code>{code.trim()}</code>
            </pre>
          )}
        </div>
      )}
    </article>
  )
}

/** A phone-sized frame for composed screens. */
function Phone({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <figure className="flex w-full max-w-[390px] flex-col gap-2">
      <div
        className={cn(
          "relative flex h-[780px] flex-col overflow-hidden rounded-[36px] border-8 border-ink bg-background shadow-raised dark:border-white/15",
          className
        )}
      >
        {children}
      </div>
      <figcaption className="text-center text-label font-medium text-muted-foreground">{label}</figcaption>
    </figure>
  )
}

export { Section, Demo, Phone }
