// API v1 endpoints. Every handler filters by orgId (see core.ts). Add an endpoint = one entry here.
import { z } from "zod"
import { readContact } from "@/app/(app)/contacts/fields"
import { loadFields } from "@/lib/custom-fields"
import { ApiError, endpoint, list, notFound, page, paged, uuid, type Endpoint } from "./core"

const ts = z.string().describe("ISO 8601 timestamp")
const Event = z.object({
  id: uuid,
  title: z.string(),
  slug: z.string(),
  status: z.enum(["draft", "published", "cancelled"]),
  starts_at: ts,
  ends_at: ts.nullable(),
  venue_name: z.string().nullable(),
  venue_address: z.string().nullable(),
  description: z.string().nullable(),
  capacity: z.number().int().nullable(),
  created_at: ts,
  updated_at: ts,
})
const EVENT_COLS = "id, title, slug, status, starts_at, ends_at, venue_name, venue_address, description, capacity, created_at, updated_at"

const TicketType = z.object({
  id: uuid,
  name: z.string(),
  description: z.string().nullable(),
  price: z.number().int().describe("Base price in cents (tiers may override)"),
  currency: z.string(),
  quota: z.number().int().nullable(),
  sales_start: ts.nullable(),
  sales_end: ts.nullable(),
  active: z.boolean(),
  hidden: z.boolean(),
  remaining: z.number().int().nullable().describe("Left to sell (null = unlimited)"),
})

const Ticket = z.object({
  id: uuid,
  code: z.string().describe("Code in the QR code"),
  status: z.enum(["valid", "used", "reserved", "void"]),
  holder_name: z.string().nullable(),
  type_id: uuid,
  price: z.number().int().nullable().describe("Paid price in cents"),
  contact_id: uuid.nullable(),
  order_id: uuid,
  checked_in_at: ts.nullable(),
  created_at: ts,
})
const TICKET_COLS = "id, code, status, holder_name, type_id, price, contact_id, order_id, checked_in_at, created_at"

const Custom = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).describe("Custom fields of the org: { key: value }")
const Contact = z.object({
  id: uuid,
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  company: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  street: z.string().nullable(),
  postal_code: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable().describe("ISO 3166-1 alpha-2, e.g. DE"),
  birthday: z.string().nullable().describe("YYYY-MM-DD"),
  tags: z.array(z.string()),
  custom: Custom,
  created_at: ts,
  updated_at: ts,
})
const CONTACT_COLS = "id, first_name, last_name, company, email, phone, street, postal_code, city, country, birthday, tags, custom, created_at, updated_at"
const ContactInput = z
  .object({
    first_name: z.string().max(100),
    last_name: z.string().max(100),
    company: z.string().max(200),
    email: z.string().max(320),
    phone: z.string().max(50),
    street: z.string().max(200),
    postal_code: z.string().max(20),
    city: z.string().max(100),
    country: z.string().max(60).describe("ISO code or country name"),
    birthday: z.string().max(10).describe("YYYY-MM-DD or DD.MM.YYYY"),
    tags: z.array(z.string().max(40)).max(50),
    custom: Custom,
  })
  .partial()
  .strict()

