import Link from "next/link"
import { notFound } from "next/navigation"
import { DataTable } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { ListForm } from "./list-form"

export default async function GuestListsPage({ searchParams }: PageProps<"/guestlists">) {
  const ctx = await requirePerm("guestlists.view")
  if (!ctx.modules.has("guestlists")) notFound()
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("guestlists.manage")
  const eventId = param(sp, "event")
  const since = new Date(new Date().getTime() - 2 * 86_400_000).toISOString()
  let lists = ctx.supabase
    .from("guest_lists")
    .select("id, name, event_id, door_price, quota, link_enabled, ticket_type_id, events(title, starts_at), artists(name), guest_entries(count)")
    .eq("org_id", ctx.org.id)
    .is("deleted_at", null)
    .order("created_at")
  lists = eventId ? lists.or(`event_id.eq.${eventId},event_id.is.null`) : lists
  const [{ data }, { data: events }] = await Promise.all([
    lists,
    ctx.supabase.from("events").select("id, title, starts_at").eq("org_id", ctx.org.id).is("deleted_at", null).gte("starts_at", since).order("starts_at").limit(50),
  ])
  const rows = (data ?? []).filter((l) => !l.event_id || !eventId || l.event_id === eventId)
  // Only lists of upcoming events (plus permanent ones) without a filter.
  const visible = eventId ? rows : rows.filter((l) => !l.event_id || (l.events && l.events.starts_at >= since))
  const creating = canManage && param(sp, "new") === "list"
  const count = (l: (typeof rows)[number]) => (l.guest_entries as unknown as { count: number }[])[0]?.count ?? 0

  return (
    <div className="grid max-w-5xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">{t("guestlists.title")}</h1>
        {canManage && (
          <Button render={<Link href={withParams(sp, { new: "list" })} scroll={false} />} nativeButton={false} size="sm">
            {t("guestlists.new")}
          </Button>
        )}
      </div>
      <Notice error={!creating ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      <form className="flex flex-wrap items-center gap-2">
        <NativeSelect name="event" defaultValue={eventId ?? ""} aria-label={t("guestlists.event")} className="w-72 max-w-full">
          <NativeSelectOption value="">{t("guestlists.allUpcoming")}</NativeSelectOption>
          {events?.map((e) => (
            <NativeSelectOption key={e.id} value={e.id}>
              {e.title} · {t.date(e.starts_at, { dateStyle: "short" })}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button type="submit" size="sm" variant="outline">
          {t("guestlists.filter")}
        </Button>
      </form>
      <DataTable
        rows={visible}
        rowKey={(l) => l.id}
        rowHref={(l) => `/guestlists/${l.id}`}
        empty={t("guestlists.empty")}
        columns={[
          {
            header: t("guestlists.name"),
            cell: (l) => (
              <span className="grid">
                <span className="font-medium">{l.name}</span>
                {l.artists?.name && <span className="text-xs text-muted-foreground">{l.artists.name}</span>}
              </span>
            ),
          },
          {
            header: t("guestlists.event"),
            cell: (l) => (l.events ? `${l.events.title} · ${t.date(l.events.starts_at, { dateStyle: "short" })}` : <Badge variant="secondary">{t("guestlists.permanent")}</Badge>),
          },
          { header: t("guestlists.entries"), cell: (l) => `${count(l)}${l.quota ? ` / ${l.quota}` : ""}`, className: "tabular-nums" },
          { header: t("guestlists.doorPrice"), cell: (l) => (l.door_price ? t.money(l.door_price) : t("guestlists.free")) },
          { header: t("guestlists.link"), cell: (l) => (l.link_enabled ? <Badge>{t("guestlists.linkOn")}</Badge> : null) },
        ]}
      />
      {creating && (
        <UrlSheet params={["new"]} title={t("guestlists.new")}>
          <Notice error={param(sp, "error")} />
          <ListForm eventId={eventId ?? null} />
        </UrlSheet>
      )}
    </div>
  )
}

export const instant = false
