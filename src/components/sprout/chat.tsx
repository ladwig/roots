"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, type FileUIPart, type UIMessage } from "ai"
import { ArrowUpIcon, ChevronDownIcon, FileIcon, Loader2Icon, MicIcon, PaperclipIcon, SquareIcon, XIcon } from "lucide-react"
import type { Provider } from "@/assistant/providers"
import { uploadFiles } from "@/components/file-upload"
import { ProviderLogo } from "@/components/provider-logo"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"
import { ThinkingOrb } from "thinking-orbs"
import { MessageView, orbState } from "./parts"

export type Model = { provider: Provider; id: string; name: string }
type Attachment = { id: string; name: string; mime: string }

// Browser speech recognition (Chrome, Edge, Safari); not in Firefox, then the mic button is hidden.
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: (e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void; onend: () => void }
const speech = () => (typeof window === "undefined" ? undefined : ((window as unknown as Record<string, unknown>).SpeechRecognition ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition)) as (new () => Recognition) | undefined

/** One conversation (keyed by chat id): messages, tool steps, approvals, and the input with model, mic and files. */
export function ChatView({
  chatId,
  initial,
  models,
  model,
  setModel,
  orgId,
  orgName,
  onSent,
}: {
  chatId: string
  initial: UIMessage[]
  models: Model[]
  model: string
  setModel: (m: string) => void
  orgId: string
  orgName: string
  onSent: () => void
}) {
  const t = useT()
  const pathname = usePathname()
  const [page, setPage] = useState<{ path: string; title: string } | null>(null)
  // The page the person is on goes along as context ("hier", "dieses Event"); they can remove the chip.
  useEffect(() => {
    const id = setTimeout(() => setPage({ path: pathname.replace(/^\/app(?=\/|$)/, "") || "/", title: document.title.replace(/\s+[–-]\s+roots$/, "") }), 300)
    return () => clearTimeout(id)
  }, [pathname])

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/assistant",
        // Only the new message goes up; model and page come with each send (approval follow-ups use the chat's model).
        prepareSendMessagesRequest: ({ id, messages, body }) => ({ body: { ...body, id, message: messages.at(-1) } }),
      }),
    [],
  )
  const { messages, sendMessage, status, stop, error, addToolApprovalResponse, clearError, regenerate } = useChat({
    id: chatId,
    messages: initial,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: onSent,
  })
  const busy = status === "submitted" || status === "streaming"

  const end = useRef<HTMLDivElement>(null)
  // Braces matter: scrollIntoView returns a Promise in current browsers, which React must not get as "cleanup".
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" })
  }, [messages])

  const [text, setText] = useState("")
  const [files, setFiles] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const send = (value = text) => {
    const body = value.trim()
    if ((!body && !files.length) || busy || !model) return
    clearError()
    // Files are stored in roots (folder "Sprout") first, so Sprout can attach them to records later.
    const parts: FileUIPart[] = files.map((f) => ({ type: "file", mediaType: f.mime || "application/octet-stream", filename: f.name, url: `roots-file:${f.id}` }))
    const ids = files.map((f) => `[file_id: ${f.id} · ${f.name}]`).join("\n")
    sendMessage({ text: [body || t("sprout.seeFiles"), ids].filter(Boolean).join("\n\n"), files: parts }, { body: { model, page: page ?? undefined } })
    setText("")
    setFiles([])
  }
  const attach = async (list: FileList | null) => {
    if (!list?.length) return
    setUploading(true)
    const done = await uploadFiles(orgId, [...list], { folder: "Sprout" }, t)
    setFiles((f) => [...f, ...done.map((d) => ({ id: d.id!, name: d.name, mime: d.mime }))])
    setUploading(false)
    if (fileInput.current) fileInput.current.value = ""
  }

  const [listening, setListening] = useState(false)
  const rec = useRef<Recognition | null>(null)
  const [canSpeak] = useState(() => !!speech()) // the chat only renders in the browser
  const dictate = () => {
    if (listening) return rec.current?.stop()
    const SR = speech()
    if (!SR) return
    const r = new SR()
    r.lang = t.locale === "en" ? "en-US" : "de-DE"
    r.interimResults = true
    r.continuous = true
    const before = text ? `${text} ` : ""
    r.onresult = (e) => setText(before + Array.from(e.results).map((x) => x[0].transcript).join(""))
    r.onend = () => setListening(false)
    rec.current = r
    r.start()
    setListening(true)
  }

  const current = models.find((m) => `${m.provider}:${m.id}` === model)
  const errorText = error ? (/^\{/.test(error.message) ? (JSON.parse(error.message) as { error?: string }).error : error.message) : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="grid gap-3 pt-6">
            <ThinkingOrb state="breathing" size={64} aria-label={t("sprout.name")} />
            <p className="text-sm text-muted-foreground">{t("sprout.hello", { org: orgName })}</p>
            <div className="flex flex-wrap gap-2">
              {(["today", "overdue", "event"] as const).map((k) => (
                <Button key={k} size="sm" variant="outline" disabled={!model} onClick={() => send(t.dynamic(`sprout.ideas.${k}`))}>
                  {t.dynamic(`sprout.ideas.${k}`)}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-5">
            {messages.map((m) => (
              <MessageView key={m.id} message={m} onApprove={addToolApprovalResponse} />
            ))}
            {busy && <ThinkingOrb state={orbState(messages.at(-1))} size={20} />}
          </div>
        )}
        {errorText && (
          <div className="mt-4 grid gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <p>{errorText}</p>
            <Button size="sm" variant="outline" className="justify-self-start" onClick={() => (clearError(), regenerate({ body: { model, page: page ?? undefined } }))}>
              {t("sprout.retry")}
            </Button>
          </div>
        )}
        <div ref={end} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
        className="m-3 grid gap-2 rounded-xl border bg-background p-2 focus-within:ring-2 focus-within:ring-ring/50"
      >
        {(page || files.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {page && page.path !== "/" && (
              <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                <span className="truncate">{page.title || page.path}</span>
                <button type="button" onClick={() => setPage(null)} aria-label={t("sprout.removeContext")} className="rounded-sm hover:text-foreground">
                  <XIcon className="size-3" />
                </button>
              </span>
            )}
            {files.map((f) => (
              <span key={f.id} className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-xs">
                <FileIcon className="size-3" /> <span className="truncate">{f.name}</span>
                <button type="button" onClick={() => setFiles((l) => l.filter((x) => x.id !== f.id))} aria-label={t("sprout.removeFile")}>
                  <XIcon className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
          rows={2}
          placeholder={t("sprout.placeholder")}
          aria-label={t("sprout.placeholder")}
          className="max-h-48 min-h-10 w-full resize-none bg-transparent px-1 text-sm outline-none field-sizing-content"
        />
        <div className="flex items-center gap-1">
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => attach(e.target.files)} />
          <Tooltip>
            <TooltipTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t("sprout.attach")} disabled={uploading} onClick={() => fileInput.current?.click()} />}>
              {uploading ? <Loader2Icon className="animate-spin" /> : <PaperclipIcon />}
            </TooltipTrigger>
            <TooltipContent>{t("sprout.attach")}</TooltipContent>
          </Tooltip>
          {canSpeak && (
            <Tooltip>
              <TooltipTrigger render={<Button type="button" variant={listening ? "secondary" : "ghost"} size="icon-sm" aria-label={t("sprout.dictate")} aria-pressed={listening} onClick={dictate} />}>
                {listening ? <ThinkingOrb state="listening" size={20} /> : <MicIcon />}
              </TooltipTrigger>
              <TooltipContent>{t("sprout.dictate")}</TooltipContent>
            </Tooltip>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" className="min-w-0 text-muted-foreground" />}>
              {current && <ProviderLogo provider={current.provider} className="size-3.5" />}
              <span className="truncate">{current?.name ?? t("sprout.pickModel")}</span>
              <ChevronDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
              {[...new Set(models.map((m) => m.provider))].map((p) => (
                <DropdownMenuGroup key={p}>
                  <DropdownMenuLabel className="flex items-center gap-1.5">
                    <ProviderLogo provider={p} className="size-3.5" /> {t.dynamic(`sprout.providers.${p}`)}
                  </DropdownMenuLabel>
                  {models
                    .filter((m) => m.provider === p)
                    .map((m) => (
                      <DropdownMenuItem key={m.id} onClick={() => setModel(`${m.provider}:${m.id}`)} className={cn(`${m.provider}:${m.id}` === model && "font-medium")}>
                        {m.name}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {busy ? (
            <Button type="button" size="icon-sm" variant="secondary" className="ml-auto" onClick={stop} aria-label={t("sprout.stop")}>
              <SquareIcon />
            </Button>
          ) : (
            <Button type="submit" size="icon-sm" className="ml-auto" disabled={(!text.trim() && !files.length) || !model} aria-label={t("sprout.send")}>
              <ArrowUpIcon />
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
