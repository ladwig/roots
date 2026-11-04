import Link from "next/link"
import { DataTable, Pager, pageRange, PAGE_SIZE } from "@/components/data-table"
import { PageHeader } from "@/components/page"
import { SearchBox } from "@/components/data-table"
import { Segments } from "@/components/segments"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"

const BULK = ["campaign", "automation", "workflow"]
const VIEWS = ["all", "system", "bulk"] as const

// Where a row's record lives in the App.
const HREF: Record<string, (id: string) => string> = {
  shop_orders: (id) => `/shop/orders/${id}`,
  events: (id) => `/events/${id}`,
  documents: (id) => `/invoices/${id}`,
  contacts: (id) => `/contacts/${id}`,
  forms: (id) => `/forms/${id}`,
  email_campaigns: (id) => `/email/${id}`,
  email_automations: (id) => `/email/automations?edit=${id}`,
  workflows: (id) => `/automations/${id}`,
}

const kindLabel = (t: T, kind: string) => {
  if (kind.startsWith("shop.")) return `${t.dynamic("email.kinds.shop")} · ${t.dynamic(`store.mailKinds.${kind.slice(5)}`)}`
  return t.has(`email.kinds.${kind}`) ? t.dynamic(`email.kinds.${kind}`) : kind
}

// Every mail that went out in the org's name (and what's waiting or failed), newest first: campaigns, automations
// and workflows from the queue, everything else (shop, tickets, invoices, logins…) from email_log (kept 90 days).
export default async function EmailLogPage({ searchParams }: PageProps<"/email/log">) {
  const ctx = await requirePerm("email.view")
  const t = await getT()
  const sp = await searchParams
  const page = pageParam(sp)
  const view = VIEWS.find((v) => v === param(sp, "view")) ?? "all"
  const q = param(sp, "q")?.trim()
  let query = ctx.supabase
    .from("email_history")
    .select("id, to_email, subject, kind, source, entity, entity_id, status, delivery, error, at")
    .eq("org_id", ctx.org.id!)
    .order("at", { ascending: false })
  if (view === "bulk") query = query.in("kind", BULK)
  if (view === "system") query = query.not("kind", "in", `(${BULK.join(",")})`)
  if (q) query = query.or(`to_email.ilike.%${q.replace(/[%,()]/g, "")}%,subject.ilike.%${q.replace(/[%,()]/g, "")}%`)
  const { data } = await query.range(...pageRange(page))
  const rows = data?.slice(0, PAGE_SIZE) ?? []
  return (
    <>
      <PageHeader area="communication" title={t("email.tabs.log")} description={t("email.logHint")} />
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox label={t("email.logSearch")} />
        <Segments label={t("email.source")} items={VIEWS.map((v) => ({ href: withParams(sp, { view: v === "all" ? undefined : v, page: undefined }), current: v === view, label: t.dynamic(`email.logViews.${v}`) }))} />
      </div>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id!}
        empty={t("email.emptyLog")}
        columns={[
          {
            header: t("email.to"),
            cell: (r) => (
              <span className="grid">
                <span className="font-medium break-all">{r.to_email}</span>
                {r.subject && <span className="text-xs text-muted-foreground">{r.subject}</span>}
              </span>
            ),
          },
          {
            header: t("email.kind"),
            cell: (r) => {
              const label = r.source ? `${kindLabel(t, r.kind!)}: ${r.source}` : kindLabel(t, r.kind!)
              const href = r.entity && r.entity_id ? HREF[r.entity]?.(r.entity_id) : undefined
              return href ? (
                <Link href={href} className="underline-offset-4 hover:underline">
                  {label}
                </Link>
              ) : (
                label
              )
            },
          },
          {
            header: t("email.status"),
            cell: (r) => (
              <span className="grid gap-0.5">
                <Badge variant={r.status === "sent" ? "default" : r.status === "failed" ? "destructive" : "outline"}>{t.dynamic(`email.sendStatus.${r.status}`)}</Badge>
                {r.delivery && (
                  <span className={r.delivery === "bounced" || r.delivery === "complained" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                    {t.dynamic(`email.delivery.${r.delivery}`)}
                  </span>
                )}
                {r.error && <span className="text-xs text-destructive">{r.error}</span>}
              </span>
            ),
          },
          { header: t("email.when"), cell: (r) => t.date(r.at!, { dateStyle: "short", timeStyle: "short" }), className: "whitespace-nowrap" },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
    </>
  )
}

export const instant = false