type Db = Parameters<Endpoint["handler"]>[0]["db"]
async function eventOf(db: Db, orgId: string, id: string) {
  const { data } = await db.from("events").select("id").eq("id", id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
  if (!data) throw notFound()
}

// Same validation as the app form / CSV import; null/"" clears a field.
async function contactRow(db: Db, orgId: string, input: z.infer<typeof ContactInput>) {
  const defs = await loadFields(db, orgId, "contacts")
  const r = readContact((k) => {
    if (k.startsWith("custom.")) {
      const v = input.custom?.[k.slice(7)]
      return v === undefined ? "" : typeof v === "boolean" ? (v ? "1" : "") : String(v)
    }
    const v = (input as Record<string, unknown>)[k]
    return Array.isArray(v) ? v.join(",") : v == null ? "" : String(v)
  }, defs)
  if ("error" in r) throw new ApiError(422, r.error.replace(/^errors\./, ""), r.field ? `${r.field}: ${r.error}` : r.error)
  return r.row
}
const dbError = (e: { code?: string; message: string }) =>
  e.code === "23505" ? new ApiError(409, "conflict", "A contact with this email already exists.") : new ApiError(500, "internal", "Database error.")

export const endpoints: Endpoint[] = [
  endpoint({
    method: "GET",
    path: "/events",
    permission: "events.view",
    tag: "Events",
    summary: "List events",
    query: page.extend({
      status: z.enum(["draft", "published", "cancelled"]).optional(),
      from: z.iso.datetime({ offset: true }).optional().describe("Only events ending/starting after this time"),
    }),
    response: list(Event),
    async handler({ db, orgId, query }) {
      let q = db.from("events").select(EVENT_COLS).eq("org_id", orgId).is("deleted_at", null).order("starts_at").range(query.offset, query.offset + query.limit)
      if (query.status) q = q.eq("status", query.status)
      if (query.from) q = q.or(`ends_at.gte.${query.from},and(ends_at.is.null,starts_at.gte.${query.from})`)
      const { data } = await q
      return paged(data, query)
    },
  }),
  endpoint({
    method: "GET",
    path: "/events/{id}",
    permission: "events.view",
    tag: "Events",
    summary: "Get an event",
    response: Event,
    async handler({ db, orgId, params }) {
      const { data } = await db.from("events").select(EVENT_COLS).eq("id", params.id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
      if (!data) throw notFound()
      return data
    },
  }),
  endpoint({
    method: "GET",
    path: "/events/{id}/ticket-types",
    permission: "tickets.view",
    tag: "Tickets",
    summary: "Ticket types of an event, with what's left",
    response: z.object({ data: z.array(TicketType) }),
    async handler({ db, orgId, params }) {
      await eventOf(db, orgId, params.id)
      const [{ data: types }, { data: avail }] = await Promise.all([
        db.from("ticket_types").select("id, name, description, price, currency, quota, sales_start, sales_end, active, hidden").eq("event_id", params.id).eq("org_id", orgId).order("position"),
        db.rpc("ticket_availability", { p_event: params.id }),
      ])
      const left = new Map(avail?.map((a) => [a.type_id, a.remaining]))
      return { data: (types ?? []).map((t) => ({ ...t, remaining: left.get(t.id) ?? null })) }
    },
  }),
  endpoint({
    method: "GET",
    path: "/events/{id}/tickets",
    permission: "tickets.view",
    tag: "Tickets",
    summary: "Tickets of an event",
    description: "Sold and checked-in tickets (reserved ones only with status=reserved).",
    query: page.extend({ status: z.enum(["valid", "used", "reserved", "void"]).optional() }),
    response: list(Ticket),
    async handler({ db, orgId, params, query }) {
      await eventOf(db, orgId, params.id)
      let q = db.from("tickets").select(TICKET_COLS).eq("event_id", params.id).eq("org_id", orgId).order("created_at").range(query.offset, query.offset + query.limit)
      q = query.status ? q.eq("status", query.status) : q.in("status", ["valid", "used"])
      const { data } = await q
      return paged(data, query)
    },
  }),
  endpoint({
    method: "GET",
    path: "/contacts",
    permission: "crm.view",
    tag: "Contacts",
    summary: "List contacts",
    query: page.extend({
      q: z.string().max(100).optional().describe("Search in name, company, email, phone, city"),
      tag: z.string().max(40).optional(),
      email: z.string().max(320).optional().describe("Exact email"),
      updated_since: z.iso.datetime({ offset: true }).optional().describe("For syncing: changed after this time"),
    }),
    response: list(Contact),
    async handler({ db, orgId, query }) {
      let q = db.from("contacts").select(CONTACT_COLS).eq("org_id", orgId).is("deleted_at", null).order("created_at").range(query.offset, query.offset + query.limit)
      const s = query.q?.replace(/[%,()*]/g, "").trim()
      if (s) q = q.or(["first_name", "last_name", "company", "email", "phone", "city"].map((c) => `${c}.ilike.%${s}%`).join(","))
      if (query.tag) q = q.contains("tags", [query.tag])
      if (query.email) q = q.eq("email", query.email.trim().toLowerCase())
      if (query.updated_since) q = q.gte("updated_at", query.updated_since)
      const { data } = await q
      return paged(data, query)
    },
  }),
  endpoint({
    method: "GET",
    path: "/contacts/{id}",
    permission: "crm.view",
    tag: "Contacts",
    summary: "Get a contact",
    response: Contact,
    async handler({ db, orgId, params }) {
      const { data } = await db.from("contacts").select(CONTACT_COLS).eq("id", params.id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
      if (!data) throw notFound()
      return data
    },
  }),
  endpoint({
    method: "POST",
    path: "/contacts",
    permission: "crm.manage",
    tag: "Contacts",
    summary: "Create a contact",
    description: "Needs at least first_name, last_name, company or email. Email is unique per organisation (409 if taken).",
    body: ContactInput,
    response: Contact,
    status: 201,
    async handler({ db, orgId, body }) {
      const row = await contactRow(db, orgId, body)
      const { data, error } = await db.from("contacts").insert({ ...row, org_id: orgId }).select(CONTACT_COLS).single()
      if (error) throw dbError(error)
      return data
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/contacts/{id}",
    permission: "crm.manage",
    tag: "Contacts",
    summary: "Update a contact",
    description: "Only the given fields change; `custom` is merged; `tags` replaces the list.",
    body: ContactInput,
    response: Contact,
    async handler({ db, orgId, params, body }) {
      const { data: old } = await db.from("contacts").select(CONTACT_COLS).eq("id", params.id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
      if (!old) throw notFound()
      const input = { ...old, ...body, custom: { ...(old.custom as Record<string, string | number | boolean>), ...body.custom } }
      const row = await contactRow(db, orgId, input as z.infer<typeof ContactInput>) // id/timestamps are ignored by readContact
      const { data, error } = await db.from("contacts").update(row).eq("id", params.id).eq("org_id", orgId).select(CONTACT_COLS).single()
      if (error) throw dbError(error)
      return data
    },
  }),
]
