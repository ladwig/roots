// Door sales (Abendkasse), server side (service role; callers check tickets.scan). Shared by the door screen and the
// API: sell = order + reserved tickets at the door's prices, pay = src/payments/pos.ts, paid → tickets let in.
import { bookEntry } from "@/cashbook/server"
import { orgT } from "@/i18n/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { siteUrl } from "@/lib/url"
import { cancelCollect, collect, posMethods, posStatus, type Collect } from "@/payments/pos"
import { createOrder } from "@/payments/server"
import { lineTotal, readDoor, type DoorLine, type DoorMethod } from "./door-fields"

const db = () => createAdminClient()
const RESERVE_MINUTES = 31 // like the shop: a QR checkout lives 30 minutes
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** What the door can sell: shop types (hidden ones too) at today's price, seats left, the event's payment methods. */
export async function doorOffer(orgId: string, eventId: string) {
  const [{ data: ev }, { data: types }, { data: offer }, { data: left }, can] = await Promise.all([
    db().from("events").select("id, title, door").eq("id", eventId).eq("org_id", orgId).is("deleted_at", null).maybeSingle(),
    db().from("ticket_types").select("id, name, price, currency, active").eq("event_id", eventId).eq("org_id", orgId).is("guest_list_id", null).eq("for_members", false).eq("active", true).order("position").order("created_at"),
    db().rpc("ticket_offer", { p_event: eventId }),
    db().rpc("event_left", { p_event: eventId }),
    posMethods(orgId),
  ])
  if (!ev) return null
  const settings = readDoor(ev.door)
  const now = new Map((offer ?? []).map((o) => [o.type_id, o]))
  return {
    event: { id: ev.id, title: ev.title },
    types: (types ?? []).map((t) => ({ id: t.id, name: t.name, price: now.get(t.id)?.price ?? t.price, currency: t.currency })),
    left: left as number | null, // null = no event capacity
    methods: settings.methods.filter((m) => can[m] && (m !== "terminal" || settings.reader_id)),
    provider: can.provider, // "stripe" | "sumup": names the QR / terminal buttons
    settings,
  }
}

export type DoorSale = { orgId: string; eventId: string; lines: DoorLine[]; name?: string | null; email?: string | null; soldBy: string | null; clientId?: string | null; soldAt?: string | null }

/**
 * Creates the order + reserved tickets. Throws message keys. `clientId` (the device's id for an offline cash sale)
 * makes it idempotent: sending the same sale again returns the first order (`existing`).
 */
export async function sellAtDoor(s: DoorSale): Promise<{ orderId: string; total: number; existing?: boolean }> {
  if (s.clientId) {
    const { data: dup } = await db().from("pay_orders").select("id, amount_total").eq("org_id", s.orgId).eq("metadata->>client_id", s.clientId).maybeSingle()
    if (dup) return { orderId: dup.id, total: dup.amount_total, existing: true }
  }
  const email = s.email?.trim().toLowerCase() || null
  if (email && !EMAIL.test(email)) throw new Error("errors.invalid_input")
  const offer = await doorOffer(s.orgId, s.eventId)
  if (!offer) throw new Error("tickets.notOnSale")
  const types = new Map(offer.types.map((t) => [t.id, t]))
  if (s.lines.some((l) => l.typeId && !types.has(l.typeId))) throw new Error("tickets.notOnSale")
  const token = crypto.randomUUID()
  const orderId = await createOrder({
    orgId: s.orgId,
    sourceModule: "tickets",
    sourceId: s.eventId,
    currency: offer.types[0]?.currency ?? "eur",
    customerEmail: email ?? undefined,
    customerName: s.name?.trim() || undefined,
    metadata: { ticket_token: token, door: true, sold_by: s.soldBy, ...(s.clientId ? { client_id: s.clientId, sold_at: s.soldAt ?? null } : {}) },
    items: s.lines.map((l) => ({
      description: (l.typeId ? [offer.event.title, types.get(l.typeId)!.name, l.label].filter(Boolean).join(" · ") : l.label).slice(0, 200),
      quantity: l.quantity,
      unitAmount: l.price,
      sourceId: l.typeId ?? undefined,
    })),
  })
  const tickets = s.lines.flatMap((l) => (l.typeId ? Array.from({ length: l.quantity }, () => ({ type_id: l.typeId, price: l.price, holder_name: s.name?.trim() || null })) : []))
  if (tickets.length) {
    const { error } = await db().rpc("door_reserve_tickets", { p_order: orderId, p_event: s.eventId, p_items: tickets, p_minutes: RESERVE_MINUTES })
    if (error) {
      await db().from("pay_orders").update({ status: "cancelled" }).eq("id", orderId)
      throw new Error("tickets.notOnSale")
    }
  }
  return { orderId, total: lineTotal(s.lines) }
}

