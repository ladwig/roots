import Link from "next/link"
import { Page } from "@/components/page"
import { notFound } from "next/navigation"
import { SearchBox } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { memberDoor, type MemberAtDoor } from "@/members/door"
import { guestCheckIn, memberDoorCheckIn, ticketDoorCheckIn } from "./actions"
import { MemberCard } from "./member-card"
import { Scanner } from "./scanner"
import { IdCardIcon, ScanLineIcon, ShoppingCartIcon, TicketIcon, UsersIcon } from "lucide-react"

const TAB_ICONS = { scan: ScanLineIcon, sale: ShoppingCartIcon, tickets: TicketIcon, members: IdCardIcon, guests: UsersIcon } as const
import { DoorSale } from "./door-sale"
import { doorOffer, doorStats, doorSummary } from "@/tickets/door"
import { DoorStats } from "./door-stats"

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
  const canMembers = canScan && ctx.modules.has("members")
  const stats = current && canScan ? await doorStats(ctx.org.id, current.id) : null
  const tabs = [...(canScan ? ["scan", "sale", "tickets"] : []), ...(canMembers ? ["members"] : []), ...(canGuests ? ["guests"] : [])]
  const tab = tabs.find((x) => x === param(sp, "tab")) ?? tabs[0]
  const q = param(sp, "q")
    ?.replace(/[%,()*]/g, "")
    .trim()
  const chip = (href: string, active: boolean, label: string) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "true" : undefined}
      className="inline-flex min-h-7 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=true]:bg-background aria-[current=true]:font-medium aria-[current=true]:text-foreground aria-[current=true]:shadow-sm"
    >
      {label}
    </Link>
  )

  const eventChip = (href: string, active: boolean, label: string) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "true" : undefined}
      className="inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-sm whitespace-nowrap text-muted-foreground aria-[current=true]:border-primary aria-[current=true]:bg-primary aria-[current=true]:font-medium aria-[current=true]:text-primary-foreground"
    >
      {label}
    </Link>
  )

  return (
    <Page size="form">
      <div className="grid gap-4 pb-24 md:pb-0">
      {!events?.length ? (
        <p className="text-sm text-muted-foreground">{t("tickets.noEventsToScan")}</p>
      ) : (
        <nav aria-label={t("tickets.pickEvent")} className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-1">
          {events.map((e) => eventChip(`/scan?event=${e.id}&tab=${tab}`, e.id === current?.id, `${e.title} · ${t.date(e.starts_at, { dateStyle: "short" })}`))}
        </nav>
      )}
      {current && (
        <>
          {/* Remounts when the server's numbers change (list check-ins re-render the page). */}
          <DoorStats key={`${current.id}-${stats?.checkedIn}-${stats?.expected}`} eventId={current.id} initial={stats} />
          {/* Door mode: a bottom tab bar on phones (thumb reach), a big segmented bar from md. */}
          <nav
            aria-label={t("door.tabs")}
            className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:static md:gap-1 md:rounded-xl md:border md:bg-muted md:p-1"
          >
            {tabs.map((x) => {
              const Icon = TAB_ICONS[x as keyof typeof TAB_ICONS]
              return (
                <Link
                  key={x}
                  href={`/scan?event=${current.id}&tab=${x}`}
                  aria-current={x === tab ? "page" : undefined}
                  className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground aria-[current=page]:font-medium aria-[current=page]:text-primary md:min-h-11 md:flex-row md:gap-2 md:rounded-lg md:text-sm md:aria-[current=page]:bg-background md:aria-[current=page]:text-foreground md:aria-[current=page]:shadow-sm"
                >
                  <Icon className="size-5 md:size-4" />
                  {t.dynamic(`door.tab.${x}`)}
                </Link>
              )
            })}
          </nav>
          <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
          {tab === "scan" && <Scanner key={current.id} eventId={current.id} />}
          {tab === "guests" && <Guests eventId={current.id} q={q} list={param(sp, "list")} sp={sp} chip={chip} />}
          {tab === "sale" && <Sale eventId={current.id} />}
          {tab === "tickets" && <Tickets eventId={current.id} q={q} />}
          {tab === "members" && <Members eventId={current.id} q={q} who={param(sp, "who")} sp={sp} />}
        </>
      )}
      </div>
    </Page>
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
        <SearchBox size="lg" q={q} label={t("door.searchGuests")} keep={{ event: eventId, tab: "guests", ...(list ? { list } : {}) }} />
        <span className="text-sm text-muted-foreground">{t("door.guestCount", { in: inCount, total: rows.length })}</span>
      </div>
      <nav aria-label={t("door.lists")} className="flex w-fit max-w-full flex-wrap gap-1 justify-self-end rounded-lg bg-muted p-1">
        {chip(withParams(sp, { list: undefined }), !list, t("door.allLists"))}
        {lists?.map((l) => chip(withParams(sp, { list: l.id }), l.id === list, l.name))}
      </nav>
      <ul className="grid gap-2">
        {rows.map((r) => (
          <DoorRow key={r.id} title={r.name} meta={[r.list.name, r.list.door_price > 0 && t("guestlists.atDoor", { price: t.money(r.list.door_price) })].filter(Boolean).join(" · ")} done={!!r.at}>
            <form action={guestCheckIn} className="flex items-center gap-2">
              <input type="hidden" name="event" value={eventId} />
              <input type="hidden" name="entry" value={r.id} />
              <input type="hidden" name="name" value={r.name} />
              <input type="hidden" name="q" value={q ?? ""} />
              <input type="hidden" name="list" value={list ?? ""} />
              {r.at ? (
                <>
                  <Badge>{t("door.inSince", { time: t.date(r.at, { timeStyle: "short" }) })}</Badge>
                  <input type="hidden" name="undo" value="1" />
                  <SubmitButton size="lg" variant="ghost" className="h-11">
                    {t("door.undo")}
                  </SubmitButton>
                </>
              ) : (
                <SubmitButton size="lg" className="h-11 px-6">{t("door.checkIn")}</SubmitButton>
              )}
            </form>
          </DoorRow>
        ))}
        {!rows.length && <li className="text-sm text-muted-foreground">{t("door.noGuests")}</li>}
      </ul>
    </section>
  )
}

