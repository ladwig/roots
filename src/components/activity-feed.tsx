import Link from "next/link"
import { CheckSquareIcon, PaperclipIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { CommentForm } from "@/components/comment-form"
import { SubmitButton } from "@/components/submit-button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { T } from "@/i18n/translate"
import type { getContext } from "@/lib/context"
import { formatMoney } from "@/lib/inputs"
import { cn } from "@/lib/utils"

type Ctx = Awaited<ReturnType<typeof getContext>>
type Change = { table_name?: string; row_id?: string; at: string; actor_id: string | null; action: string; old: unknown; new: unknown; via: string | null }
type Comment = { id: string; body: string; created_at: string; updated_at: string; created_by: string | null; file_ids: string[]; entity: string; entity_id: string }
type Diff = { label: string; from: string; to: string }
type Entry = { key: string; at: string; by: string | null; task: { id: string; title: string } | null; comment: Comment | null; diff: Diff[] | null; event: "created" | "trashed" | null; via: string | null }
type Fields = { fields: Record<string, string>; show?: Record<string, (v: unknown) => string>; defs?: { key: string; label: string; type?: string }[] }

/**
 * Comments + change history of one record, newest first (the `comments` table + the audit log). A project's feed
 * also shows its tasks: their changes and comments, each marked with the task (`tasks`: how to label task fields,
 * link to a task). `fields` = the columns people know, with their labels; custom fields show by their label.
 * Everyone who sees the record may comment (text, dictation, attachments into `upload`); only the author edits or
 * removes a comment. Forms post to the given actions with `back`.
 */
export async function ActivityFeed({
  ctx,
  t,
  entity,
  entityId,
  back,
  fields,
  defs = [],
  show = {},
  tasks,
  upload,
  actions,
}: {
  ctx: Ctx
  t: T
  entity: "projects" | "tasks"
  entityId: string
  back: string
  fields: Record<string, string>
  defs?: { key: string; label: string; type?: string }[]
  show?: Record<string, (v: unknown) => string> // column → how to show a value (ids → names)
  tasks?: Fields & { href: (id: string) => string }
  upload?: { entity: string; entityId: string } | null // where attachments go (the project's files); null = no attachments
  actions: { add: (fd: FormData) => Promise<void>; edit: (fd: FormData) => Promise<void>; remove: (fd: FormData) => Promise<void> }
}) {
  const withTasks = entity === "projects" && !!tasks
  const COLS = "id, body, created_at, updated_at, created_by, file_ids, entity, entity_id"
  const [{ data: own }, { data: changes }, { data: taskRows }] = await Promise.all([
    ctx.supabase.from("comments").select(COLS).eq("org_id", ctx.org.id).eq("entity", entity).eq("entity_id", entityId).order("created_at", { ascending: false }).limit(200),
    withTasks ? ctx.supabase.rpc("project_changes", { p_id: entityId }) : ctx.supabase.rpc("record_changes", { p_table: entity, p_id: entityId }),
    withTasks ? ctx.supabase.from("tasks").select("id, title").eq("org_id", ctx.org.id).eq("project_id", entityId).limit(1000) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ])
  const taskIds = (taskRows ?? []).map((x) => x.id)
  const { data: taskComments } = taskIds.length
    ? await ctx.supabase.from("comments").select(COLS).eq("org_id", ctx.org.id).eq("entity", "tasks").in("entity_id", taskIds).order("created_at", { ascending: false }).limit(200)
    : { data: [] as Comment[] }
  const comments = [...(own ?? []), ...(taskComments ?? [])] as Comment[]
  const log = (changes ?? []) as Change[]
  const people = [...new Set([...comments.map((c) => c.created_by), ...log.map((c) => c.actor_id)].filter((v): v is string => !!v))]
  const fileIds = [...new Set(comments.flatMap((c) => c.file_ids))]
  const [{ data: profiles }, { data: files }] = await Promise.all([
    people.length ? ctx.supabase.from("profiles").select("id, full_name, email").in("id", people) : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
    fileIds.length ? ctx.supabase.from("files").select("id, name, mime").eq("org_id", ctx.org.id).in("id", fileIds) : Promise.resolve({ data: [] as { id: string; name: string; mime: string }[] }),
  ])
  const who = (id: string | null) => {
    const p = profiles?.find((x) => x.id === id)
    return p?.full_name || p?.email || t("activity.someone")
  }
  const fmt = (v: unknown, key?: string, f: Fields = { fields, show, defs }, type?: string): string => {
    if (key && f.show?.[key]) return f.show[key](v)
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return "–"
    if (type === "money" && typeof v === "number") return `${formatMoney(Math.round(v * 100))} €`
    if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? "…" : String(x))).join(", ")
    if (typeof v === "boolean") return v ? "✓" : "✗"
    if (typeof v === "object") return "…"
    const s = String(v)
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return t.date(s, { dateStyle: "medium" })
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return t.date(`${s}T12:00:00`, { dateStyle: "medium" })
    const plain = s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    return plain.length > 80 ? `${plain.slice(0, 80)}…` : plain
  }
  const diff = (o: unknown, n: unknown, f: Fields) => {
    const a = (o ?? {}) as Record<string, unknown>
    const b = (n ?? {}) as Record<string, unknown>
    const out: Diff[] = []
    for (const [key, label] of Object.entries(f.fields))
      if (key in a || key in b) {
        const from = fmt(a[key], key, f)
        const to = fmt(b[key], key, f)
        if (from !== to) out.push({ label, from, to })
      }
    const ac = (a.custom ?? {}) as Record<string, unknown>
    const bc = (b.custom ?? {}) as Record<string, unknown>
    for (const key of new Set([...Object.keys(ac), ...Object.keys(bc)])) {
      const def = f.defs?.find((d) => d.key === key)
      const from = fmt(ac[key], undefined, f, def?.type)
      const to = fmt(bc[key], undefined, f, def?.type)
      if (from !== to) out.push({ label: def?.label ?? key, from, to })
    }
    return out
  }
  const titleOf = (c: Change) => String(((c.new ?? c.old) as { title?: string } | null)?.title ?? "")
  const taskOf = (id: string) => ({ id, title: taskRows?.find((x) => x.id === id)?.title ?? "…" })
  const feed: Entry[] = [
    ...comments.map((c): Entry => ({ key: c.id, at: c.created_at, by: c.created_by, task: c.entity === "tasks" && withTasks ? taskOf(c.entity_id) : null, comment: c, diff: null, event: null, via: null })),
    ...log.flatMap((c, i): Entry[] => {
      const isTask = withTasks && c.table_name === "tasks"
      const task = isTask ? { id: c.row_id!, title: titleOf(c) } : null
      const base = { key: `c${i}`, at: c.at, by: c.actor_id, task, comment: null, via: c.via }
      if (c.action === "insert") return [{ ...base, diff: null, event: "created" }]
      if (c.action !== "update") return []
      const o = (c.old ?? {}) as { deleted_at?: string | null }
      const nw = (c.new ?? {}) as { deleted_at?: string | null }
      if (nw.deleted_at && !o.deleted_at) return [{ ...base, diff: null, event: "trashed" }]
      const d = diff(c.old, c.new, isTask ? tasks! : { fields, show, defs })
      return d.length ? [{ ...base, diff: d, event: null }] : []
    }),
  ].sort((a, b) => b.at.localeCompare(a.at))
  const fileOf = (id: string) => files?.find((f) => f.id === id)
  const uploadTo = upload && ctx.can("org.files.manage") ? { orgId: ctx.org.id, ...upload } : undefined

  return (
    <div className="grid gap-5">
      <CommentForm action={actions.add} entity={entity} entityId={entityId} back={back} files={uploadTo} />
      {feed.length > 0 && (
        <ol className="grid gap-4 border-l pl-4">
          {feed.map((e) => (
            <li key={e.key} className="relative grid gap-1 text-sm">
              <span className={e.comment ? "absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-primary" : "absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-border"} aria-hidden />
              <span className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{who(e.by)}</span>
                <span>· {t.date(e.at, { dateStyle: "medium", timeStyle: "short" })}</span>
                {e.via && <span>· {e.via.startsWith("oauth:") ? t("activity.viaAi") : t("activity.viaApi")}</span>}
                {e.comment && e.comment.updated_at > e.comment.created_at && Date.parse(e.comment.updated_at) - Date.parse(e.comment.created_at) > 2000 && <span>· {t("activity.edited")}</span>}
                {e.task && tasks && !e.event && (
                  <Link href={tasks.href(e.task.id)} className="inline-flex min-w-0 items-center gap-1 underline-offset-4 hover:underline">
                    · <CheckSquareIcon className="size-3 shrink-0" aria-hidden />
                    <span className="truncate">{e.task.title}</span>
                  </Link>
                )}
              </span>
              {e.comment ? (
                <CommentView t={t} c={e.comment} mine={e.comment.created_by === ctx.userId} back={back} actions={actions} fileOf={fileOf} upload={uploadTo} />
              ) : e.event && e.task && tasks ? (
                <p>
                  {/* "Aufgabe <Flyer> angelegt": the task's name in the sentence opens it */}
                  {t(e.event === "created" ? "activity.taskCreated" : "activity.taskTrashed", { task: "\u0000" })
                    .split("\u0000")
                    .map((part, i) =>
                      i === 0 ? (
                        part
                      ) : (
                        <span key={i}>
                          <Link href={tasks.href(e.task!.id)} className="font-medium underline-offset-4 hover:underline">
                            {e.task!.title || "…"}
                          </Link>
                          {part}
                        </span>
                      ),
                    )}
                </p>
              ) : e.event ? (
                <p>{t(e.event === "created" ? "activity.created" : "activity.trashed")}</p>
              ) : (
                <ul className="grid gap-0.5">
                  {e.diff?.map((d) => (
                    <li key={d.label} className="break-words">
                      <span className="text-muted-foreground">{d.label}:</span> <span className="text-muted-foreground line-through">{d.from}</span> → {d.to}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function CommentView({ t, c, mine, back, actions, fileOf, upload }: { t: T; c: Comment; mine: boolean; back: string; actions: { edit: (fd: FormData) => Promise<void>; remove: (fd: FormData) => Promise<void> }; fileOf: (id: string) => { id: string; name: string; mime: string } | undefined; upload?: { orgId: string; entity: string; entityId: string } }) {
  const attached = c.file_ids.map(fileOf).filter((f) => !!f)
  const images = attached.filter((f) => f.mime.startsWith("image/"))
  const others = attached.filter((f) => !f.mime.startsWith("image/"))
  // Own comments: pencil + bin top right. Editing (a <details>, no JS) swaps the text for the comment box.
  return (
    <div className={cn("relative grid gap-2 rounded-lg bg-muted px-3 py-2 [&:has(details[open])_[data-view]]:hidden", mine && "pr-16")}>
      {c.body && (
        <p data-view className="break-words whitespace-pre-wrap">
          {c.body}
        </p>
      )}
      {images.length > 0 && (
        <div data-view className="flex flex-wrap gap-2">
          {images.map((f) => (
            <a key={f.id} href={`/files/${f.id}`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element -- private file behind a short signed URL */}
              <img src={`/files/${f.id}`} alt={f.name} loading="lazy" className="size-24 object-cover" />
            </a>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <ul data-view className="grid gap-1">
          {others.map((f) => (
            <li key={f.id}>
              <a href={`/files/${f.id}`} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 text-primary underline-offset-4 hover:underline">
                <PaperclipIcon className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{f.name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {mine && (
        <>
          <details className="group/edit">
            <Tooltip>
              <TooltipTrigger
                render={
                  <summary
                    aria-label={t("activity.edit")}
                    className="absolute top-1 right-9 grid size-7 cursor-pointer list-none place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground group-open/edit:bg-background group-open/edit:text-foreground [&::-webkit-details-marker]:hidden"
                  />
                }
              >
                <PencilIcon className="size-3.5" aria-hidden />
              </TooltipTrigger>
              <TooltipContent>{t("activity.edit")}</TooltipContent>
            </Tooltip>
            <CommentForm action={actions.edit} entity={c.entity} entityId={c.entity_id} back={back} files={upload} edit={{ id: c.id, body: c.body, files: attached.map((f) => ({ id: f.id, name: f.name, image: f.mime.startsWith("image/") })) }} />
          </details>
          <form action={actions.remove} className="absolute top-1 right-1">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="back" value={back} />
            <Tooltip>
              <TooltipTrigger render={<SubmitButton variant="ghost" size="icon-sm" aria-label={t("activity.delete")} data-confirm="activity.confirmDelete" className="text-muted-foreground" />}>
                <Trash2Icon />
              </TooltipTrigger>
              <TooltipContent>{t("activity.delete")}</TooltipContent>
            </Tooltip>
          </form>
        </>
      )}
    </div>
  )
}
