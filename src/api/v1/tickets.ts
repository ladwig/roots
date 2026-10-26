import { z } from "zod"
import { cancelTicket } from "@/tickets/server"
import { checkCode, checkTicketType, checkTier, CODE_KINDS, MAX_PRICE, normalizeCode } from "@/tickets/fields"
import { ApiError, dbError, endpoint, list, notFound, page, paged, uuid, type Endpoint } from "../core"
import { clean, eventOf, invalid } from "./events"
import { ts, type Db } from "./shared"

const dt = z.iso.datetime({ offset: true }).describe("ISO 8601 time")
const ok = z.object({ ok: z.literal(true) })
const cents = z.number().int().min(0).max(MAX_PRICE).describe("Cents")
const quota = z.number().int().min(1).nullable().describe("Max. tickets (null = unlimited)")

const Tier = z.object({
  id: uuid,
  type_id: uuid,
  name: z.string(),
  price: z.number().int().describe("Cents"),
  quota: z.number().int().nullable(),
  sales_end: ts.nullable(),
  position: z.number().int().describe("Order: the first tier not sold out or ended is the current price"),
})
const TIER_COLS = "id, type_id, name, price, quota, sales_end, position"
const TicketType = z.object({
  id: uuid,
  event_id: uuid,
  name: z.string(),
  description: z.string().nullable(),
  price: z.number().int().describe("Base price in cents (tiers may override)"),
  currency: z.string(),
  quota: z.number().int().nullable(),
  sales_start: ts.nullable(),
  sales_end: ts.nullable(),
  active: z.boolean().describe("false = sales paused (sold tickets stay valid)"),
  hidden: z.boolean().describe("Only offered with a code that unlocks it"),
  remaining: z.number().int().nullable().describe("Left to sell (null = unlimited; 0 when paused)"),
  tiers: z.array(Tier).describe("Price tiers (Early Bird → Regular …)"),
})
const TYPE_COLS = `id, event_id, name, description, price, currency, quota, sales_start, sales_end, active, hidden, tiers:ticket_tiers(${TIER_COLS})`
const TypeFields = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).nullable(),
  price: cents,
  quota,
  sales_start: dt.nullable(),
  sales_end: dt.nullable(),
  hidden: z.boolean(),
  active: z.boolean().describe("false pauses sales"),
})
const TierFields = z.object({
  name: z.string().min(1).max(100),
  price: cents,
  quota,
  sales_end: dt.nullable(),
  position: z.number().int().min(-10000).max(10000),
})

const Code = z.object({
  id: uuid,
  event_id: uuid,
  code: z.string(),
  kind: z.enum(CODE_KINDS).describe("percent / amount (cents) off, or none (only unlocks hidden types)"),
  value: z.number().int(),
  max_uses: z.number().int().nullable().describe("Max. tickets bought with it"),
  valid_from: ts.nullable(),
  valid_until: ts.nullable(),
  type_ids: z.array(uuid).describe("Ticket types it applies to (empty = all)"),
  active: z.boolean(),
  created_at: ts,
  updated_at: ts,
})
const CODE_COLS = "id, event_id, code, kind, value, max_uses, valid_from, valid_until, type_ids, active, created_at, updated_at"
const CodeFields = z.object({
  code: z.string().max(60).describe("3–40 characters A–Z, 0–9, hyphens (upper-cased, spaces → hyphens)"),
  kind: z.enum(CODE_KINDS),
  value: z.number().int().min(0).describe("percent: 1–100; amount: cents; none: ignored"),
  max_uses: z.number().int().min(1).nullable().describe("Max. tickets via this code (discounts only; ignored for kind none – the ticket type's quota is the limit there)"),
  valid_from: dt.nullable(),
  valid_until: dt.nullable(),
  type_ids: z.array(uuid).max(100),
  active: z.boolean(),
})

