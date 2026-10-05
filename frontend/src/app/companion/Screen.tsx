/** Screen chrome shared by Companion pages: a sticky top bar with a mirrored
 * back arrow, and a quiet section heading (fewer boxes, more rhythm). */
import type * as React from "react"
import { useNavigate } from "react-router"
import { IconArrowLeft } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { TopBar } from "@/components/rafeeq"
import { useT } from "@/app/i18n"

export function ScreenBar({ title, back, end }: { title: React.ReactNode; back?: string | number; end?: React.ReactNode }) {
  const { t } = useT()
  const navigate = useNavigate()
  return (
    <TopBar
      className="sticky top-0"
      start={
        back !== undefined && (
          <Button
            variant="ghost"
            size="icon"
            className="-ms-2"
            aria-label={t("common.back")}
            onClick={() => (typeof back === "number" ? navigate(back) : navigate(back))}
          >
            <IconArrowLeft className="rtl:rotate-180" />
          </Button>
        )
      }
      title={<span className="font-heading text-h3">{title}</span>}
      end={end}
    />
  )
}

export function SectionTitle({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <h2 id={id} className={cn("font-heading text-h3 font-bold", className)}>
      {children}
    </h2>
  )
}
