import Link from "next/link"
import { notFound } from "next/navigation"
import { ExternalLinkIcon } from "lucide-react"
import { DataTable, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { ImageForm } from "@/components/image-form"
import { Notice } from "@/components/notice"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { toLocalInput } from "@/lib/time"
import { pageParam, param, siteUrl, withParams, type SearchParams } from "@/lib/url"
import type { Tables } from "@/lib/supabase/types"
import { createEvent, restoreEvent, setEventStatus, trashEvent, updateEvent, updateEventImage } from "./actions"

const VIEWS = ["upcoming", "past", "all"] as const
const STATUSES = ["draft", "published", "cancelled"] as const
type Ev = Tables<"events">

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
  const editId = param(sp, "edit")
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
  const [{ data }, { data: editing }] = await Promise.all([
    query,
    editId
      ? ctx.supabase.from("events").select("*").eq("id", editId).eq("org_id", ctx.org.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
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
    <div className="mx-auto grid max-w-5xl gap-6">
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
        rowHref={(r) => withParams(sp, { edit: r.id, new: undefined })}
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
      {editing && <EditEvent t={t} ev={editing} sp={sp} canManage={canManage} orgSlug={ctx.org.slug} />}
    </div>
  )
}

function StatusBadge({ t, status }: { t: T; status: string }) {
  const variant = status === "published" ? "default" : status === "cancelled" ? "destructive" : "secondary"
  return <Badge variant={variant}>{t.dynamic(`eventsPage.statuses.${status}`)}</Badge>
}

function EventForm({ t, action, ev, disabled }: { t: T; action: (fd: FormData) => Promise<void>; ev?: Ev; disabled?: boolean }) {
  return (
    <form action={action} className="grid gap-4">
      {ev && <input type="hidden" name="id" value={ev.id} />}
      <fieldset disabled={disabled} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="ev-title">{t("eventsPage.titleLabel")}</Label>
          <Input id="ev-title" name="title" defaultValue={ev?.title} required maxLength={200} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="ev-starts">{t("eventsPage.startsAt")}</Label>
            <Input
              id="ev-starts"
              name="starts_at"
              type="datetime-local"
              defaultValue={ev ? toLocalInput(ev.starts_at) : undefined}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ev-ends">{t("eventsPage.endsAt")}</Label>
            <Input id="ev-ends" name="ends_at" type="datetime-local" defaultValue={ev?.ends_at ? toLocalInput(ev.ends_at) : undefined} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ev-venue">{t("eventsPage.venueName")}</Label>
          <Input id="ev-venue" name="venue_name" defaultValue={ev?.venue_name ?? ""} maxLength={200} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ev-address">{t("eventsPage.venueAddress")}</Label>
          <Input id="ev-address" name="venue_address" defaultValue={ev?.venue_address ?? ""} maxLength={500} autoComplete="off" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ev-description">{t("eventsPage.description")}</Label>
          <textarea
            id="ev-description"
            name="description"
            defaultValue={ev?.description ?? ""}
            maxLength={20000}
            rows={6}
            className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ev-capacity">{t("eventsPage.capacity")}</Label>
          <Input id="ev-capacity" name="capacity" type="number" min={1} step={1} defaultValue={ev?.capacity ?? ""} className="sm:max-w-40" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ev-slug">{t("eventsPage.slug")}</Label>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span className="shrink-0">/e/</span>
            <Input id="ev-slug" name="slug" defaultValue={ev?.slug} placeholder="sommerfest-2026" pattern="[a-z0-9][a-z0-9\-]{0,78}[a-z0-9]" />
          </div>
        </div>
        {!disabled && (
          <Button type="submit" className="justify-self-start">
            {ev ? t("common.save") : t("eventsPage.new")}
          </Button>
        )}
      </fieldset>
    </form>
  )
}

function EditEvent({ t, ev, sp, canManage, orgSlug }: { t: T; ev: Ev; sp: SearchParams; canManage: boolean; orgSlug: string }) {
  const publicHref = siteUrl(orgSlug, `/e/${ev.slug}`)
  return (
    <UrlSheet params={["edit"]} title={ev.title} description={t.date(ev.starts_at, { dateStyle: "full", timeStyle: "short" })}>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {ev.deleted_at ? (
        <>
          <p className="rounded-lg border bg-muted px-3 py-2 text-sm">
            {t("eventsPage.deletedOn", {
              date: t.date(ev.deleted_at),
              purge: t.date(new Date(new Date(ev.deleted_at).getTime() + 30 * 86_400_000)),
            })}
          </p>
          {canManage && (
            <form action={restoreEvent}>
              <input type="hidden" name="id" value={ev.id} />
              <Button type="submit">{t("eventsPage.restore")}</Button>
            </form>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge t={t} status={ev.status} />
            {ev.status !== "draft" && (
              <a
                href={publicHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm underline underline-offset-4"
              >
                {t("eventsPage.publicLink")} <ExternalLinkIcon className="size-3.5" />
              </a>
            )}
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              {ev.status !== "published" && (
                <form action={setEventStatus}>
                  <input type="hidden" name="id" value={ev.id} />
                  <input type="hidden" name="status" value="published" />
                  <Button type="submit" size="sm">
                    {t("eventsPage.publish")}
                  </Button>
                </form>
              )}
              {ev.status === "published" && (
                <form action={setEventStatus}>
                  <input type="hidden" name="id" value={ev.id} />
                  <input type="hidden" name="status" value="draft" />
                  <Button type="submit" size="sm" variant="outline">
                    {t("eventsPage.unpublish")}
                  </Button>
                </form>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("eventsPage.readOnly")}</p>
          )}
          <Separator />
          {canManage && (
            <ImageForm
              action={updateEventImage}
              id="ev-image"
              label={t("eventsPage.image")}
              hint={t("eventsPage.imageHint")}
              name={ev.title}
              path={ev.image_path}
              square
              hidden={{ id: ev.id }}
            />
          )}
          <EventForm t={t} action={updateEvent} ev={ev} disabled={!canManage} />
          {canManage && (
            <section className="grid gap-3 rounded-lg border border-destructive/30 p-3">
              <h3 className="font-medium text-destructive">{t("admin.dangerZone")}</h3>
              {ev.status === "published" && (
                <form action={setEventStatus} className="grid gap-2">
                  <input type="hidden" name="id" value={ev.id} />
                  <input type="hidden" name="status" value="cancelled" />
                  <p className="text-sm text-muted-foreground">{t("eventsPage.cancelConfirm")}</p>
                  <Button type="submit" variant="destructive" size="sm" className="justify-self-start">
                    {t("eventsPage.cancel")}
                  </Button>
                </form>
              )}
              <form action={trashEvent}>
                <input type="hidden" name="id" value={ev.id} />
                <Button type="submit" variant="outline" size="sm">
                  {t("eventsPage.toTrash")}
                </Button>
              </form>
            </section>
          )}
        </>
      )}
    </UrlSheet>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
