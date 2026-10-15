// Rentals, server side: objects (+ quick children like keys), rates, rentals with their people, notice, return.
// Shared by the App's actions and the API; callers check rentals.manage, RLS + DB guards check again (same org, no
// double booking, fixed parts never alone).
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { noticeEnd, type ObjectRow, type RateRow, type RentalRow } from "./fields"

type Db = SupabaseClient<Database>
export type RentalFail = { error: string; db?: { code?: string; message: string } }
const dbFail = (e: { code?: string; message: string }): RentalFail => ({ error: "db", db: e })
const UUID = /^[0-9a-f-]{36}$/

export const OBJECT_COLS = "id, parent_id, family, kind, name, status, rentable, lendable, included, capacity, deposit_cents, location_id, description, position, custom, deleted_at, created_at"
export const RENTAL_COLS = "id, object_id, parent_id, rate_id, status, starts_at, ends_at, price_cents, unit, renew_months, notice_months, notice_at, deposit_cents, deposit_back_at, note, custom, deleted_at, created_at, rental_contacts(contact_id, role, contacts(id, first_name, last_name, company, email))"

export async function saveObject(db: Db, orgId: string, id: string | null, row: ObjectRow, custom?: Record<string, unknown>): Promise<RentalFail | { id: string }> {
  const values = { ...row, ...(custom ? { custom: custom as Database["public"]["Tables"]["rental_objects"]["Insert"]["custom"] } : {}) }
  if (id) {
    const { error, count } = await db.from("rental_objects").update(values, { count: "exact" }).eq("id", id).eq("org_id", orgId)
    if (error) return dbFail(error)
    return count ? { id } : { error: "errors.not_allowed" }
  }
  const { data, error } = await db.from("rental_objects").insert({ ...values, org_id: orgId }).select("id").single()
  return error || !data ? dbFail(error ?? { message: "insert failed" }) : { id: data.id }
}

/**
 * Quick "+" for children (keys A-1, A-2 …): `count` new objects of `kind` under `parentId`, named "<prefix>-<n>"
 * continuing after the highest number already there.
 */
export async function addChildren(db: Db, orgId: string, parentId: string, kind: string, family: string, prefix: string, count: number, flags: { lendable: boolean; rentable: boolean; deposit_cents: number | null }): Promise<RentalFail | { ids: string[] }> {
  if (!UUID.test(parentId) || count < 1 || count > 100) return { error: "errors.invalid_input" }
  const { data: siblings } = await db.from("rental_objects").select("name").eq("org_id", orgId).eq("parent_id", parentId).is("deleted_at", null)
  const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const highest = Math.max(0, ...(siblings ?? []).map((s) => Number(new RegExp(`^${esc}-(\\d+)$`).exec(s.name)?.[1] ?? 0)))
  const rows = Array.from({ length: count }, (_, i) => ({ org_id: orgId, parent_id: parentId, kind, family, name: `${prefix}-${highest + i + 1}`, position: highest + i + 1, ...flags }))
  const { data, error } = await db.from("rental_objects").insert(rows).select("id")
  return error ? dbFail(error) : { ids: (data ?? []).map((d) => d.id) }
}

export async function saveRate(db: Db, orgId: string, objectId: string, id: string | null, row: RateRow): Promise<RentalFail | { id: string }> {
  if (id) {
    const { error } = await db.from("rental_rates").update(row).eq("id", id).eq("org_id", orgId).eq("object_id", objectId)
    return error ? dbFail(error) : { id }
  }
  const { data, error } = await db.from("rental_rates").insert({ ...row, org_id: orgId, object_id: objectId }).select("id").single()
  return error || !data ? dbFail(error ?? { message: "insert failed" }) : { id: data.id }
}

export type Person = { contact_id: string; role: "main" | "member" }

