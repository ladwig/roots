import { z } from "zod"
import { messages } from "@/i18n/config"
import { createT } from "@/i18n/translate"
import { FAMILIES, FAMILY_DEFAULTS, familyOf, UNITS, readObject, readRate, readRental, rentalState } from "@/rentals/fields"
import { addChildren, createRental, endNow, giveNotice, OBJECT_COLS, RENTAL_COLS, saveObject, saveRate, setPeople, updateRental, type RentalFail } from "@/rentals/server"
import { ApiError, dbError, endpoint, list, notFound, page, paged, uuid, type Endpoint } from "../core"
import { day, ts, type Db } from "./shared"

const TAG = "Rentals"
const en = createT("en", messages.en)
function fail(f: RentalFail | { error: string; field?: string }): never {
  if ("db" in f && f.db) throw dbError(f.db)
  throw new ApiError(422, f.error.split(".").pop()!.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), en.dynamic(f.error), "field" in f && f.field ? { field: f.field } : undefined)
}
// Body values → the form-style getter the shared parsers read (money as "12.50", flags as "true").
const getter = (o: Record<string, unknown>) => (k: string) => {
  const v = k === "deposit" ? o.deposit_cents : k === "price" ? o.price_cents : o[k]
  if (v == null) return ""
  if ((k === "deposit" || k === "price") && typeof v === "number") return (v / 100).toFixed(2)
  return String(v)
}
// deleted_at is only read to filter; API rows don't carry it.
const live = <R extends Record<string, unknown>>(row: R) => Object.fromEntries(Object.entries(row).filter(([k]) => k !== "deleted_at")) as Omit<R, "deleted_at">
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })

const Family = z.enum(FAMILIES)
const Unit = z.enum(UNITS)
const RObject = z.object({
  id: uuid,
  parent_id: uuid.nullable(),
  family: Family.describe("Decides the behaviour: place/vehicle/item are rented with rates, access (keys, cards) is handed out"),
  kind: z.string().describe("studio, room, key, car, device … or a custom kind"),
  name: z.string(),
  status: z.enum(["active", "inactive", "lost"]),
  rentable: z.boolean(),
  lendable: z.boolean(),
  included: z.boolean().describe("Fixed part of the parent: only rented along with it"),
  capacity: z.number().int().describe("Confirmed rentals that may overlap"),
  deposit_cents: z.number().int().nullable(),
  location_id: uuid.nullable(),
  description: z.string(),
  position: z.number().int(),
  custom: z.record(z.string(), z.unknown()),
  created_at: ts,
})
const Rate = z.object({
  id: uuid,
  object_id: uuid,
  name: z.string(),
  unit: Unit,
  price_cents: z.number().int(),
  min_units: z.number().int(),
  term_months: z.number().int().nullable().describe("Fixed first term (monthly/yearly)"),
  renew_months: z.number().int().nullable().describe("Renews by this unless notice is given"),
  notice_months: z.number().int().nullable(),
  deposit_cents: z.number().int().nullable(),
  active: z.boolean(),
})
const Person = z.object({ contact_id: uuid, role: z.enum(["main", "member"]).describe("main = contract partner (pays), member = co-user") })
const Rental = z.object({
  id: uuid,
  object_id: uuid,
  parent_id: uuid.nullable().describe("A key handout's link to the rental of its studio"),
  rate_id: uuid.nullable(),
  status: z.enum(["request", "confirmed", "cancelled"]).describe("Requests don't block the object"),
  state: z.enum(["request", "cancelled", "upcoming", "running", "ended"]),
  starts_at: ts,
  ends_at: ts.nullable().describe("null = open-ended; a handout: returned at"),
  price_cents: z.number().int().nullable(),
  unit: Unit.nullable(),
  renew_months: z.number().int().nullable(),
  notice_months: z.number().int().nullable(),
  notice_at: ts.nullable(),
  deposit_cents: z.number().int().nullable(),
  deposit_back_at: ts.nullable(),
  note: z.string(),
  custom: z.record(z.string(), z.unknown()),
  people: z.array(Person),
  created_at: ts,
})
type RentalRow = Record<string, unknown> & { status: string; starts_at: string; ends_at: string | null; rental_contacts: { contact_id: string; role: string }[] }
const shape = ({ rental_contacts, ...r }: RentalRow) =>
  ({ ...live(r), state: rentalState(r as { status: string; starts_at: string; ends_at: string | null }), people: rental_contacts.map((p) => ({ contact_id: p.contact_id, role: p.role })) }) as z.infer<typeof Rental>

