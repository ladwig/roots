import { DataTable, Pager, pageRange, PAGE_SIZE } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam } from "@/lib/url"

// What went out (and what's waiting or failed), newest first.
export default async function EmailLogPage({ searchParams }: PageProps<"/email/log">) {
  const ctx = await requirePerm("email.view")
  const t = await getT()
  const sp = await searchParams
  const page = pageParam(sp)
  const { data } = await ctx.supabase
    .from("email_sends")
    .select("id, to_email, status, send_after, sent_at, error, email_campaigns(name), email_automations(name)")
    .eq("org_id", ctx.org.id)
    .order("created_at", { ascending: false })
    .range(...pageRange(page))
  const rows = data?.slice(0, PAGE_SIZE) ?? []
  return (
    <>
      <h1 className="font-heading text-2xl font-semibold">{t("email.tabs.log")}</h1>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty={t("email.emptyLog")}
        columns={[
          { header: t("email.to"), cell: (r) => <span className="font-medium break-all">{r.to_email}</span> },
          { header: t("email.source"), cell: (r) => r.email_campaigns?.name ?? r.email_automations?.name ?? "–" },
          {
            header: t("email.status"),
            cell: (r) => (
              <span className="grid gap-0.5">
                <Badge variant={r.status === "sent" ? "default" : r.status === "failed" ? "destructive" : "outline"}>{t.dynamic(`email.sendStatus.${r.status}`)}</Badge>
                {r.error && <span className="text-xs text-destructive">{r.error}</span>}
              </span>
            ),
          },
          { header: t("email.when"), cell: (r) => t.date(r.sent_at ?? r.send_after, { dateStyle: "short", timeStyle: "short" }), className: "whitespace-nowrap" },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
    </>
  )
}

export const instant = false