/** New rental (contract, booking, loan, handout) with its people. A failed people insert removes the rental again. */
export async function createRental(db: Db, orgId: string, input: { object_id: string; rate_id?: string | null; parent_id?: string | null; row: RentalRow; people: Person[]; custom?: Record<string, unknown> }): Promise<RentalFail | { id: string }> {
  if (!UUID.test(input.object_id)) return { error: "errors.invalid_input" }
  const { data, error } = await db
    .from("rentals")
    .insert({
      ...input.row,
      org_id: orgId,
      object_id: input.object_id,
      rate_id: input.rate_id && UUID.test(input.rate_id) ? input.rate_id : null,
      parent_id: input.parent_id && UUID.test(input.parent_id) ? input.parent_id : null,
      custom: (input.custom ?? {}) as Database["public"]["Tables"]["rentals"]["Insert"]["custom"],
    })
    .select("id")
    .single()
  if (error || !data) return dbFail(error ?? { message: "insert failed" })
  const r = await setPeople(db, orgId, data.id, input.people)
  if ("error" in r) {
    await db.from("rentals").delete().eq("id", data.id)
    return r
  }
  return { id: data.id }
}

export async function updateRental(db: Db, orgId: string, id: string, row: Partial<RentalRow>, custom?: Record<string, unknown>): Promise<RentalFail | { id: string }> {
  const { error, count } = await db
    .from("rentals")
    .update({ ...row, ...(custom ? { custom: custom as Database["public"]["Tables"]["rentals"]["Update"]["custom"] } : {}) }, { count: "exact" })
    .eq("id", id)
    .eq("org_id", orgId)
  if (error) return dbFail(error)
  return count ? { id } : { error: "errors.not_allowed" }
}

/** The rental's people become exactly `people` (added, role changed, removed). */
export async function setPeople(db: Db, orgId: string, rentalId: string, people: Person[]): Promise<RentalFail | { id: string }> {
  const wanted = new Map(people.filter((p) => UUID.test(p.contact_id)).map((p) => [p.contact_id, p.role === "member" ? "member" : "main"] as const))
  const { data: now } = await db.from("rental_contacts").select("id, contact_id, role").eq("rental_id", rentalId).eq("org_id", orgId)
  const gone = (now ?? []).filter((p) => !wanted.has(p.contact_id)).map((p) => p.id)
  if (gone.length) {
    const { error } = await db.from("rental_contacts").delete().in("id", gone)
    if (error) return dbFail(error)
  }
  for (const p of now ?? []) {
    const role = wanted.get(p.contact_id)
    if (role && role !== p.role) {
      const { error } = await db.from("rental_contacts").update({ role }).eq("id", p.id)
      if (error) return dbFail(error)
    }
  }
  const add = [...wanted].filter(([c]) => !(now ?? []).some((p) => p.contact_id === c)).map(([contact_id, role]) => ({ org_id: orgId, rental_id: rentalId, contact_id, role }))
  if (add.length) {
    const { error } = await db.from("rental_contacts").insert(add)
    if (error) return dbFail(error)
  }
  return { id: rentalId }
}

/** Notice received today: no more renewing; open-ended contracts end at the earliest possible date (or `on`). */
export async function giveNotice(db: Db, orgId: string, id: string, on: string | null, today: string): Promise<RentalFail | { id: string; ends: string }> {
  const { data: r } = await db.from("rentals").select("ends_at, notice_months").eq("id", id).eq("org_id", orgId).maybeSingle()
  if (!r) return { error: "errors.not_allowed" }
  const ends = on && /^\d{4}-\d{2}-\d{2}$/.test(on) ? on : noticeEnd(r, today)
  const { error } = await db.from("rentals").update({ notice_at: new Date().toISOString(), ends_at: new Date(`${ends}T23:59:59`).toISOString() }).eq("id", id).eq("org_id", orgId)
  return error ? dbFail(error) : { id, ends }
}

/** A handed-out thing comes back (or a rental ends now). */
export async function endNow(db: Db, orgId: string, id: string, depositBack: boolean): Promise<RentalFail | { id: string }> {
  const now = new Date().toISOString()
  const { error } = await db.from("rentals").update({ ends_at: now, ...(depositBack ? { deposit_back_at: now } : {}) }).eq("id", id).eq("org_id", orgId)
  return error ? dbFail(error) : { id }
}