async function loadObject(db: Db, orgId: string, id: string) {
  const { data } = await db.from("rental_objects").select(OBJECT_COLS).eq("id", id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
  if (!data) throw notFound()
  return live(data) as z.infer<typeof RObject>
}
async function loadRental(db: Db, orgId: string, id: string) {
  const { data } = await db.from("rentals").select(RENTAL_COLS).eq("id", id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
  if (!data) throw notFound()
  return shape(data as unknown as RentalRow)
}

const ObjectInput = z.object({
  name: z.string().max(200),
  kind: z.string().max(40).describe("Known kinds: studio, room, rehearsal_room, office, desk, flat, hall, storage, parking, locker, car, van, bike, trailer, device, tech, instrument, tool, furniture, key, transponder, card … or any text"),
  parent_id: uuid.nullable(),
  rentable: z.boolean(),
  lendable: z.boolean(),
  included: z.boolean(),
  capacity: z.number().int().min(1).max(10000),
  deposit_cents: z.number().int().min(0).nullable(),
  location_id: uuid.nullable(),
  description: z.string().max(20000),
  status: z.enum(["active", "inactive", "lost"]),
})
const RateInput = z.object({
  name: z.string().max(100),
  unit: Unit,
  price_cents: z.number().int().min(0),
  min_units: z.number().int().min(1).max(1000).default(1),
  term_months: z.number().int().min(1).max(600).nullable().optional(),
  renew_months: z.number().int().min(1).max(600).nullable().optional(),
  notice_months: z.number().int().min(0).max(60).nullable().optional(),
  deposit_cents: z.number().int().min(0).nullable().optional(),
  active: z.boolean().default(true),
})
const RentalInput = z.object({
  starts_at: ts,
  ends_at: ts.nullable().optional(),
  status: z.enum(["request", "confirmed", "cancelled"]).default("confirmed"),
  price_cents: z.number().int().min(0).nullable().optional(),
  unit: Unit.nullable().optional(),
  renew_months: z.number().int().min(1).max(600).nullable().optional(),
  notice_months: z.number().int().min(0).max(60).nullable().optional(),
  deposit_cents: z.number().int().min(0).nullable().optional(),
  note: z.string().max(20000).optional(),
})

export const endpoints: Endpoint[] = [
  endpoint({
    method: "GET",
    path: "/rental-objects",
    permission: "rentals.view",
    tag: TAG,
    summary: "List objects (rooms, studios, vehicles, items, keys)",
    query: page.extend({ family: Family.optional(), parent_id: uuid.optional(), q: z.string().max(100).optional() }),
    response: list(RObject),
    async handler({ db, orgId, query }) {
      let q = db.from("rental_objects").select(OBJECT_COLS).eq("org_id", orgId).is("deleted_at", null).order("position").order("name").range(query.offset, query.offset + query.limit)
      if (query.family) q = q.eq("family", query.family)
      if (query.parent_id) q = q.eq("parent_id", query.parent_id)
      const term = query.q?.replace(/[%,()*\\]/g, " ").trim()
      if (term) q = q.ilike("name", `%${term}%`)
      const { data } = await q
      return paged((data ?? []).map((o) => live(o) as z.infer<typeof RObject>), query)
    },
  }),
  endpoint({ method: "GET", path: "/rental-objects/{id}", permission: "rentals.view", tag: TAG, summary: "Get an object", response: RObject, handler: ({ db, orgId, params }) => loadObject(db, orgId, params.id) }),
  endpoint({
    method: "POST",
    path: "/rental-objects",
    permission: "rentals.manage",
    tag: TAG,
    summary: "Create an object",
    description: "family follows from kind. rentable/lendable default to the family's defaults (places, vehicles: rentable; keys: handed out).",
    body: ObjectInput.partial().required({ name: true, kind: true }).strict(),
    response: RObject,
    status: 201,
    async handler({ db, orgId, body }) {
      const r = readObject(getter(body))
      if ("error" in r) fail(r)
      const d = FAMILY_DEFAULTS[r.row.family]
      const x = await saveObject(db, orgId, null, { ...r.row, rentable: body.rentable ?? d.rentable, lendable: body.lendable ?? d.lendable })
      if ("error" in x) fail(x)
      return loadObject(db, orgId, x.id)
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/rental-objects/{id}",
    permission: "rentals.manage",
    tag: TAG,
    summary: "Change an object",
    body: ObjectInput.partial().strict(),
    response: RObject,
    async handler({ db, orgId, params, body }) {
      const cur = await loadObject(db, orgId, params.id)
      const r = readObject(getter({ ...cur, ...body }))
      if ("error" in r) fail(r)
      const x = await saveObject(db, orgId, params.id, r.row)
      if ("error" in x) fail(x)
      return loadObject(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/rental-objects/{id}/children",
    permission: "rentals.manage",
    tag: TAG,
    summary: "Add several children at once (e.g. 4 keys)",
    description: "Named <prefix>-<n>, continuing after the highest existing number.",
    body: z.object({ kind: z.string().max(40).default("key"), count: z.number().int().min(1).max(100).default(1), prefix: z.string().max(40), deposit_cents: z.number().int().min(0).nullable().optional() }).strict(),
    response: z.object({ ids: z.array(uuid) }),
    status: 201,
    async handler({ db, orgId, params, body }) {
      await loadObject(db, orgId, params.id)
      const family = familyOf(body.kind)
      const r = await addChildren(db, orgId, params.id, body.kind, family, body.prefix, body.count, { ...FAMILY_DEFAULTS[family], deposit_cents: body.deposit_cents ?? null })
      if ("error" in r) fail(r)
      return r
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/rental-objects/{id}",
    permission: "rentals.manage",
    tag: TAG,
    summary: "Move an object to the trash",
    response: z.object({ id: uuid }),
    async handler({ db, orgId, params }) {
      await loadObject(db, orgId, params.id)
      const { error } = await db.rpc("soft_delete", { p_table: "public.rental_objects", p_id: params.id })
      if (error) throw dbError(error)
      return { id: params.id }
    },
  }),
  endpoint({
    method: "GET",
    path: "/rental-objects/{id}/rates",
    permission: "rentals.view",
    tag: TAG,
    summary: "List an object's rates",
    response: z.object({ data: z.array(Rate) }),
    async handler({ db, orgId, params }) {
      const { data } = await db.from("rental_rates").select("id, object_id, name, unit, price_cents, min_units, term_months, renew_months, notice_months, deposit_cents, active").eq("object_id", params.id).eq("org_id", orgId).order("position")
      return { data: (data ?? []) as z.infer<typeof Rate>[] }
    },
  }),
  endpoint({
    method: "POST",
    path: "/rental-objects/{id}/rates",
    permission: "rentals.manage",
    tag: TAG,
    summary: "Add a rate",
    description: "term/renew/notice only apply to month/year units.",
    body: RateInput.strict(),
    response: z.object({ id: uuid }),
    status: 201,
    async handler({ db, orgId, params, body }) {
      await loadObject(db, orgId, params.id)
      const r = readRate(getter({ ...body, active: body.active ? "on" : "off" }))
      if ("error" in r) fail(r)
      const x = await saveRate(db, orgId, params.id, null, r.row)
      if ("error" in x) fail(x)
      return x
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/rental-rates/{id}",
    permission: "rentals.manage",
    tag: TAG,
    summary: "Delete a rate",
    description: "Rentals keep their copied price and terms.",
    response: z.object({ id: uuid }),
    async handler({ db, orgId, params }) {
      const { error, count } = await db.from("rental_rates").delete({ count: "exact" }).eq("id", params.id).eq("org_id", orgId)
      if (error) throw dbError(error)
      if (!count) throw notFound()
      return { id: params.id }
    },
  }),
  endpoint({
    method: "GET",
    path: "/rentals",
    permission: "rentals.view",
    tag: TAG,
    summary: "List rentals (contracts, bookings, loans, handouts)",
    query: page.extend({ object_id: uuid.optional(), contact_id: uuid.optional(), from: day.optional().describe("Overlapping this day or later"), status: z.enum(["request", "confirmed", "cancelled"]).optional() }),
    response: list(Rental),
    async handler({ db, orgId, query }) {
      const cols = (query.contact_id ? RENTAL_COLS.replace("rental_contacts(", "rental_contacts!inner(") : RENTAL_COLS) as typeof RENTAL_COLS
      let q = db.from("rentals").select(cols).eq("org_id", orgId).is("deleted_at", null).order("starts_at", { ascending: false }).range(query.offset, query.offset + query.limit)
      if (query.object_id) q = q.eq("object_id", query.object_id)
      if (query.contact_id) q = q.eq("rental_contacts.contact_id", query.contact_id)
      if (query.status) q = q.eq("status", query.status)
      if (query.from) q = q.or(`ends_at.is.null,ends_at.gte.${query.from}`)
      const { data } = await q
      return paged((data ?? []).map((r) => shape(r as unknown as RentalRow)), query)
    },
  }),
  endpoint({ method: "GET", path: "/rentals/{id}", permission: "rentals.view", tag: TAG, summary: "Get a rental", response: Rental, handler: ({ db, orgId, params }) => loadRental(db, orgId, params.id) }),
  endpoint({
    method: "POST",
    path: "/rentals",
    permission: "rentals.manage",
    tag: TAG,
    summary: "Create a rental",
    description: "Contract, booking, loan or key handout. Confirmed rentals of one object never overlap beyond its capacity (409-style error object_busy); fixed parts can't be rented alone.",
    body: RentalInput.extend({ object_id: uuid, rate_id: uuid.nullable().optional(), parent_id: uuid.nullable().optional(), people: z.array(Person).max(50).default([]) }).strict(),
    response: Rental,
    status: 201,
    async handler({ db, orgId, body }) {
      const r = readRental(getter(body))
      if ("error" in r) fail(r)
      const x = await createRental(db, orgId, { object_id: body.object_id, rate_id: body.rate_id, parent_id: body.parent_id, row: r.row, people: body.people })
      if ("error" in x) fail(x)
      return loadRental(db, orgId, x.id)
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/rentals/{id}",
    permission: "rentals.manage",
    tag: TAG,
    summary: "Change a rental",
    body: RentalInput.partial().strict(),
    response: Rental,
    async handler({ db, orgId, params, body }) {
      const cur = await loadRental(db, orgId, params.id)
      const r = readRental(getter({ ...cur, ...body }))
      if ("error" in r) fail(r)
      const x = await updateRental(db, orgId, params.id, r.row)
      if ("error" in x) fail(x)
      return loadRental(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "PUT",
    path: "/rentals/{id}/people",
    permission: "rentals.manage",
    tag: TAG,
    summary: "Set the people on a rental",
    description: "Exactly these contacts with their roles (others are removed).",
    body: z.object({ people: z.array(Person).max(50) }).strict(),
    response: Rental,
    async handler({ db, orgId, params, body }) {
      await loadRental(db, orgId, params.id)
      const x = await setPeople(db, orgId, params.id, body.people)
      if ("error" in x) fail(x)
      return loadRental(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/rentals/{id}/notice",
    permission: "rentals.manage",
    tag: TAG,
    summary: "Record notice",
    description: "Stops renewing; ends at the earliest possible date (notice period, at least the fixed term) or ends_on. Emits rental.notice_received.",
    body: z.object({ ends_on: day.optional() }).strict(),
    response: Rental,
    async handler({ db, orgId, params, body }) {
      const x = await giveNotice(db, orgId, params.id, body.ends_on ?? null, today())
      if ("error" in x) fail(x)
      return loadRental(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/rentals/{id}/return",
    permission: "rentals.manage",
    tag: TAG,
    summary: "End now / take back (keys, devices)",
    body: z.object({ deposit_back: z.boolean().default(false) }).strict(),
    response: Rental,
    async handler({ db, orgId, params, body }) {
      const x = await endNow(db, orgId, params.id, body.deposit_back)
      if ("error" in x) fail(x)
      return loadRental(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/rentals/{id}",
    permission: "rentals.manage",
    tag: TAG,
    summary: "Move a rental to the trash",
    response: z.object({ id: uuid }),
    async handler({ db, orgId, params }) {
      await loadRental(db, orgId, params.id)
      const { error } = await db.rpc("soft_delete", { p_table: "public.rentals", p_id: params.id })
      if (error) throw dbError(error)
      return { id: params.id }
    },
  }),
]
