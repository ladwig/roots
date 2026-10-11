import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePlatformAdmin } from "@/lib/context"
import { param } from "@/lib/url"

const PAGE_SIZE = 50
const TABLES = ["orgs", "roles", "org_members", "invites", "org_modules", "org_integrations", "platform_admins", "event_subscriptions", "pay_orders"]

// Platform-wide change log (superadmins only). Filter by org (?org=) and area (?table=).
export default async function AdminActivity({ searchParams }: PageProps<"/admin/activity">) {
  const { supabase } = await requirePlatformAdmin()
  const t = await getT()
  const area = (table: string) => (t.has(`activity.tables.${table}`) ? t.dynamic(`activity.tables.${table}`) : table)
  const sp = await searchParams
  const table = param(sp, "table")
  const org = param(sp, "org")
  const page = Math.max(1, Number(param(sp, "page")) || 1)

  let query = supabase
    .from("audit_log")
    .select("id, org_id, table_name, row_id, action, actor_id, at, old, new")
    .order("at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE) // one extra row tells us if there's a next page
  if (table) query = query.eq("table_name", table)
  if (org && /^[0-9a-f-]{36}$/.test(org)) query = query.eq("org_id", org)
  const { data } = await query
  const entries = data?.slice(0, PAGE_SIZE) ?? []
  const hasNext = (data?.length ?? 0) > PAGE_SIZE

  const actorIds = [...new Set(entries.map((e) => e.actor_id).filter((id): id is string => !!id))]
  const orgIds = [...new Set(entries.map((e) => e.org_id).filter((id): id is string => !!id))]
  const [{ data: profiles }, { data: orgs }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name").in("id", actorIds),
    supabase.from("orgs").select("id, name").in("id", orgIds),
  ])
  const actor = new Map(profiles?.map((p) => [p.id, p.full_name || p.email]))
  const orgName = new Map(orgs?.map((o) => [o.id, o.name]))

  const href = (changes: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams()
    const next = { table, org, page, ...changes }
    if (next.org) p.set("org", String(next.org))
    if (next.table) p.set("table", String(next.table))
    if (next.page && next.page !== 1) p.set("page", String(next.page))
    return p.size ? `?${p}` : "?"
  }

  return (
    <div className="grid gap-4">
      <h1 className="font-heading text-2xl font-semibold">{t("admin.activity.title")}</h1>
      {org && (
        <p className="text-sm">
          {t("admin.activity.filteredBy", { org: orgName.get(org) ?? org })}{" "}
          <Link href={href({ org: undefined, page: 1 })} className="underline underline-offset-4">
            {t("activity.all")}
          </Link>
        </p>
      )}
      <nav aria-label={t("activity.filter")} className="flex flex-wrap gap-1.5">
        {[undefined, ...TABLES].map((tab) => (
          <Link
            key={tab ?? "all"}
            href={href({ table: tab, page: 1 })}
            aria-current={tab === table ? "true" : undefined}
            className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground"
          >
            {tab ? area(tab) : t("activity.all")}
          </Link>
        ))}
      </nav>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("activity.empty")}</p>
      ) : (
        <ol className="grid divide-y rounded-lg border">
          {entries.map((e) => {
            const fields = Object.keys((e.new ?? e.old ?? {}) as object).filter((k) => !["id", "org_id"].includes(k))
            return (
              <li key={e.id} id={`entry-${e.id}`}>
                <details className="group px-4 py-3">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <Badge variant={e.action === "delete" ? "destructive" : e.action === "insert" ? "default" : "secondary"}>
                      {e.action === "insert" ? t("activity.created") : e.action === "update" ? t("activity.changed") : t("activity.deleted")}
                    </Badge>
                    <span className="font-medium">{area(e.table_name)}</span>
                    {e.org_id && !org && (
                      <Link href={href({ org: e.org_id, page: 1 })} className="relative z-10 text-muted-foreground underline-offset-4 hover:underline">
                        {orgName.get(e.org_id) ?? "–"}
                      </Link>
                    )}
                    {e.action === "update" && <span className="min-w-0 truncate text-muted-foreground">{fields.join(", ")}</span>}
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {(e.actor_id && actor.get(e.actor_id)) || t("activity.system")} ·{" "}
                      {t.date(e.at, { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </summary>
                  <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs">
                    {JSON.stringify(e.action === "update" ? { before: e.old, after: e.new } : (e.new ?? e.old), null, 2)}
                  </pre>
                </details>
              </li>
            )
          })}
        </ol>
      )}

      <div className="flex justify-between">
        {page > 1 ? (
          <Button render={<Link href={href({ page: page - 1 })} />} nativeButton={false} variant="outline" size="sm">
            {t("activity.newer")}
          </Button>
        ) : (
          <span />
        )}
        {hasNext && (
          <Button render={<Link href={href({ page: page + 1 })} />} nativeButton={false} variant="outline" size="sm">
            {t("activity.older")}
          </Button>
        )}
      </div>
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
