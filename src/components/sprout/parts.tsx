"use client"

import Link from "next/link"
import { CheckIcon, CircleAlertIcon, ExternalLinkIcon, FileIcon, Loader2Icon, ShieldAlertIcon, XIcon } from "lucide-react"
import type { UIMessage } from "ai"
import { Markdown } from "@/components/markdown"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"

type Part = UIMessage["parts"][number]
type ToolPart = Extract<Part, { toolCallId: string }> & { state: string; input?: unknown; output?: unknown; errorText?: string; approval?: { id: string; approved?: boolean; isAutomatic?: boolean } }
type Approve = (r: { id: string; approved: boolean }) => void

// App path of an absolute app_url (records link into the App, the panel stays open).
const appHref = (url: unknown) => (typeof url === "string" ? url.replace(/^https?:\/\/[^/]+/, "").replace(/^\/app(?=\/)/, "") : null)
const rec = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
// A readable title of any record the API returns.
const titleOf = (r: Record<string, unknown>) =>
  String(r.title ?? r.name ?? ([r.first_name, r.last_name].filter(Boolean).join(" ") || r.company || r.number || r.email || r.label || r.id || "–"))
const detailOf = (r: Record<string, unknown>, t: ReturnType<typeof useT>) => {
  const d = r.due_on ?? r.starts_at ?? r.start_on ?? r.date ?? r.created_at
  const when = typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d) ? t.date(d.length === 10 ? `${d}T12:00:00` : d, { dateStyle: "medium" }) : null
  return [typeof r.status === "string" ? r.status : null, when, typeof r.email === "string" && r.title ? r.email : null].filter(Boolean).join(" · ")
}

// What the thinking orb shows while Sprout works: the last step of the answer decides.
export function orbState(last: UIMessage | undefined) {
  const step = [...(last?.role === "assistant" ? last.parts : [])].reverse().find((p) => "toolCallId" in p || p.type === "text")
  if (!step || step.type === "text") return "composing" as const
  if (step.type === "tool-roots_danger") return "solving" as const
  if (step.type === "tool-roots_write") return "working" as const
  return "searching" as const
}

/** One message: text as markdown, tool steps as compact rows (lists and records as small cards), files as chips. */
export function MessageView({ message, onApprove }: { message: UIMessage; onApprove: Approve }) {
  const user = message.role === "user"
  return (
    <div className={cn("grid gap-2 text-sm", user && "justify-items-end")}>
      {message.parts.map((part, i) => {
        if (part.type === "text")
          return user ? (
            <p key={i} className="max-w-[85%] rounded-2xl bg-muted px-3 py-2 break-words whitespace-pre-wrap">
              {part.text.replace(/\n*\[file_id:[^\]]+\]/g, "")}
            </p>
          ) : (
            <div key={i} className="min-w-0 break-words [&_table]:block [&_table]:overflow-x-auto">
              <Markdown>{part.text}</Markdown>
            </div>
          )
        if (part.type === "file") {
          const id = /^roots-file:(.+)$/.exec(part.url)?.[1]
          return (
            <a key={i} href={id ? `/files/${id}` : part.url} target="_blank" rel="noreferrer" className="inline-flex max-w-[85%] items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted">
              <FileIcon className="size-3.5 text-muted-foreground" /> <span className="truncate">{part.filename ?? "Datei"}</span>
            </a>
          )
        }
        if ("toolCallId" in part) return <ToolView key={part.toolCallId} part={part as ToolPart} onApprove={onApprove} />
        return null
      })}
    </div>
  )
}

function ToolView({ part, onApprove }: { part: ToolPart; onApprove: Approve }) {
  const t = useT()
  const name = part.type.replace(/^tool-/, "")
  const input = rec(part.input)
  const op = typeof input?.operation === "string" ? input.operation : Array.isArray(input?.calls) ? t("sprout.steps", { count: input.calls.length }) : null
  const label = `${t.dynamic(`sprout.tools.${name}`)}${op ? ` · ${op}` : ""}`

  if (part.state === "approval-requested" && !part.approval?.isAutomatic)
    return (
      <div className="grid gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
        <p className="flex items-center gap-2 font-medium">
          <ShieldAlertIcon className="size-4 text-destructive" /> {t("sprout.approveTitle")}
        </p>
        <p className="font-mono text-xs break-all">{op}</p>
        {rec(input?.arguments) && (
          <ul className="grid gap-0.5 text-xs text-muted-foreground">
            {Object.entries(rec(input?.arguments)!).map(([k, v]) => (
              <li key={k} className="break-all">
                {k}: {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="destructive" onClick={() => onApprove({ id: part.approval!.id, approved: true })}>
            {t("sprout.approve")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => onApprove({ id: part.approval!.id, approved: false })}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    )

  const running = part.state === "input-streaming" || part.state === "input-available" || part.state === "approval-responded"
  const failed = part.state === "output-error" || (rec(part.output)?.error !== undefined && part.state === "output-available")
  const denied = part.state === "output-denied"
  return (
    <div className="grid gap-1.5">
      <p className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", failed && "text-destructive")}>
        {running ? <Loader2Icon className="size-3.5 animate-spin" /> : failed ? <CircleAlertIcon className="size-3.5" /> : denied ? <XIcon className="size-3.5" /> : <CheckIcon className="size-3.5" />}
        <span className="truncate">{denied ? `${label} · ${t("sprout.denied")}` : label}</span>
      </p>
      {part.state === "output-available" && !failed && <ResultView output={part.output} />}
    </div>
  )
}

/** Generative UI for operation results: a list of records, or the record that was created / changed. */
function ResultView({ output }: { output: unknown }) {
  const t = useT()
  const o = rec(output)
  if (!o) return null
  const list = Array.isArray(o.data) ? (o.data as unknown[]).map(rec).filter((x) => x !== null) : null
  if (list && list.length)
    return (
      <ul className="divide-y rounded-lg border text-sm">
        {list.slice(0, 6).map((r, i) => (
          <li key={String(r.id ?? i)} className="flex items-center gap-2 px-3 py-1.5">
            <span className="min-w-0 flex-1 truncate">{titleOf(r)}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{detailOf(r, t)}</span>
          </li>
        ))}
        {list.length > 6 && <li className="px-3 py-1.5 text-xs text-muted-foreground">{t("sprout.more", { count: list.length - 6 })}</li>}
      </ul>
    )
  const href = appHref(o.app_url)
  if (!href) return null
  return (
    <Link href={href} className="flex items-center gap-3 rounded-lg border px-3 py-2 hover:bg-muted">
      {typeof o.image_url === "string" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={o.image_url} alt="" className="size-10 rounded-md object-cover" />
      )}
      <span className="grid min-w-0 flex-1">
        <span className="truncate font-medium">{titleOf(o)}</span>
        {detailOf(o, t) && <span className="truncate text-xs text-muted-foreground">{detailOf(o, t)}</span>}
      </span>
      <ExternalLinkIcon className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  )
}
