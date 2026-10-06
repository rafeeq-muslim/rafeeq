/**
 * CMP-06 «دفتر الأسئلة الخاصة» — /mentor/notebook. Questions and doubts kept
 * on this device only (R1), sent one at a time by their owner to the mentor
 * or the assistant (R2), never read by AI (R3), deleted at will (R4). One
 * reassuring line without a Sharia ruling, and «أريد إنسانًا» in reach (R5).
 */
import * as React from "react"
import { useNavigate } from "react-router"
import { IconMessageCircle, IconSparkles, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { HumanHelpButton, SpotIllustration } from "@/components/rafeeq"
import { useT } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { useMine } from "./api"
import { Confirm } from "./Confirm"
import { ago } from "./format"
import { NOTE_MAX, type Note, OfflineError, assistantHandOff, sendToMentor, useNotebook } from "./notebook"
import { ScreenBar, SectionTitle } from "./Screen"

function NoteItem({ note, canSendToMentor }: { note: Note; canSendToMentor: boolean }) {
  const { t, locale } = useT()
  const navigate = useNavigate()
  const remove = useNotebook((s) => s.remove)
  const [pending, setPending] = React.useState(false)
  const [notSent, setNotSent] = React.useState(false)

  const toMentor = async () => {
    setPending(true)
    setNotSent(false)
    try {
      await sendToMentor(note)
      toast.success(t("cmp.notebook.sentMentor"))
    } catch (e) {
      if (e instanceof OfflineError) setNotSent(true)
      else toast.error(t("common.error"))
    } finally {
      setPending(false)
    }
  }
  const toAssistant = () => {
    setNotSent(false)
    try {
      const { to, state } = assistantHandOff(note)
      navigate(to, { state })
    } catch {
      setNotSent(true)
    }
  }

  return (
    <article className="flex flex-col gap-3 rounded-card border bg-card p-4" data-slot="note">
      <p dir="auto" className="text-body whitespace-pre-wrap">
        {note.text}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
        <span className="tabular-nums">{ago(note.createdAt, locale)}</span>
        {note.sentTo && <Badge variant="secondary">{t(note.sentTo === "mentor" ? "cmp.notebook.wasSentMentor" : "cmp.notebook.wasSentAssistant")}</Badge>}
      </div>
      {notSent && (
        <p role="status" className="text-label text-warning">
          {t("cmp.notebook.notSent")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {canSendToMentor && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => void toMentor()}>
            <IconMessageCircle data-icon="inline-start" stroke={1.75} />
            {t("cmp.notebook.toMentor")}
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={pending} onClick={toAssistant}>
          <IconSparkles data-icon="inline-start" stroke={1.75} />
          {t("cmp.notebook.toAssistant")}
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(note.id)}>
          <IconTrash data-icon="inline-start" stroke={1.75} />
          {t("cmp.notebook.delete")}
        </Button>
      </div>
    </article>
  )
}

export default function Notebook() {
  const { t } = useT()
  const navigate = useNavigate()
  const notes = useNotebook((s) => s.notes)
  const introSeen = useNotebook((s) => s.introSeen)
  const { add, clear, seeIntro } = useNotebook.getState()
  const signedIn = useAuth((s) => !!s.token)
  const mine = useMine()
  const hasMentor = signedIn && !!mine.data?.mentor
  const [draft, setDraft] = React.useState("")
  const [clearing, setClearing] = React.useState(false)

  const save = () => {
    if (add(draft)) setDraft("")
  }

  return (
    <>
      <ScreenBar title={t("cmp.notebook.title")} back="/mentor" />
      <div className="flex flex-col gap-6 px-4 pt-5 pb-6">
        <section className="flex items-center gap-4">
          <SpotIllustration kind="saved" size={72} />
          <div className="flex min-w-0 flex-col items-start gap-2">
            <p className="text-body" data-slot="notebook-reassure">
              {t("cmp.notebook.reassure")}
            </p>
            <HumanHelpButton label={t("ask.human")} onClick={() => navigate("/mentor/help?from=mentor")} />
          </div>
        </section>

        {!introSeen && (
          <Alert data-slot="notebook-intro">
            <AlertTitle>{t("cmp.notebook.introTitle")}</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-2">
              <span>{t("cmp.notebook.introBody")}</span>
              <Button size="sm" variant="outline" onClick={seeIntro}>
                {t("cmp.notebook.introOk")}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Field>
          <FieldLabel htmlFor="note-text" className="text-label">
            {t("cmp.notebook.label")}
          </FieldLabel>
          <Textarea
            id="note-text"
            dir="auto"
            rows={4}
            maxLength={NOTE_MAX}
            value={draft}
            placeholder={t("cmp.notebook.placeholder")}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-28 text-body"
          />
        </Field>
        <Button size="lg" className="w-full" disabled={!draft.trim()} onClick={save}>
          {t("cmp.notebook.save")}
        </Button>

        {notes.length > 0 && (
          <section className="flex flex-col gap-3 border-t pt-5" aria-labelledby="notes-title">
            <SectionTitle id="notes-title">{t("cmp.notebook.list")}</SectionTitle>
            {!hasMentor && <p className="text-label text-muted-foreground">{t("cmp.notebook.noMentor")}</p>}
            <ul className="flex flex-col gap-3">
              {notes.map((n) => (
                <li key={n.id}>
                  <NoteItem note={n} canSendToMentor={hasMentor} />
                </li>
              ))}
            </ul>
            <Button variant="ghost" className="self-start text-destructive" onClick={() => setClearing(true)}>
              {t("cmp.notebook.clear")}
            </Button>
          </section>
        )}
      </div>
      <Confirm
        open={clearing}
        onOpenChange={setClearing}
        title={t("cmp.notebook.clear")}
        description={t("cmp.notebook.clearConfirm")}
        confirmLabel={t("cmp.notebook.clearYes")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={clear}
      />
    </>
  )
}
