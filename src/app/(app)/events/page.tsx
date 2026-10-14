import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { DataTable, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { CalendarDaysIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuLink } from "@/components/actions-menu"
import { FilterMenu } from "@/components/filter-menu"
import { Notice } from "@/components/notice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { StatusBadge } from "./event-form"

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
  if (param(sp, "new")) redirect("/events/new") // old drawer link

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
      className="inline-flex min-h-7 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=true]:bg-background aria-[current=true]:font-medium aria-[current=true]:text-foreground aria-[current=true]:shadow-sm"
    >
      {label}
    </Link>
  )

  return (
    <Page>
      <PageHeader
        area="events"
        title={trash ? `${t("eventsPage.title")} · ${t("eventsPage.trash")}` : t("eventsPage.title")}
        menu={
          canManage && (
            <ActionsMenu>
              <MenuLink href={trash ? "/events" : "/events?trash=1"} icon={trash ? <CalendarDaysIcon /> : <Trash2Icon />}>
                {trash ? t("eventsPage.all") : t("eventsPage.trash")}
              </MenuLink>
            </ActionsMenu>
          )
        }
        primary={canManage && !trash ? { href: "/events/new", label: t("eventsPage.new") } : undefined}
      />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox q={q} label={t("common.search")} />
        {!trash && (
          <>
            <nav aria-label={t("eventsPage.when")} className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1">
              {VIEWS.map((v) => chip(withParams(sp, { view: v === "upcoming" ? undefined : v, page: undefined, edit: undefined }), v === view, t.dynamic(`eventsPage.${v}`)))}
            </nav>
            <FilterMenu param="status" label={t("eventsPage.status")} options={STATUSES.map((s) => ({ value: s, label: t.dynamic(`eventsPage.statuses.${s}`) }))} />
          </>
        )}
      </div>
      {trash && <p className="text-sm text-muted-foreground">{t("eventsPage.trashHint", { days: 30 })}</p>}

      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/events/${r.id}`}
        empty={
          trash ? (
            t("eventsPage.emptyTrash")
          ) : q || status || view !== "upcoming" ? (
            t("eventsPage.empty")
          ) : (
            <EmptyState
              area="events"
              title={t("eventsPage.empty")}
              text={t("eventsPage.emptyText")}
              action={
                canManage && (
                  <Button render={<Link href="/events/new" />} nativeButton={false} size="sm">
                    <PlusIcon /> {t("eventsPage.new")}
                  </Button>
                )
              }
            />
          )
        }
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
    </Page>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
