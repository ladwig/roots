import { Trash2Icon } from "lucide-react"
import { SubmitButton } from "@/components/submit-button"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { T } from "@/i18n/translate"
import type { getContext } from "@/lib/context"

type Ctx = Awaited<ReturnType<typeof getContext>>
type Change = { at: string; actor_id: string | null; action: string; old: unknown; new: unknown; via: string | null }
type Entry = { key: string; at: string; by: string | null; comment: { id: string; body: string; created_by: string | null } | null; diff: { label: string; from: string; to: string }[] | null; created: boolean; via: string | null }

/**
 * Comments + change history of one record, newest first (projects and tasks; the `comments` table + record_changes()).
 * `fields` = the columns people know, with their labels; custom fields show by their label. Everyone who sees the record
 * may comment; own comments (or all, with `canModerate`) can be removed. Forms post to the given actions with `back`.
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
  actions,
  canModerate,
}: {
  ctx: Ctx
  t: T
  entity: "projects" | "tasks"
  entityId: string
  back: string
  fields: Record<string, string>
  defs?: { key: string; label: string }[]
  show?: Record<string, (v: unknown) => string> // column → how to show a value (ids → names)
  actions: { add: (fd: FormData) => Promise<void>; remove: (fd: FormData) => Promise<void> }
  canModerate: boolean
}) {
  const [{ data: comments }, { data: changes }] = await Promise.all([
    ctx.supabase.from("comments").select("id, body, created_at, created_by").eq("org_id", ctx.org.id).eq("entity", entity).eq("entity_id", entityId).order("created_at", { ascending: false }).limit(200),
    ctx.supabase.rpc("record_changes", { p_table: entity, p_id: entityId }),
  ])
  const ids = [...new Set([...(comments ?? []).map((c) => c.created_by), ...((changes ?? []) as Change[]).map((c) => c.actor_id)].filter((v): v is string => !!v))]
  const { data: people } = ids.length ? await ctx.supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] }
  const who = (id: string | null) => {
    const p = people?.find((x) => x.id === id)
    return p?.full_name || p?.email || t("activity.someone")
  }
  const fmt = (v: unknown, key?: string): string => {
    if (key && show[key]) return show[key](v)
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return "–"
    if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? "…" : String(x))).join(", ")
    if (typeof v === "boolean") return v ? "✓" : "✗"
    if (typeof v === "object") return "…"
    const s = String(v)
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return t.date(s, { dateStyle: "medium" })
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return t.date(`${s}T12:00:00`, { dateStyle: "medium" })
    const plain = s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    return plain.length > 80 ? `${plain.slice(0, 80)}…` : plain
  }
  const diff = (o: unknown, n: unknown) => {
    const a = (o ?? {}) as Record<string, unknown>
    const b = (n ?? {}) as Record<string, unknown>
    const out: { label: string; from: string; to: string }[] = []
    for (const [key, label] of Object.entries(fields))
      if (key in a || key in b) {
        const from = fmt(a[key], key)
        const to = fmt(b[key], key)
        if (from !== to) out.push({ label, from, to })
      }
    const ac = (a.custom ?? {}) as Record<string, unknown>
    const bc = (b.custom ?? {}) as Record<string, unknown>
    for (const key of new Set([...Object.keys(ac), ...Object.keys(bc)])) {
      const from = fmt(ac[key])
      const to = fmt(bc[key])
      if (from !== to) out.push({ label: defs.find((d) => d.key === key)?.label ?? key, from, to })
    }
    return out
  }
  const feed: Entry[] = [
    ...(comments ?? []).map((c): Entry => ({ key: c.id, at: c.created_at, by: c.created_by, comment: c, diff: null, created: false, via: null })),
    ...((changes ?? []) as Change[]).flatMap((c, i): Entry[] => {
      if (c.action === "insert") return [{ key: `c${i}`, at: c.at, by: c.actor_id, comment: null, diff: null, created: true, via: c.via }]
      const d = c.action === "update" ? diff(c.old, c.new) : []
      return d.length ? [{ key: `c${i}`, at: c.at, by: c.actor_id, comment: null, diff: d, created: false, via: c.via }] : []
    }),
  ].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <div className="grid gap-4">
      <form action={actions.add} className="grid gap-2">
        <input type="hidden" name="entity" value={entity} />
        <input type="hidden" name="entity_id" value={entityId} />
        <input type="hidden" name="back" value={back} />
        <Textarea name="body" required maxLength={10000} rows={2} placeholder={t("activity.placeholder")} aria-label={t("activity.placeholder")} />
        <SubmitButton size="sm" variant="outline" className="justify-self-start">
          {t("activity.comment")}
        </SubmitButton>
      </form>
      {feed.length > 0 && (
        <ol className="grid gap-3 border-l pl-4">
          {feed.map((e) => (
            <li key={e.key} className="relative grid gap-1 text-sm">
              <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-border" aria-hidden />
              <span className="text-xs text-muted-foreground">
                {t.date(e.at, { dateStyle: "medium", timeStyle: "short" })} · {who(e.by)}
                {e.via && ` · ${e.via.startsWith("oauth:") ? t("activity.viaAi") : t("activity.viaApi")}`}
              </span>
              {e.comment ? (
                <div className="flex items-start gap-2">
                  <p className="flex-1 rounded-lg bg-muted px-3 py-2 break-words whitespace-pre-wrap">{e.comment.body}</p>
                  {(canModerate || e.comment.created_by === ctx.userId) && (
                    <form action={actions.remove}>
                      <input type="hidden" name="id" value={e.comment.id} />
                      <input type="hidden" name="back" value={back} />
                      <Tooltip>
                        <TooltipTrigger render={<SubmitButton variant="ghost" size="icon-sm" aria-label={t("activity.delete")} />}>
                          <Trash2Icon />
                        </TooltipTrigger>
                        <TooltipContent>{t("activity.delete")}</TooltipContent>
                      </Tooltip>
                    </form>
                  )}
                </div>
              ) : e.created ? (
                <p>{t("activity.created")}</p>
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