const Ticket = z.object({
  id: uuid,
  event_id: uuid,
  code: z.string().describe("Code in the QR code"),
  status: z.enum(["valid", "used", "reserved", "void"]),
  holder_name: z.string().nullable(),
  type_id: uuid,
  tier_id: uuid.nullable(),
  code_id: uuid.nullable().describe("Promo code used"),
  price: z.number().int().nullable().describe("Paid price in cents"),
  contact_id: uuid.nullable(),
  order_id: uuid,
  checked_in_at: ts.nullable(),
  created_at: ts,
})
const TICKET_COLS = "id, event_id, code, status, holder_name, type_id, tier_id, code_id, price, contact_id, order_id, checked_in_at, created_at"

const WAITLIST_STATUSES = ["waiting", "offered", "claimed", "expired", "cancelled"] as const
const WaitlistEntry = z.object({
  id: uuid,
  event_id: uuid,
  name: z.string(),
  email: z.string(),
  quantity: z.number().int().describe("Seats wanted"),
  status: z.enum(WAITLIST_STATUSES).describe("offered = claim link sent, seats held until offered_until"),
  offered_until: ts.nullable(),
  created_at: ts,
})
const WAITLIST_COLS = "id, event_id, name, email, quantity, status, offered_until, created_at"

const Order = z.object({
  id: uuid,
  status: z.enum(["open", "paid", "failed", "expired", "cancelled", "refunded", "partially_refunded"]),
  amount_total: z.number().int().describe("Cents"),
  currency: z.string(),
  customer_email: z.string().nullable(),
  customer_name: z.string().nullable(),
  paid_at: ts.nullable(),
  created_at: ts,
})

// Ticket type with its tiers and what's left (ticket_availability lists active types only → paused = 0).
async function getTypes(db: Db, orgId: string, eventId: string, id?: string) {
  let q = db.from("ticket_types").select(TYPE_COLS).eq("event_id", eventId).eq("org_id", orgId).order("position").order("price").order("position", { referencedTable: "tiers" })
  if (id) q = q.eq("id", id)
  const [{ data: types }, { data: avail }] = await Promise.all([q, db.rpc("ticket_availability", { p_event: eventId })])
  const left = new Map(avail?.map((a) => [a.type_id, a.remaining]))
  return (types ?? []).map((t) => ({ ...t, remaining: t.active ? (left.get(t.id) ?? null) : 0 }))
}
async function getType(db: Db, orgId: string, id: string) {
  const { data } = await db.from("ticket_types").select("event_id").eq("id", id).eq("org_id", orgId).maybeSingle()
  if (!data) throw notFound()
  return (await getTypes(db, orgId, data.event_id, id))[0]
}
async function typesOf(db: Db, orgId: string, eventId: string, ids: string[] | undefined) {
  if (!ids?.length) return
  const { data } = await db.from("ticket_types").select("id").eq("event_id", eventId).eq("org_id", orgId).in("id", ids)
  if ((data?.length ?? 0) !== new Set(ids).size) throw new ApiError(422, "invalid_reference", "type_ids must be ticket types of this event.")
}
const codeRow = (body: Partial<z.infer<typeof CodeFields>>) => {
  const row = clean(body)
  if (row.code) row.code = normalizeCode(row.code)
  if (row.kind === "none") Object.assign(row, { value: 0, max_uses: null }) // unlock-only: the ticket type's quota is the limit
  return row
}
const hasTickets = (code: string, message: string) => new ApiError(409, code, message)

