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

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD")
const MembershipType = z.object({
  id: uuid,
  name: z.string(),
  fee: z.number().int().describe("Fee per interval in cents"),
  interval: z.enum(["month", "quarter", "half_year", "year", "none"]),
  entry_fee: z.number().int().describe("One-off entry fee in cents"),
  notice_months: z.number().int(),
  prorate: z.boolean(),
  active: z.boolean(),
})
const Membership = z.object({
  id: uuid,
  member_no: z.string().nullable().describe("Formatted member number"),
  contact_id: uuid,
  type_id: uuid,
  starts_on: day,
  ends_on: day.nullable(),
  active: z.boolean().describe("Started and not ended (today)"),
  has_mandate: z.boolean().describe("SEPA direct debit mandate on file (bank details are not exposed)"),
  mandate_ref: z.string().nullable(),
  note: z.string().nullable(),
  created_at: ts,
  updated_at: ts,
})
const MEMBERSHIP_COLS = "id, member_no, contact_id, type_id, starts_on, ends_on, iban, mandate_ref, note, created_at, updated_at"
type MembershipRow = { iban: string | null; starts_on: string; ends_on: string | null } & Record<string, unknown>
const berlinToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
const membershipOut = ({ iban, ...m }: MembershipRow) => {
  const now = berlinToday()
  return { ...m, has_mandate: !!iban, active: m.starts_on <= now && (!m.ends_on || m.ends_on >= now) }
}
const Due = z.object({
  id: uuid,
  membership_id: uuid,
  kind: z.enum(["fee", "entry", "levy"]),
  description: z.string(),
  amount: z.number().int().describe("Cents"),
  period_start: day.nullable(),
  due_on: day,
  status: z.enum(["open", "paid", "cancelled"]),
  paid_on: day.nullable(),
  updated_at: ts,
})
const DUE_COLS = "id, membership_id, kind, description, amount:amount_cents, period_start, due_on, status, paid_on, updated_at"
const Form = z.object({ id: uuid, title: z.string(), slug: z.string(), purpose: z.enum(["contact", "membership"]), status: z.enum(["draft", "published", "closed"]), created_at: ts, updated_at: ts })
const Submission = z.object({
  id: uuid,
  form_id: uuid,
  status: z.enum(["new", "accepted", "rejected"]),
  email: z.string().nullable(),
  data: z.record(z.string(), z.unknown()).describe("{ contact, custom, membership, consents } as submitted (IBAN masked)"),
  contact_id: uuid.nullable(),
  membership_id: uuid.nullable(),
  created_at: ts,
})
const FileMeta = z.object({
  id: uuid,
  name: z.string(),
  mime: z.string(),
  size: z.number().int(),
  entity: z.string().nullable(),
  entity_id: uuid.nullable(),
  folder: z.string().nullable(),
  created_at: ts,
  download_url: z.string().nullable().describe("Signed link, valid 10 minutes"),
})
const Invoice = z.object({
  id: uuid,
  kind: z.string().describe("invoice, quote or cancellation"),
  status: z.string(),
  number: z.string().nullable(),
  contact_id: uuid.nullable(),
  recipient_name: z.string().nullable(),
  issue_date: day.nullable(),
  due_date: day.nullable(),
  currency: z.string(),
  net_total: z.number().int(),
  tax_total: z.number().int(),
  gross_total: z.number().int(),
  paid_at: ts.nullable(),
  updated_at: ts,
})
const INVOICE_COLS = "id, kind, status, number, contact_id, recipient_name, issue_date, due_date, currency, net_total, tax_total, gross_total, paid_at, updated_at"
const maskIban = (d: unknown) => {
  const m = (d as { membership?: { iban?: string | null } })?.membership
  return m?.iban ? { ...(d as object), membership: { ...m, iban: `${m.iban.slice(0, 4)}…${m.iban.slice(-4)}` } } : d
}

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
  endpoint({
    method: "GET",
    path: "/membership-types",
    permission: "members.view",
    tag: "Members",
    summary: "List membership types",
    response: z.object({ data: z.array(MembershipType) }),
    async handler({ db, orgId }) {
      const { data } = await db
        .from("membership_types")
        .select("id, name, fee:fee_cents, interval, entry_fee:entry_fee_cents, notice_months, prorate, active")
        .eq("org_id", orgId)
        .order("name")
      return { data: data ?? [] }
    },
  }),
  endpoint({
    method: "GET",
    path: "/members",
    permission: "members.view",
    tag: "Members",
    summary: "List memberships",
    query: page.extend({
      status: z.enum(["active", "ended", "all"]).default("all"),
      contact_id: uuid.optional(),
      type_id: uuid.optional(),
      updated_since: z.iso.datetime({ offset: true }).optional(),
    }),
    response: list(Membership),
    async handler({ db, orgId, query }) {
      const now = berlinToday()
      let q = db.from("memberships").select(MEMBERSHIP_COLS).eq("org_id", orgId).is("deleted_at", null).order("number").range(query.offset, query.offset + query.limit)
      if (query.status === "active") q = q.lte("starts_on", now).or(`ends_on.is.null,ends_on.gte.${now}`)
      if (query.status === "ended") q = q.lt("ends_on", now)
      if (query.contact_id) q = q.eq("contact_id", query.contact_id)
      if (query.type_id) q = q.eq("type_id", query.type_id)
      if (query.updated_since) q = q.gte("updated_at", query.updated_since)
      const { data } = await q
      return paged(data?.map(membershipOut) ?? [], query)
    },
  }),
  endpoint({
    method: "GET",
    path: "/members/{id}",
    permission: "members.view",
    tag: "Members",
    summary: "Get a membership",
    response: Membership,
    async handler({ db, orgId, params }) {
      const { data } = await db.from("memberships").select(MEMBERSHIP_COLS).eq("id", params.id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
      if (!data) throw notFound()
      return membershipOut(data)
    },
  }),
  endpoint({
    method: "POST",
    path: "/members",
    permission: "members.manage",
    tag: "Members",
    summary: "Add a member",
    description: "For an existing contact (create it with POST /contacts first). The member number is assigned automatically.",
    body: z
      .object({
        contact_id: uuid,
        type_id: uuid,
        starts_on: day.optional(),
        iban: z.string().max(40).optional(),
        bic: z.string().max(11).optional(),
        account_holder: z.string().max(70).optional(),
        mandate_signed_on: day.optional(),
        note: z.string().max(5000).optional(),
      })
      .strict(),
    response: Membership,
    status: 201,
    async handler({ db, orgId, body }) {
      const iban = body.iban?.toUpperCase().replace(/\s/g, "") || null
      if (iban && !/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(iban)) throw new ApiError(422, "invalid_iban", "The IBAN is invalid.")
      const startsOn = body.starts_on ?? berlinToday()
      const { data, error } = await db
        .from("memberships")
        .insert({
          org_id: orgId,
          contact_id: body.contact_id,
          type_id: body.type_id,
          starts_on: startsOn,
          iban,
          bic: body.bic?.toUpperCase() || null,
          account_holder: body.account_holder ?? null,
          mandate_signed_on: iban ? (body.mandate_signed_on ?? startsOn) : null,
          note: body.note ?? null,
        })
        .select(MEMBERSHIP_COLS)
        .single()
      if (error) throw error.message === "not_allowed" ? new ApiError(422, "invalid_reference", "contact_id or type_id does not belong to this organisation.") : new ApiError(500, "internal", "Database error.")
      return membershipOut(data)
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/members/{id}",
    permission: "members.manage",
    tag: "Members",
    summary: "Change a membership",
    description: "Set `ends_on` to end it (cancellation), change the type or the note.",
    body: z.object({ type_id: uuid, ends_on: day.nullable(), note: z.string().max(5000).nullable() }).partial().strict(),
    response: Membership,
    async handler({ db, orgId, params, body }) {
      const { data, error } = await db.from("memberships").update(body).eq("id", params.id).eq("org_id", orgId).is("deleted_at", null).select(MEMBERSHIP_COLS).maybeSingle()
      if (error) throw new ApiError(422, "invalid_input", "Invalid change (type of another organisation or end before start).")
      if (!data) throw notFound()
      return membershipOut(data)
    },
  }),
  endpoint({
    method: "GET",
    path: "/dues",
    permission: "members.view",
    tag: "Members",
    summary: "List member dues",
    query: page.extend({ status: z.enum(["open", "paid", "cancelled"]).optional(), membership_id: uuid.optional(), updated_since: z.iso.datetime({ offset: true }).optional() }),
    response: list(Due),
    async handler({ db, orgId, query }) {
      let q = db.from("member_dues").select(DUE_COLS).eq("org_id", orgId).order("due_on").range(query.offset, query.offset + query.limit)
      if (query.status) q = q.eq("status", query.status)
      if (query.membership_id) q = q.eq("membership_id", query.membership_id)
      if (query.updated_since) q = q.gte("updated_at", query.updated_since)
      const { data } = await q
      return paged(data, query)
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/dues/{id}",
    permission: "members.manage",
    tag: "Members",
    summary: "Mark a due paid or cancelled",
    description: "For bank or accounting sync. `paid_on` defaults to today.",
    body: z.object({ status: z.enum(["open", "paid", "cancelled"]), paid_on: day.optional() }).strict(),
    response: Due,
    async handler({ db, orgId, params, body }) {
      const { data } = await db
        .from("member_dues")
        .update({ status: body.status, paid_on: body.status === "paid" ? (body.paid_on ?? berlinToday()) : null })
        .eq("id", params.id)
        .eq("org_id", orgId)
        .select(DUE_COLS)
        .maybeSingle()
      if (!data) throw notFound()
      return data
    },
  }),
  endpoint({
    method: "GET",
    path: "/forms",
    permission: "forms.view",
    tag: "Forms",
    summary: "List forms",
    response: z.object({ data: z.array(Form) }),
    async handler({ db, orgId }) {
      const { data } = await db.from("forms").select("id, title, slug, purpose, status, created_at, updated_at").eq("org_id", orgId).is("deleted_at", null).order("created_at")
      return { data: data ?? [] }
    },
  }),
  endpoint({
    method: "GET",
    path: "/forms/{id}/submissions",
    permission: "forms.view",
    tag: "Forms",
    summary: "Submissions of a form",
    description: "Newest first. Poll with `since` to pick up new ones.",
    query: page.extend({ status: z.enum(["new", "accepted", "rejected"]).optional(), since: z.iso.datetime({ offset: true }).optional() }),
    response: list(Submission),
    async handler({ db, orgId, params, query }) {
      let q = db
        .from("form_submissions")
        .select("id, form_id, status, email, data, contact_id, membership_id, created_at")
        .eq("org_id", orgId)
        .eq("form_id", params.id)
        .order("created_at", { ascending: false })
        .range(query.offset, query.offset + query.limit)
      if (query.status) q = q.eq("status", query.status)
      if (query.since) q = q.gt("created_at", query.since)
      const { data } = await q
      return paged(data?.map((s) => ({ ...s, data: maskIban(s.data) })) ?? [], query)
    },
  }),
  endpoint({
    method: "GET",
    path: "/files",
    permission: "org.files.view",
    tag: "Files",
    summary: "List files",
    description: "Optionally of one record (`entity` + `entity_id`, e.g. contacts + id) or one folder. Each file has a download link valid for 10 minutes.",
    query: page.extend({ entity: z.string().max(40).optional(), entity_id: uuid.optional(), folder: z.string().max(200).optional() }),
    response: list(FileMeta),
    async handler({ db, orgId, query }) {
      let q = db.from("files").select("id, name, mime, size, entity, entity_id, folder, created_at, path").eq("org_id", orgId).is("deleted_at", null).order("created_at", { ascending: false }).range(query.offset, query.offset + query.limit)
      if (query.entity) q = q.eq("entity", query.entity)
      if (query.entity_id) q = q.eq("entity_id", query.entity_id)
      if (query.folder) q = q.eq("folder", query.folder)
      const { data } = await q
      const rows = data ?? []
      const { data: signed } = rows.length ? await db.storage.from("files").createSignedUrls(rows.map((f) => f.path), 600) : { data: [] }
      return paged(rows.map(({ path, ...f }) => ({ ...f, download_url: signed?.find((x) => x.path === path)?.signedUrl ?? null })), query)
    },
  }),
  endpoint({
    method: "GET",
    path: "/invoices",
    permission: "invoices.view",
    tag: "Invoices",
    summary: "List invoices, quotes and cancellations",
    description: "Amounts in cents. Drafts have no number yet.",
    query: page.extend({ kind: z.enum(["invoice", "quote", "cancellation"]).optional(), status: z.string().max(20).optional(), updated_since: z.iso.datetime({ offset: true }).optional() }),
    response: list(Invoice),
    async handler({ db, orgId, query }) {
      let q = db.from("documents").select(INVOICE_COLS).eq("org_id", orgId).order("created_at").range(query.offset, query.offset + query.limit)
      if (query.kind) q = q.eq("kind", query.kind)
      if (query.status) q = q.eq("status", query.status)
      if (query.updated_since) q = q.gte("updated_at", query.updated_since)
      const { data } = await q
      return paged(data, query)
    },
  }),
]
