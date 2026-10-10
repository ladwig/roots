import Link from "next/link"
import { notFound } from "next/navigation"
import { DataTable, SearchBox } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { guestCheckIn, ticketDoorCheckIn } from "./actions"
import { Scanner } from "./scanner"

// Door: pick the event (today's first), then scan QR codes, check guest lists, or look up tickets by name.
export default async function DoorPage({ searchParams }: PageProps<"/scan">) {
  const ctx = await getContext()
  const canScan = ctx.modules.has("tickets") && ctx.can("tickets.scan")
  const canGuests = ctx.modules.has("guestlists") && ctx.can("guestlists.checkin")
  if (!canScan && !canGuests) notFound()
  const t = await getT()
  const sp = await searchParams
  const now = new Date().getTime()
  const since = new Date(now - 12 * 3600_000).toISOString()
  const { data: events } = await ctx.supabase
    .from("events")
    .select("id, title, starts_at")
    .eq("org_id", ctx.org.id)
    .eq("status", "published")
    .gte("starts_at", new Date(now - 7 * 86_400_000).toISOString())
    .order("starts_at")
    .limit(20)
  const current = events?.find((e) => e.id === param(sp, "event")) ?? events?.find((e) => e.starts_at >= since)
  const tabs = [...(canScan ? ["scan", "tickets"] : []), ...(canGuests ? ["guests"] : [])]
  const tab = tabs.find((x) => x === param(sp, "tab")) ?? tabs[0]
  const q = param(sp, "q")
    ?.replace(/[%,()*]/g, "")
    .trim()
  const chip = (href: string, active: boolean, label: string) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "true" : undefined}
      className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground"
    >
      {label}
    </Link>
  )

  return (
    <div className="grid max-w-3xl gap-6">
      <h1 className="font-heading text-2xl font-semibold">{t("tickets.scanTitle")}</h1>
      {!events?.length ? (
        <p className="text-sm text-muted-foreground">{t("tickets.noEventsToScan")}</p>
      ) : (
        <nav aria-label={t("tickets.pickEvent")} className="flex flex-wrap gap-1.5">
          {events.map((e) => chip(`/scan?event=${e.id}&tab=${tab}`, e.id === current?.id, `${e.title} · ${t.date(e.starts_at, { dateStyle: "short" })}`))}
        </nav>
      )}
      {current && (
        <>
          <nav aria-label={t("door.tabs")} className="flex gap-1 border-b pb-2">
            {tabs.map((x) => (
              <Link
                key={x}
                href={`/scan?event=${current.id}&tab=${x}`}
                aria-current={x === tab ? "page" : undefined}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground"
              >
                {t.dynamic(`door.tab.${x}`)}
              </Link>
            ))}
          </nav>
          <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
          {tab === "scan" && <Scanner key={current.id} eventId={current.id} />}
          {tab === "guests" && <Guests eventId={current.id} q={q} list={param(sp, "list")} sp={sp} chip={chip} />}
          {tab === "tickets" && <Tickets eventId={current.id} q={q} />}
        </>
      )}
    </div>
  )
}