export const endpoints: Endpoint[] = [
  // Ticket types + tiers
  endpoint({
    method: "GET",
    path: "/events/{id}/ticket-types",
    permission: "tickets.view",
    tag: "Tickets",
    summary: "Ticket types of an event, with tiers and what's left",
    response: z.object({ data: z.array(TicketType) }),
    async handler({ db, orgId, params }) {
      await eventOf(db, orgId, params.id)
      return { data: await getTypes(db, orgId, params.id) }
    },
  }),
  endpoint({
    method: "GET",
    path: "/ticket-types/{id}",
    permission: "tickets.view",
    tag: "Tickets",
    summary: "Get a ticket type",
    response: TicketType,
    handler: ({ db, orgId, params }) => getType(db, orgId, params.id),
  }),
  endpoint({
    method: "POST",
    path: "/events/{id}/ticket-types",
    permission: "tickets.manage",
    tag: "Tickets",
    summary: "Create a ticket type",
    description: "On sale once the event is published (within sales_start/sales_end). Ask for buyer names / max per order via PATCH /events/{id}.",
    body: TypeFields.partial().required({ name: true, price: true }).strict(),
    response: TicketType,
    status: 201,
    async handler({ db, orgId, params, body }) {
      await eventOf(db, orgId, params.id)
      const row = clean(body)
      const err = checkTicketType({ name: row.name ?? "", quota: row.quota ?? null, sales_start: row.sales_start ?? null, sales_end: row.sales_end ?? null })
      if (err) throw invalid(err)
      const { data, error } = await db
        .from("ticket_types")
        .insert({ ...row, name: row.name!, price: row.price!, org_id: orgId, event_id: params.id })
        .select("id")
        .single()
      if (error) throw dbError(error)
      return getType(db, orgId, data.id)
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/ticket-types/{id}",
    permission: "tickets.manage",
    tag: "Tickets",
    summary: "Update a ticket type",
    description: "Only the given fields change. `active: false` pauses sales, `true` resumes them (sold tickets stay valid).",
    body: TypeFields.partial().strict(),
    response: TicketType,
    async handler({ db, orgId, params, body }) {
      const { data: old } = await db.from("ticket_types").select("name, quota, sales_start, sales_end").eq("id", params.id).eq("org_id", orgId).maybeSingle()
      if (!old) throw notFound()
      const row = clean(body)
      const err = checkTicketType({ ...old, ...row, name: row.name ?? (row.name === null ? "" : old.name) })
      if (err) throw invalid(err)
      const { error } = await db
        .from("ticket_types")
        .update({ ...row, name: row.name ?? undefined })
        .eq("id", params.id)
        .eq("org_id", orgId)
      if (error) throw dbError(error)
      return getType(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/ticket-types/{id}",
    permission: "tickets.manage",
    tag: "Tickets",
    summary: "Delete a ticket type",
    description: "Only without tickets (409 `type_has_tickets`): pause it instead (PATCH `active: false`).",
    response: ok,
    async handler({ db, orgId, params }) {
      const { data, error } = await db.from("ticket_types").delete().eq("id", params.id).eq("org_id", orgId).select("id")
      if (error) throw error.code === "23503" ? hasTickets("type_has_tickets", "This type has tickets: pause it instead.") : dbError(error)
      if (!data.length) throw notFound()
      return { ok: true as const }
    },
  }),
  endpoint({
    method: "POST",
    path: "/ticket-types/{id}/tiers",
    permission: "tickets.manage",
    tag: "Tickets",
    summary: "Add a price tier",
    description: "Tiers (Early Bird → Regular …) in `position` order; the first one not sold out (own quota) or ended (sales_end) sets the price.",
    body: TierFields.partial().required({ name: true, price: true }).strict(),
    response: Tier,
    status: 201,
    async handler({ db, orgId, params, body }) {
      const { data: type } = await db.from("ticket_types").select("id").eq("id", params.id).eq("org_id", orgId).maybeSingle()
      if (!type) throw notFound()
      const row = { position: 0, ...clean(body) }
      const err = checkTier({ name: row.name ?? "", quota: row.quota ?? null, position: row.position })
      if (err) throw invalid(err)
      const { data, error } = await db
        .from("ticket_tiers")
        .insert({ ...row, name: row.name!, price: row.price!, org_id: orgId, type_id: params.id })
        .select(TIER_COLS)
        .single()
      if (error) throw dbError(error)
      return data
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/ticket-tiers/{id}",
    permission: "tickets.manage",
    tag: "Tickets",
    summary: "Update a price tier",
    body: TierFields.partial().strict(),
    response: Tier,
    async handler({ db, orgId, params, body }) {
      const { data: old } = await db.from("ticket_tiers").select("name, quota, position").eq("id", params.id).eq("org_id", orgId).maybeSingle()
      if (!old) throw notFound()
      const row = clean(body)
      const err = checkTier({ ...old, ...row, name: row.name ?? (row.name === null ? "" : old.name) })
      if (err) throw invalid(err)
      const { data, error } = await db
        .from("ticket_tiers")
        .update({ ...row, name: row.name ?? undefined })
        .eq("id", params.id)
        .eq("org_id", orgId)
        .select(TIER_COLS)
        .single()
      if (error) throw dbError(error)
      return data
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/ticket-tiers/{id}",
    permission: "tickets.manage",
    tag: "Tickets",
    summary: "Delete a price tier",
    description: "Only without tickets sold in it (409 `tier_has_tickets`).",
    response: ok,
    async handler({ db, orgId, params }) {
      const { data, error } = await db.from("ticket_tiers").delete().eq("id", params.id).eq("org_id", orgId).select("id")
      if (error) throw error.code === "23503" ? hasTickets("tier_has_tickets", "Tickets were sold in this tier.") : dbError(error)
      if (!data.length) throw notFound()
      return { ok: true as const }
    },
  }),

  // Promo codes / unlock links
  endpoint({
    method: "GET",
    path: "/events/{id}/ticket-codes",
    permission: "tickets.view",
    tag: "Tickets",
    summary: "Promo codes of an event",
    description: "Buyers use a code in the shop or via the link /e/<event slug>?code=<code>.",
    response: z.object({ data: z.array(Code) }),
    async handler({ db, orgId, params }) {
      await eventOf(db, orgId, params.id)
      const { data } = await db.from("ticket_codes").select(CODE_COLS).eq("event_id", params.id).eq("org_id", orgId).order("created_at").limit(1000)
      return { data: data ?? [] }
    },
  }),
  endpoint({
    method: "POST",
    path: "/events/{id}/ticket-codes",
    permission: "tickets.manage",
    tag: "Tickets",
    summary: "Create a promo code",
    description: "409 `code_taken` if the event already has this code.",
    body: CodeFields.partial().required({ code: true, kind: true }).strict(),
    response: Code,
    status: 201,
    async handler({ db, orgId, params, body }) {
      await eventOf(db, orgId, params.id)
      const row = { value: 0, max_uses: null, valid_from: null, valid_until: null, ...codeRow(body) }
      const err = checkCode({ ...row, code: row.code ?? "", kind: row.kind! })
      if (err) throw invalid(err)
      await typesOf(db, orgId, params.id, row.type_ids)
      const { data, error } = await db
        .from("ticket_codes")
        .insert({ ...row, code: row.code!, kind: row.kind!, org_id: orgId, event_id: params.id })
        .select(CODE_COLS)
        .single()
      if (error) throw error.code === "23505" ? new ApiError(409, "code_taken", "This event already has this code.") : dbError(error)
      return data
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/ticket-codes/{id}",
    permission: "tickets.manage",
    tag: "Tickets",
    summary: "Update a promo code",
    description: "Only the given fields change; `active: false` switches it off.",
    body: CodeFields.partial().strict(),
    response: Code,
    async handler({ db, orgId, params, body }) {
      const { data: old } = await db.from("ticket_codes").select("event_id, code, kind, value, max_uses, valid_from, valid_until").eq("id", params.id).eq("org_id", orgId).maybeSingle()
      if (!old) throw notFound()
      const row = codeRow(body)
      const err = checkCode({ ...old, ...row, code: row.code ?? (row.code === null ? "" : old.code), kind: row.kind ?? old.kind })
      if (err) throw invalid(err)
      await typesOf(db, orgId, old.event_id, row.type_ids)
      const { data, error } = await db
        .from("ticket_codes")
        .update({ ...row, code: row.code ?? undefined })
        .eq("id", params.id)
        .eq("org_id", orgId)
        .select(CODE_COLS)
        .single()
      if (error) throw error.code === "23505" ? new ApiError(409, "code_taken", "This event already has this code.") : dbError(error)
      return data
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/ticket-codes/{id}",
    permission: "tickets.manage",
    tag: "Tickets",
    summary: "Delete a promo code",
    description: "Only if no tickets were bought with it (409 `code_used`): switch it off instead (PATCH `active: false`).",
    response: ok,
    async handler({ db, orgId, params }) {
      const { data, error } = await db.from("ticket_codes").delete().eq("id", params.id).eq("org_id", orgId).select("id")
      if (error) throw error.code === "23503" ? hasTickets("code_used", "Tickets were bought with this code.") : dbError(error)
      if (!data.length) throw notFound()
      return { ok: true as const }
    },
  }),

  // Tickets + door
  endpoint({
    method: "GET",
    path: "/events/{id}/tickets",
    permission: "tickets.view",
    tag: "Tickets",
    summary: "Tickets of an event",
    description: "Sold and checked-in tickets (reserved = in an unpaid checkout, only with status=reserved).",
    query: page.extend({
      status: z.enum(["valid", "used", "reserved", "void"]).optional(),
      q: z.string().max(100).optional().describe("Search in code and holder name"),
    }),
    response: list(Ticket),
    async handler({ db, orgId, params, query }) {
      await eventOf(db, orgId, params.id)
      let q = db.from("tickets").select(TICKET_COLS).eq("event_id", params.id).eq("org_id", orgId).order("created_at").range(query.offset, query.offset + query.limit)
      q = query.status ? q.eq("status", query.status) : q.in("status", ["valid", "used"])
      const s = query.q?.replace(/[%,()*]/g, "").trim()
      if (s) q = q.or(`code.ilike.%${s}%,holder_name.ilike.%${s}%`)
      const { data } = await q
      return paged(data, query)
    },
  }),
  endpoint({
    method: "GET",
    path: "/tickets/{id}",
    permission: "tickets.view",
    tag: "Tickets",
    summary: "Get a ticket",
    response: Ticket,
    async handler({ db, orgId, params }) {
      const { data } = await db.from("tickets").select(TICKET_COLS).eq("id", params.id).eq("org_id", orgId).maybeSingle()
      if (!data) throw notFound()
      return data
    },
  }),
  endpoint({
    method: "POST",
    path: "/tickets/{id}/cancel",
    permission: "payments.refund",
    tag: "Tickets",
    summary: "Cancel one ticket and refund its price",
    description:
      "Refunds what this ticket cost through the payment provider (if its order is paid and something is left to refund; the service fee stays), then voids the ticket: its QR code no longer gets in. Other tickets of the order stay valid. `refund` = succeeded / pending / failed, or null when nothing was paid.",
    body: z.object({ reason: z.string().trim().max(500).optional() }).strict(),
    response: z.object({ refund: z.enum(["succeeded", "pending", "failed"]).nullable(), ticket: Ticket }),
    async handler({ db, orgId, params, body }) {
      let refund: string | null
      try {
        refund = await cancelTicket(orgId, params.id, body.reason)
      } catch (e) {
        const key = e instanceof Error ? e.message : ""
        if (key === "errors.not_found") throw notFound()
        if (key === "tickets.notCancellable") throw new ApiError(422, "not_cancellable", "This ticket is already void or cancelled.")
        console.error("api cancel ticket", e)
        throw new ApiError(502, "provider_error", "The payment provider refused the refund.")
      }
      const { data } = await db.from("tickets").select(TICKET_COLS).eq("id", params.id).eq("org_id", orgId).single()
      return { refund: refund as "succeeded" | "pending" | "failed" | null, ticket: data! }
    },
  }),
  endpoint({
    method: "POST",
    path: "/events/{id}/check-in",
    permission: "tickets.scan",
    tag: "Tickets",
    summary: "Check in a ticket by its code",
    description: "Same as the door scanner: `ok` = let in (now marked used), `used` = already checked in (at `checked_in_at`), `invalid` = unknown, unpaid or void code.",
    body: z.object({ code: z.string().min(1).max(40) }).strict(),
    response: z.object({
      result: z.enum(["ok", "used", "invalid"]),
      holder_name: z.string().nullable(),
      type_name: z.string().nullable(),
      checked_in_at: ts.nullable(),
    }),
    async handler({ db, orgId, params, body }) {
      await eventOf(db, orgId, params.id)
      const code = body.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20)
      if (!code) return { result: "invalid" as const, holder_name: null, type_name: null, checked_in_at: null }
      const { data, error } = await db.rpc("check_in_ticket", { p_event: params.id, p_code: code }).maybeSingle()
      if (error || !data) throw error ? dbError(error) : new ApiError(500, "internal", "Check-in failed.")
      return data
    },
  }),
  endpoint({
    method: "GET",
    path: "/events/{id}/scan-list",
    permission: "tickets.scan",
    tag: "Tickets",
    summary: "All valid and used ticket codes of an event (offline scanning)",
    description: "For door devices that check codes offline; send the check-ins later with POST /events/{id}/check-in (`used` there = someone else let the ticket in already).",
    response: z.object({
      data: z.array(z.object({ code: z.string(), status: z.enum(["valid", "used"]), holder_name: z.string().nullable(), type_name: z.string().nullable() })),
    }),
    async handler({ db, orgId, params }) {
      await eventOf(db, orgId, params.id)
      const out: { code: string; status: string; holder_name: string | null; type_name: string | null }[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await db
          .from("tickets")
          .select("code, status, holder_name, ticket_types(name)")
          .eq("event_id", params.id)
          .eq("org_id", orgId)
          .in("status", ["valid", "used"])
          .order("id")
          .range(from, from + 999)
        data?.forEach((k) => out.push({ code: k.code, status: k.status, holder_name: k.holder_name, type_name: k.ticket_types?.name ?? null }))
        if (!data || data.length < 1000) return { data: out }
      }
    },
  }),

  // Waiting list + orders
  endpoint({
    method: "GET",
    path: "/events/{id}/waitlist",
    permission: "tickets.view",
    tag: "Tickets",
    summary: "Waiting list of an event",
    description: "People who signed up while the event was full, in order. Free seats are offered automatically (claim link by email, held 24 h).",
    query: page.extend({ status: z.enum(WAITLIST_STATUSES).optional().describe("Default: all except cancelled") }),
    response: list(WaitlistEntry),
    async handler({ db, orgId, params, query }) {
      await eventOf(db, orgId, params.id)
      let q = db.from("event_waitlist").select(WAITLIST_COLS).eq("event_id", params.id).eq("org_id", orgId).order("created_at").range(query.offset, query.offset + query.limit)
      q = query.status ? q.eq("status", query.status) : q.neq("status", "cancelled")
      const { data } = await q
      return paged(data, query)
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/waitlist/{id}",
    permission: "tickets.manage",
    tag: "Tickets",
    summary: "Take someone off the waiting list",
    description: "Sets the entry to cancelled; seats held for an open offer go to the next in line. Only waiting/offered entries (409 `not_waiting`).",
    response: WaitlistEntry,
    async handler({ db, orgId, params }) {
      const { data, error } = await db
        .from("event_waitlist")
        .update({ status: "cancelled" })
        .eq("id", params.id)
        .eq("org_id", orgId)
        .in("status", ["waiting", "offered"])
        .select(WAITLIST_COLS)
        .maybeSingle()
      if (error) throw dbError(error)
      if (data) return data
      const { data: exists } = await db.from("event_waitlist").select("id").eq("id", params.id).eq("org_id", orgId).maybeSingle()
      throw exists ? new ApiError(409, "not_waiting", "This entry is no longer waiting.") : notFound()
    },
  }),
  endpoint({
    method: "GET",
    path: "/events/{id}/orders",
    permission: "tickets.view",
    tag: "Tickets",
    summary: "Ticket orders of an event",
    description: "Orders from the ticket shop (open = checkout not finished). Refunds and payment details: Payments API.",
    query: page.extend({ status: Order.shape.status.optional() }),
    response: list(Order),
    async handler({ db, orgId, params, query }) {
      await eventOf(db, orgId, params.id)
      let q = db
        .from("pay_orders")
        .select("id, status, amount_total, currency, customer_email, customer_name, paid_at, created_at")
        .eq("org_id", orgId)
        .eq("source_module", "tickets")
        .eq("source_id", params.id)
        .order("created_at", { ascending: false })
        .range(query.offset, query.offset + query.limit)
      if (query.status) q = q.eq("status", query.status)
      const { data } = await q
      return paged(data, query)
    },
  }),
]