// Abendkasse: sell tickets / free amounts, then the night's door sales per payment method (for counting the till).
async function Sale({ eventId }: { eventId: string }) {
  const ctx = await getContext()
  const t = await getT()
  const [offer, sum, stats] = await Promise.all([doorOffer(ctx.org.id, eventId), doorSummary(ctx.org.id, eventId), doorStats(ctx.org.id, eventId)])
  if (!offer) return null
  return (
    <section className="grid gap-6">
      <DoorSale key={eventId} eventId={eventId} types={offer.types.map((ty) => ({ ...ty, left: stats?.left[ty.id] ?? null }))} methods={offer.methods} provider={offer.provider} left={offer.left} currency={offer.types[0]?.currency ?? "eur"} />
      <div className="grid gap-2 rounded-xl border p-4 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-medium">{t("door.sale.summary")}</h3>
          <span className="text-muted-foreground">{t("door.sale.summaryMeta", { sales: sum.sales, tickets: sum.tickets })}</span>
        </div>
        {Object.entries(sum.byMethod).map(([m, x]) => (
          <div key={m} className="flex justify-between gap-2">
            <span>{t.dynamic(`door.sale.method.${m}`)} · {x.count}</span>
            <span className="tabular-nums">{t.money(x.total)}</span>
          </div>
        ))}
        <div className="flex justify-between gap-2 border-t pt-2 font-medium">
          <span>{t("door.sale.total")}</span>
          <span className="tabular-nums">{t.money(sum.total)}</span>
        </div>
      </div>
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
      <SearchBox size="lg" q={q} label={t("door.searchTickets")} keep={{ event: eventId, tab: "tickets" }} />
      <ul className="grid gap-2">
        {(data ?? []).map((k) => (
          <DoorRow key={k.id} title={k.holder_name ?? k.pay_orders?.customer_name ?? "–"} meta={[k.ticket_types?.name, k.code].filter(Boolean).join(" · ")} done={k.status === "used"}>
            {k.status === "used" ? (
              <Badge>{t("door.inSince", { time: k.checked_in_at ? t.date(k.checked_in_at, { timeStyle: "short" }) : "" })}</Badge>
            ) : (
              <form action={ticketDoorCheckIn}>
                <input type="hidden" name="event" value={eventId} />
                <input type="hidden" name="code" value={k.code} />
                <input type="hidden" name="q" value={q ?? ""} />
                <SubmitButton size="lg" className="h-11 px-6">{t("door.checkIn")}</SubmitButton>
              </form>
            )}
          </DoorRow>
        ))}
        {!data?.length && <li className="text-sm text-muted-foreground">{t("door.noTickets")}</li>}
      </ul>
    </section>
  )
}

// Members by name (forgot the card): pick one → the same card as the scanner, with "Einlassen".
async function Members({ eventId, q, who, sp }: { eventId: string; q?: string; who?: string; sp: Record<string, string | string[] | undefined> }) {
  const ctx = await getContext()
  const t = await getT()
  const valid = !!who && /^[0-9a-f-]{36}$/.test(who)
  const [{ data: found }, member] = await Promise.all([
    q ? ctx.supabase.rpc("member_door_search", { p_event: eventId, p_q: q }) : Promise.resolve({ data: [] }),
    valid ? memberDoor(ctx.supabase, eventId, { contactId: who }, false).catch((): MemberAtDoor => ({ result: "invalid" })) : null,
  ])
  return (
    <section className="grid gap-3">
      <SearchBox size="lg" q={q} label={t("door.searchMembers")} keep={{ event: eventId, tab: "members" }} />
      {member && (
        <MemberCard t={t} m={member}>
          <form action={memberDoorCheckIn}>
            <input type="hidden" name="event" value={eventId} />
            <input type="hidden" name="contact" value={who} />
            <input type="hidden" name="q" value={q ?? ""} />
            <SubmitButton size="lg">{t("door.member.admit")}</SubmitButton>
          </form>
        </MemberCard>
      )}
      {q && (
        <ul className="grid gap-1">
          {(found ?? []).map((m) => (
            <li key={m.contact_id}>
              <Link
                href={withParams(sp, { who: m.contact_id })}
                aria-current={m.contact_id === who ? "true" : undefined}
                className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2 hover:bg-muted aria-[current=true]:bg-muted"
              >
                <span className="font-medium">{m.name}</span>
                {m.member_no && <span className="text-muted-foreground">{t("membership.numberShort", { number: m.member_no })}</span>}
              </Link>
            </li>
          ))}
          {!found?.length && <li className="text-sm text-muted-foreground">{t("door.member.noneFound")}</li>}
        </ul>
      )}
    </section>
  )
}

export const instant = false

// One person at the door: big name, one muted line, the action on the right (wraps below on narrow phones).
function DoorRow({ title, meta, done, children }: { title: string; meta?: string; done?: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${done ? "bg-muted/50" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium">{title}</p>
        {meta && <p className="truncate text-sm text-muted-foreground">{meta}</p>}
      </div>
      {children}
    </li>
  )
}
