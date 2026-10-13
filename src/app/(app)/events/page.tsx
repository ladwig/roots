import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { DataTable, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { UrlSheet } from "@/components/url-sheet"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { createEvent } from "./actions"
import { EventForm, StatusBadge } from "./event-form"

const VIEWS = ["upcoming", "past", "all"] as const
const STATUSES = ["draft", "published", "cancelled"] as const

export default async function EventsPage({ searchParams }: PageProps<"/events">) {
  const ctx = await requirePerm("events.view")
  if (!ctx.modules.has("events")) notFound()
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("events.manage")
  const q = param(sp, "q")
    ?.replace(/[%,()*]/g, "")
    .trim()
  const trash = canManage && param(sp, "trash") === "1"
  const view = VIEWS.find((v) => v === param(sp, "view")) ?? "upcoming"
  const status = STATUSES.find((s) => s === param(sp, "status"))
  const page = pageParam(sp)
  // Old drawer links (?edit=<id>) → the event's page.
  const editId = param(sp, "edit")
  if (editId && /^[0-9a-f-]{36}$/.test(editId)) redirect(`/events/${editId}`)
  const creating = canManage && param(sp, "new") === "event"

  // All filtering happens here in the query; the UI only writes the URL.
  const now = new Date().toISOString()
  let query = ctx.supabase
    .from("events")
    .select("id, title, slug, status, starts_at, ends_at, venue_name, deleted_at")
    .eq("org_id", ctx.org.id)
    .range(...pageRange(page))
  if (trash) query = query.not("deleted_at", "is", null).order("deleted_at", { ascending: false })
  else {
    query = query.is("deleted_at", null)
    if (view === "upcoming") query = query.or(`ends_at.gte.${now},and(ends_at.is.null,starts_at.gte.${now})`).order("starts_at")
    else if (view === "past")
      query = query.or(`ends_at.lt.${now},and(ends_at.is.null,starts_at.lt.${now})`).order("starts_at", { ascending: false })
    else query = query.order("starts_at", { ascending: false })
    if (status) query = query.eq("status", status)
  }
  if (q) query = query.or(`title.ilike.%${q}%,venue_name.ilike.%${q}%`)
  const { data } = await query
  const rows = data?.slice(0, PAGE_SIZE) ?? []
  const chip = (href: string, current: boolean, label: string) => (
    <Link
      key={label}
      href={href}
      aria-current={current ? "true" : undefined}
      className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground"
    >
      {label}
    </Link>
  )

  return (
    <div className="grid max-w-5xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">{t("eventsPage.title")}</h1>
        {canManage && (
          <Button render={<Link href={withParams(sp, { new: "event", edit: undefined })} scroll={false} />} nativeButton={false} size="sm">
            {t("eventsPage.new")}
          </Button>
        )}
      </div>
      <Notice error={!editId && !creating ? param(sp, "error") : undefined} ok={!editId ? param(sp, "ok") : undefined} />

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox q={q} label={t("common.search")} />
        <nav aria-label={t("eventsPage.when")} className="flex flex-wrap gap-1.5">
          {VIEWS.map((v) =>
            chip(
              withParams(sp, { view: v === "upcoming" ? undefined : v, trash: undefined, page: undefined, edit: undefined }),
              !trash && v === view,
              t.dynamic(`eventsPage.${v}`),
            ),
          )}
          {canManage &&
            chip(
              withParams(sp, { trash: "1", view: undefined, status: undefined, page: undefined, edit: undefined }),
              trash,
              t("eventsPage.trash"),
            )}
        </nav>
        {!trash && (
          <nav aria-label={t("eventsPage.status")} className="flex flex-wrap gap-1.5">
            {[undefined, ...STATUSES].map((s) =>
              chip(
                withParams(sp, { status: s, page: undefined, edit: undefined }),
                s === status,
                s ? t.dynamic(`eventsPage.statuses.${s}`) : t("eventsPage.all"),
              ),
            )}
          </nav>
        )}
      </div>
      {trash && <p className="text-sm text-muted-foreground">{t("eventsPage.trashHint", { days: 30 })}</p>}

      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/events/${r.id}`}
        empty={trash ? t("eventsPage.emptyTrash") : t("eventsPage.empty")}
        columns={[
          { header: t("eventsPage.titleLabel"), cell: (r) => <span className="font-medium">{r.title}</span> },
          {
            header: t("eventsPage.when"),
            cell: (r) => t.date(r.starts_at, { dateStyle: "medium", timeStyle: "short" }),
            className: "whitespace-nowrap",
          },
          { header: t("eventsPage.where"), cell: (r) => <span className="text-muted-foreground">{r.venue_name}</span> },
          { header: t("eventsPage.status"), cell: (r) => <StatusBadge t={t} status={r.status} /> },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />

      {creating && (
        <UrlSheet params={["new"]} title={t("eventsPage.new")}>
          <Notice error={param(sp, "error")} />
          <EventForm t={t} action={createEvent} />
        </UrlSheet>
      )}
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
