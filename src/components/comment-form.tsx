"use client"

import { useRef, useState, useSyncExternalStore, useTransition } from "react"
import { Loader2Icon, MicIcon, PaperclipIcon, SquareIcon, XIcon } from "lucide-react"
import { uploadFiles } from "@/components/file-upload"
import { SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useT } from "@/i18n/client"

type Recognition = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null }
type RecognitionCtor = new () => Recognition
const speech = () => (typeof window === "undefined" ? null : ((window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition ?? null))
const noop = () => () => {}

/**
 * Comment box: text, dictation (the browser's own speech recognition, where it has one: Chrome, Edge, Safari) and
 * attachments. Attachments upload at once into the record's files (`files` = where: the project), the comment keeps
 * their ids. Posts to `action` like a normal form.
 */
export function CommentForm({ action, entity, entityId, back, files }: { action: (fd: FormData) => Promise<void>; entity: string; entityId: string; back: string; files?: { orgId: string; entity: string; entityId: string } }) {
  const t = useT()
  const [text, setText] = useState("")
  const [attached, setAttached] = useState<{ id: string; name: string }[]>([])
  const [listening, setListening] = useState(false)
  const [uploading, startUpload] = useTransition()
  const rec = useRef<Recognition | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const canDictate = useSyncExternalStore(noop, () => !!speech(), () => false)

  const dictate = () => {
    if (listening) return rec.current?.stop()
    const Ctor = speech()
    if (!Ctor) return
    const r = new Ctor()
    r.lang = document.documentElement.lang || "de-DE"
    r.continuous = true
    r.interimResults = false
    r.onresult = (e) => {
      let said = ""
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) said += e.results[i][0].transcript
      if (said.trim()) setText((v) => (v && !/\s$/.test(v) ? `${v} ` : v) + said.trim())
    }
    r.onend = r.onerror = () => setListening(false)
    rec.current = r
    r.start()
    setListening(true)
  }

  const attach = (list: FileList | null) => {
    const picked = [...(list ?? [])]
    if (!picked.length || !files) return
    startUpload(async () => {
      const done = await uploadFiles(files.orgId, picked, { entity: files.entity, entityId: files.entityId }, t)
      setAttached((a) => [...a, ...done.map((f) => ({ id: f.id!, name: f.name }))].slice(0, 20))
      if (picker.current) picker.current.value = ""
    })
  }

  return (
    <form
      action={async (fd) => {
        rec.current?.stop()
        try {
          await action(fd) // redirects back with a toast
        } finally {
          setText("")
          setAttached([])
        }
      }}
      className="grid gap-2"
    >
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="entity_id" value={entityId} />
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="file_ids" value={attached.map((a) => a.id).join(",")} />
      <Textarea name="body" value={text} onChange={(e) => setText(e.target.value)} maxLength={10000} rows={3} placeholder={t(listening ? "activity.listening" : "activity.placeholder")} aria-label={t("activity.placeholder")} />
      {attached.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {attached.map((a) => (
            <li key={a.id} className="flex max-w-full items-center gap-1 rounded-md bg-muted py-0.5 pr-0.5 pl-2 text-xs">
              <span className="truncate">{a.name}</span>
              <Button type="button" variant="ghost" size="icon-xs" aria-label={t("activity.detach", { name: a.name })} onClick={() => setAttached((x) => x.filter((y) => y.id !== a.id))}>
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton size="sm" disabled={uploading || (!text.trim() && !attached.length)}>
          {t("activity.comment")}
        </SubmitButton>
        {canDictate && (
          <Tooltip>
            <TooltipTrigger render={<Button type="button" size="icon-sm" variant={listening ? "destructive" : "ghost"} onClick={dictate} aria-label={t(listening ? "activity.stopDictation" : "activity.dictate")} aria-pressed={listening} />}>
              {listening ? <SquareIcon /> : <MicIcon />}
            </TooltipTrigger>
            <TooltipContent>{t(listening ? "activity.stopDictation" : "activity.dictate")}</TooltipContent>
          </Tooltip>
        )}
        {files && (
          <>
            <input ref={picker} type="file" multiple hidden onChange={(e) => attach(e.target.files)} />
            <Tooltip>
              <TooltipTrigger render={<Button type="button" size="icon-sm" variant="ghost" disabled={uploading} onClick={() => picker.current?.click()} aria-label={t("activity.attach")} />}>
                {uploading ? <Loader2Icon className="animate-spin" /> : <PaperclipIcon />}
              </TooltipTrigger>
              <TooltipContent>{t("activity.attachHint")}</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    </form>
  )
}