async function Guests({
  eventId,
  q,
  list,
  sp,
  chip,
}: {
  eventId: string
  q?: string
  list?: string
  sp: Record<string, string | string[] | undefined>
  chip: (href: string, active: boolean, label: string) => React.ReactNode
}) {
  const ctx = await getContext()
  const t = await getT()
  // Lists of this event + permanent lists (valid at every event).
  const { data: lists } = await ctx.supabase
    .from("guest_lists")
    .select("id, name, door_price, event_id")
    .eq("org_id", ctx.org.id)
    .is("deleted_at", null)
    .or(`event_id.eq.${eventId},event_id.is.null`)
    .order("name")
  const ids = (list && lists?.some((l) => l.id === list) ? [list] : lists?.map((l) => l.id)) ?? []
  let entries = ctx.supabase
    .from("guest_entries")
    .select("id, name, list_id, guest_checkins(event_id, checked_in_at)")
    .in("list_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
    .order("name")
    .limit(500)
  if (q) entries = entries.ilike("name", `%${q}%`)
  const { data } = await entries
  const byId = new Map(lists?.map((l) => [l.id, l]))
  const rows = (data ?? []).map((e) => ({ ...e, list: byId.get(e.list_id)!, at: e.guest_checkins.find((c) => c.event_id === eventId)?.checked_in_at }))
  const inCount = rows.filter((r) => r.at).length

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox q={q} label={t("door.searchGuests")} keep={{ event: eventId, tab: "guests", ...(list ? { list } : {}) }} />
        <span className="text-sm text-muted-foreground">{t("door.guestCount", { in: inCount, total: rows.length })}</span>
      </div>
      <nav aria-label={t("door.lists")} className="flex flex-wrap gap-1.5">
        {chip(withParams(sp, { list: undefined }), !list, t("door.allLists"))}
        {lists?.map((l) => chip(withParams(sp, { list: l.id }), l.id === list, l.name))}
      </nav>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty={t("door.noGuests")}
        columns={[
          { header: t("guestlists.guest"), cell: (r) => <span className="font-medium">{r.name}</span> },
          {
            header: t("door.list"),
            cell: (r) => (
              <span className="text-sm">
                {r.list.name}
                {r.list.door_price > 0 && <Badge variant="outline" className="ml-1">{t("guestlists.atDoor", { price: t.money(r.list.door_price) })}</Badge>}
              </span>
            ),
          },
          {
            header: "",
            cell: (r) => (
              <form action={guestCheckIn} className="flex items-center justify-end gap-2">
                <input type="hidden" name="event" value={eventId} />
                <input type="hidden" name="entry" value={r.id} />
                <input type="hidden" name="name" value={r.name} />
                <input type="hidden" name="q" value={q ?? ""} />
                <input type="hidden" name="list" value={list ?? ""} />
                {r.at ? (
                  <>
                    <Badge>{t("door.inSince", { time: t.date(r.at, { timeStyle: "short" }) })}</Badge>
                    <input type="hidden" name="undo" value="1" />
                    <SubmitButton size="sm" variant="ghost">
                      {t("door.undo")}
                    </SubmitButton>
                  </>
                ) : (
                  <SubmitButton size="sm">{t("door.checkIn")}</SubmitButton>
                )}
              </form>
            ),
          },
        ]}
      />
    </section>
  )
}

async function Tickets({ eventId, q }: { eventId: string; q?: string }) {
  const ctx = await getContext()
  const t = await getT()
  let query = ctx.supabase
    .from("tickets")
    .select("id, code, holder_name, status, checked_in_at, ticket_types(name), pay_orders(customer_name)")
    .eq("event_id", eventId)
    .in("status", ["valid", "used"])
    .order("holder_name")
    .limit(200)
  if (q) query = query.or(`holder_name.ilike.%${q}%,code.ilike.%${q}%`)
  const { data } = await query
  return (
    <section className="grid gap-3">
      <SearchBox q={q} label={t("door.searchTickets")} keep={{ event: eventId, tab: "tickets" }} />
      <DataTable
        rows={data ?? []}
        rowKey={(k) => k.id}
        empty={t("door.noTickets")}
        columns={[
          { header: t("tickets.holder"), cell: (k) => <span className="font-medium">{k.holder_name ?? k.pay_orders?.customer_name ?? "–"}</span> },
          { header: t("tickets.typeName"), cell: (k) => k.ticket_types?.name },
          { header: t("tickets.code"), cell: (k) => <span className="font-mono text-xs">{k.code}</span> },
          {
            header: "",
            cell: (k) =>
              k.status === "used" ? (
                <Badge>{t("door.inSince", { time: k.checked_in_at ? t.date(k.checked_in_at, { timeStyle: "short" }) : "" })}</Badge>
              ) : (
                <form action={ticketDoorCheckIn} className="flex justify-end">
                  <input type="hidden" name="event" value={eventId} />
                  <input type="hidden" name="code" value={k.code} />
                  <input type="hidden" name="q" value={q ?? ""} />
                  <SubmitButton size="sm">{t("door.checkIn")}</SubmitButton>
                </form>
              ),
          },
        ]}
      />
    </section>
  )
}

export const instant = false
