/**
 * PLT-11 R5: before the whole-surah recitation (one file per surah, e.g.
 * Al-Baqarah 207 MB) plays, every time, the learner sees its size and
 * chooses: listen, download it from the download center (PLT-12), or listen
 * verse by verse with an approved reciter. Nothing loads before the choice.
 */
import { useNavigate } from "react-router"

import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { num, useT } from "@/app/i18n"
import { suraName } from "@/app/lesson/suras"

/** PLT-12's download center (router path; the /app basename is added by the router). */
export const DOWNLOADS_PATH = "/downloads"

export function SurahSizeAsk({
  open,
  onOpenChange,
  sura,
  megabytes,
  perVerseName,
  onListen,
  onPerVerse,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sura: number
  megabytes: number | null
  /** An approved per-verse reciter to switch to, if there is one. */
  perVerseName: string | null
  onListen: () => void
  onPerVerse: () => void
}) {
  const { t, locale } = useT()
  const navigate = useNavigate()
  const size = megabytes == null ? t("plt11.size.unknown") : t("plt11.mb", { n: num(megabytes) })
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-start">{t("plt11.size.title", { size })}</AlertDialogTitle>
          <AlertDialogDescription className="text-start text-body">{t("plt11.size.body", { sura: suraName(sura, locale) })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-col sm:justify-start">
          {perVerseName && (
            <AlertDialogAction onClick={onPerVerse}>
              <bdi>{t("plt11.size.perVerse", { name: perVerseName })}</bdi>
            </AlertDialogAction>
          )}
          <AlertDialogAction variant={perVerseName ? "secondary" : "default"} onClick={onListen}>
            {t("plt11.size.listen", { size })}
          </AlertDialogAction>
          <Button variant="secondary" onClick={() => navigate(DOWNLOADS_PATH)}>
            {t("plt11.size.download")}
          </Button>
          <AlertDialogCancel>{t("plt11.size.cancel")}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
