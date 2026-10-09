import Link from "next/link"
import { DataTable, Pager, pageRange, PAGE_SIZE } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { renderEvent } from "@/events/render"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { createClient } from "@/lib/supabase/server"
import { pageParam, param, withParams } from "@/lib/url"
import { markAllRead } from "./actions"

// Personal inbox across all orgs (and platform events for superadmins).
export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const ctx = await getContext()
  const t = await getT()
  const sp = await searchParams
  const unreadOnly = param(sp, "filter") === "unread"
  const page = pageParam(sp)

  // Unscoped client: the inbox spans all of the person's orgs (RLS: own rows only).
  const db = await createClient()
  let query = db
    .from("notifications")
    .select("id, read_at, created_at, org_id, orgs(name), events(type, payload)")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .range(...pageRange(page))
  if (unreadOnly) query = query.is("read_at", null)
  const { data } = await query
  const rows = data?.slice(0, PAGE_SIZE) ?? []

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">{t("inbox.title")}</h1>
        <form action={markAllRead}>
          <Button type="submit" variant="outline" size="sm">
            {t("inbox.markAllRead")}
          </Button>
        </form>
      </div>
      <nav className="flex gap-1.5">
        {[
          [undefined, t("inbox.all")],
          ["unread", t("inbox.unread")],
        ].map(([f, label]) => (
          <Link
            key={label}
            href={withParams(sp, { filter: f, page: undefined })}
            aria-current={(f === "unread") === unreadOnly ? "true" : undefined}
            className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground"
          >
            {label}
          </Link>
        ))}
      </nav>
      <DataTable
        rows={rows}
        rowKey={(n) => String(n.id)}
        rowHref={(n) => `/notifications/${n.id}`}
        empty={t("inbox.empty")}
        columns={[
          {
            header: t("inbox.what"),
            cell: (n) => (
              <span className="flex items-center gap-2">
                {!n.read_at && <Badge>{t("inbox.unread")}</Badge>}
                <span className={n.read_at ? "text-muted-foreground" : "font-medium"}>{n.events ? renderEvent(n.events, t.locale).title : "–"}</span>
              </span>
            ),
          },
          { header: t("inbox.org"), cell: (n) => n.orgs?.name ?? t("admin.title") },
          { header: t("inbox.when"), cell: (n) => t.date(n.created_at, { dateStyle: "medium", timeStyle: "short" }) },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
