import Link from "next/link"
import { CheckCheckIcon, InboxIcon } from "lucide-react"
import { Page, PageHeader } from "@/components/page"
import { DataTable, Pager, pageRange, PAGE_SIZE } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { renderEvent } from "@/events/render"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { createClient } from "@/lib/supabase/server"
import { pageParam, param, withParams } from "@/lib/url"
import { markAllRead } from "./actions"
import { SubmitButton } from "@/components/submit-button"

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
    .select("id, read_at, created_at, org_id, orgs(name), events:hub_events(type, payload)")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .range(...pageRange(page))
  if (unreadOnly) query = query.is("read_at", null)
  const { data } = await query
  const rows = data?.slice(0, PAGE_SIZE) ?? []

  return (
    <Page size="form">
      <PageHeader
        icon={InboxIcon}
        title={t("inbox.title")}
        actions={
          <form action={markAllRead}>
            <SubmitButton variant="outline" size="sm">
              <CheckCheckIcon /> {t("inbox.markAllRead")}
            </SubmitButton>
          </form>
        }
      />
      <nav aria-label={t("inbox.title")} className="flex gap-1 justify-self-start rounded-lg bg-muted p-1">
        {[
          [undefined, t("inbox.all")],
          ["unread", t("inbox.unread")],
        ].map(([f, label]) => (
          <Link
            key={label}
            href={withParams(sp, { filter: f, page: undefined })}
            aria-current={(f === "unread") === unreadOnly ? "true" : undefined}
            className="inline-flex min-h-7 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=true]:bg-background aria-[current=true]:font-medium aria-[current=true]:text-foreground aria-[current=true]:shadow-sm"
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
    </Page>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