/** Collects a door order with one of the event's methods; cash goes into the event's cash book account. */
export async function payAtDoor(orgId: string, orderId: string, method: DoorMethod): Promise<Collect> {
  const { data: order } = await db().from("pay_orders").select("id, source_id, amount_total, metadata, orgs(slug, site_domain)").eq("id", orderId).eq("org_id", orgId).maybeSingle()
  const meta = (order?.metadata ?? {}) as Record<string, unknown>
  if (!order?.source_id || !meta.door) throw new Error("payments.notOpen")
  const offer = await doorOffer(orgId, order.source_id)
  if (!offer?.methods.includes(method)) throw new Error("payments.notReady")
  const r = await collect(orderId, method, {
    readerId: offer.settings.reader_id ?? undefined,
    successUrl: siteUrl(order.orgs!.slug, `/t/${orderId}?k=${meta.ticket_token}&paid=1`, order.orgs!.site_domain),
  })
  if (r.status === "paid" && method === "cash" && order.amount_total > 0 && offer.settings.cash_account_id) {
    const t = await orgT(orgId)
    const booked = await bookEntry(db(), orgId, offer.settings.cash_account_id, {
      booked_on: new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }),
      amount_cents: order.amount_total,
      description: t("door.sale.cashEntry", { event: offer.event.title }).slice(0, 300),
      category: null,
      sphere: null,
      counterparty: null,
    })
    if ("error" in booked) console.error("door cash entry", orderId, booked)
  }
  return r
}

/** A door order's state (asks the provider while a card/QR payment runs). */
export async function doorSaleStatus(orgId: string, orderId: string) {
  const { data } = await db().from("pay_orders").select("id, metadata").eq("id", orderId).eq("org_id", orgId).maybeSingle()
  if (!(data?.metadata as Record<string, unknown> | null)?.door) return null
  return posStatus(orderId)
}

export async function cancelDoorSale(orgId: string, orderId: string) {
  const { data } = await db().from("pay_orders").select("id, status, metadata").eq("id", orderId).eq("org_id", orgId).maybeSingle()
  if (!(data?.metadata as Record<string, unknown> | null)?.door) throw new Error("errors.not_allowed")
  await cancelCollect(orderId)
}

/** Paid door sales of an event: count, tickets, sum per method (for the end-of-night count). */
export async function doorSummary(orgId: string, eventId: string) {
  const { data } = await db()
    .from("pay_orders")
    .select("amount_total, metadata, tickets(id)")
    .eq("org_id", orgId)
    .eq("source_module", "tickets")
    .eq("source_id", eventId)
    .eq("metadata->>door", "true")
    .in("status", ["paid", "partially_refunded"])
  const by: Record<string, { count: number; total: number }> = {}
  let tickets = 0
  for (const o of data ?? []) {
    const m = String((o.metadata as Record<string, unknown>)?.pos_method ?? "cash")
    by[m] = { count: (by[m]?.count ?? 0) + 1, total: (by[m]?.total ?? 0) + o.amount_total }
    tickets += o.tickets.length
  }
  return { sales: data?.length ?? 0, tickets, total: Object.values(by).reduce((s, x) => s + x.total, 0), byMethod: by }
}

export type DoorStats = {
  checkedIn: number
  expected: number
  sellable: number | null // null = unlimited
  rows: { key: string; name: string; kind: "shop" | "guests" | "members"; checkedIn: number; expected: number | null; left: number | null }[]
  doorIn: number
  left: Record<string, number | null> // per shop type id
}

/** The door's stats bar: who's in, who's still expected, what can still be sold (per type, guests, members). */
export async function doorStats(orgId: string, eventId: string): Promise<DoorStats | null> {
  const { data: ev } = await db().from("events").select("id").eq("id", eventId).eq("org_id", orgId).maybeSingle()
  if (!ev) return null
  const { data } = await db().rpc("door_stats", { p_event: eventId })
  const s = data as { types: { id: string; name: string; kind: "shop" | "guests" | "members"; expected: number; checked_in: number; left: number | null }[]; permanent_in: number; door_in: number; left: number | null }
  const shop = s.types.filter((x) => x.kind === "shop")
  const guests = s.types.filter((x) => x.kind === "guests")
  const members = s.types.filter((x) => x.kind === "members")
  const sum = (l: typeof s.types, k: "expected" | "checked_in") => l.reduce((n, x) => n + x[k], 0)
  const rows: DoorStats["rows"] = shop.map((x) => ({ key: x.id, name: x.name, kind: "shop", checkedIn: x.checked_in, expected: x.expected, left: x.left }))
  if (guests.length || s.permanent_in) rows.push({ key: "guests", name: "", kind: "guests", checkedIn: sum(guests, "checked_in") + s.permanent_in, expected: sum(guests, "expected") + s.permanent_in, left: null })
  if (members.length) rows.push({ key: "members", name: "", kind: "members", checkedIn: sum(members, "checked_in"), expected: null, left: null })
  const checkedIn = rows.reduce((n, r) => n + r.checkedIn, 0)
  // Members aren't expected in advance: the ones let in count as expected too.
  const expected = rows.reduce((n, r) => n + (r.expected ?? r.checkedIn), 0)
  // The smaller of the event's seats left and what all ticket types still allow (each only if limited).
  const byTypes = shop.length && shop.every((x) => x.left !== null) ? shop.reduce((n, x) => n + (x.left ?? 0), 0) : null
  const sellable = s.left === null ? byTypes : byTypes === null ? s.left : Math.min(s.left, byTypes)
  return { checkedIn, expected, sellable, rows, doorIn: s.door_in, left: Object.fromEntries(shop.map((x) => [x.id, x.left])) }
}
