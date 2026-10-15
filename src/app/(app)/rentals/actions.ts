"use server"

import { revalidatePath } from "next/cache"
import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError, type T } from "@/i18n/translate"
import { pickedIds, trashMany } from "@/lib/bulk"
import { requirePerm } from "@/lib/context"
import { loadFields, readCustom } from "@/lib/custom-fields"
import { fromLocalInput } from "@/lib/time"
import { back } from "@/lib/url"
import { FAMILY_DEFAULTS, familyOf, readObject, readRate, readRental } from "@/rentals/fields"
import * as rentals from "@/rentals/server"

const PATH = "/rentals"
const UUID = /^[0-9a-f-]{36}$/
const s = (fd: FormData, key: string) => String(fd.get(key) ?? "")
const idOf = (fd: FormData, key = "id") => (UUID.test(s(fd, key)) ? s(fd, key) : "")
const message = (t: T, f: rentals.RentalFail) => (f.db ? dbError(t, f.db) : t.dynamic(f.error))
const fieldError = (t: T, e: { error: string; field?: string }) => (e.field ? `${e.field}: ` : "") + t.dynamic(e.error)
// Forms say where they came from (object page, rental page, list); App paths only.
const backTo = (fd: FormData, fallback: string) => {
  const b = s(fd, "back")
  return b.startsWith("/rentals") ? b : fallback
}
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
// datetime-local or a bare date (long-term contracts) → ISO; "" stays "".
const when = (v: string, endOfDay = false) => (!v ? "" : /^\d{4}-\d{2}-\d{2}$/.test(v) ? (fromLocalInput(`${v}T${endOfDay ? "23:59" : "00:00"}`)?.toISOString() ?? "x") : (fromLocalInput(v)?.toISOString() ?? "x"))

async function manager() {
  revalidatePath(PATH, "layout")
  const ctx = await requirePerm("rentals.manage")
  const t = await getT()
  if (!ctx.modules.has("rentals")) back(PATH, { error: t("errors.not_allowed") })
  return { ctx, t }
}

// ---------- objects ----------

export async function saveObjectAction(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd) || null
  const here = id ? `${PATH}/${id}` : `${PATH}/new`
  // A custom kind ("Spielkiste") comes from the free-text field when "other" is picked.
  const kind = s(fd, "kind") === "_custom" ? s(fd, "custom_kind").trim().slice(0, 40) : s(fd, "kind")
  const r = readObject((k) => (k === "kind" ? kind : s(fd, k)))
  if ("error" in r) back(here, { error: fieldError(t, r) })
  const c = readCustom(await loadFields(ctx.supabase, ctx.org.id, "rental_objects"), (k) => s(fd, `custom.${k}`))
  if ("error" in c) back(here, { error: `${c.field}: ${t.dynamic(c.error)}` })
  // New objects get the family's defaults unless the form says otherwise.
  if (!id && !fd.has("options")) Object.assign(r.row, FAMILY_DEFAULTS[r.row.family])
  const x = await rentals.saveObject(ctx.supabase, ctx.org.id, id, r.row, c.custom)
  if ("error" in x) back(here, { error: message(t, x) })
  back(`${PATH}/${x.id}`, { ok: id ? t("rentals.saved") : t("rentals.created") })
}

export async function trashObjectAction(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.rental_objects", p_id: idOf(fd) })
  back(error ? `${PATH}/${idOf(fd)}` : PATH, error ? { error: dbError(t, error) } : { ok: t("rentals.objectTrashed") })
}

/** "+ Schlüssel" (one) or "+ mehrere…" (count): children named <prefix>-<n>. */
export async function addChildrenAction(fd: FormData) {
  const { ctx, t } = await manager()
  const parent = idOf(fd, "parent_id")
  const kind = s(fd, "kind") || "key"
  const family = familyOf(kind)
  const count = Math.max(1, Math.min(100, Number(s(fd, "count")) || 1))
  const deposit = s(fd, "deposit").trim() ? Math.round(Number(s(fd, "deposit").replace(",", ".")) * 100) || null : null
  const r = await rentals.addChildren(ctx.supabase, ctx.org.id, parent, kind, family, s(fd, "prefix").trim().slice(0, 40) || t.dynamic(`rentals.kinds.${kind}`), count, { ...FAMILY_DEFAULTS[family], deposit_cents: deposit })
  back(`${PATH}/${parent}`, "error" in r ? { error: message(t, r) } : { ok: t("rentals.childrenAdded", { count: r.ids.length }) })
}

// ---------- rates ----------

export async function saveRateAction(fd: FormData) {
  const { ctx, t } = await manager()
  const object = idOf(fd, "object_id")
  const r = readRate((k) => s(fd, k))
  if ("error" in r) back(`${PATH}/${object}`, { error: fieldError(t, r) })
  const x = await rentals.saveRate(ctx.supabase, ctx.org.id, object, idOf(fd) || null, r.row)
  back(`${PATH}/${object}`, "error" in x ? { error: message(t, x) } : { ok: t("rentals.rateSaved") })
}

export async function deleteRateAction(fd: FormData) {
  const { ctx, t } = await manager()
  const object = idOf(fd, "object_id")
  const { error } = await ctx.supabase.from("rental_rates").delete().eq("id", idOf(fd)).eq("org_id", ctx.org.id)
  back(`${PATH}/${object}`, error ? { error: dbError(t, error) } : { ok: t("rentals.rateDeleted") })
}

// ---------- rentals ----------

/** New contract / booking / loan. Empty price/terms are taken from the chosen rate. */
export async function createRentalAction(fd: FormData) {
  const { ctx, t } = await manager()
  const object = idOf(fd, "object_id")
  const here = `${PATH}/r/new?object=${object}`
  const rateId = idOf(fd, "rate_id")
  const { data: rate } = rateId ? await ctx.supabase.from("rental_rates").select("*").eq("id", rateId).eq("org_id", ctx.org.id).maybeSingle() : { data: null }
  const pick = (k: string, fromRate: unknown) => (s(fd, k).trim() ? s(fd, k) : fromRate == null ? "" : String(fromRate))
  const starts = when(s(fd, "starts_at"))
  // A fixed first term from the rate: end = start + term (unless an end was entered).
  const termEnd = !s(fd, "ends_at") && rate?.term_months && starts && starts !== "x" ? new Date(new Date(starts).setMonth(new Date(starts).getMonth() + rate.term_months) - 1000).toISOString() : ""
  const get = (k: string) =>
    k === "starts_at" ? starts
    : k === "ends_at" ? when(s(fd, "ends_at"), true) || termEnd
    : k === "price" ? (s(fd, "price").trim() || (rate ? (rate.price_cents / 100).toFixed(2) : ""))
    : k === "deposit" ? (s(fd, "deposit").trim() || (rate?.deposit_cents != null ? (rate.deposit_cents / 100).toFixed(2) : ""))
    : k === "unit" ? pick("unit", rate?.unit)
    : k === "renew_months" ? pick("renew_months", rate?.renew_months)
    : k === "notice_months" ? pick("notice_months", rate?.notice_months)
    : s(fd, k)
  const r = readRental(get)
  if ("error" in r) back(here, { error: fieldError(t, r) })
  const c = readCustom(await loadFields(ctx.supabase, ctx.org.id, "rentals"), (k) => s(fd, `custom.${k}`))
  if ("error" in c) back(here, { error: `${c.field}: ${t.dynamic(c.error)}` })
  const people = fd.getAll("contact_id").map(String).filter((x) => UUID.test(x)).map((contact_id) => ({ contact_id, role: "main" as const }))
  const x = await rentals.createRental(ctx.supabase, ctx.org.id, { object_id: object, rate_id: rateId || null, parent_id: idOf(fd, "parent_id") || null, row: r.row, people, custom: c.custom })
  if ("error" in x) back(here, { error: message(t, x) })
  deliverSoon()
  back(`${PATH}/r/${x.id}`, { ok: t("rentals.created") })
}

export async function updateRentalAction(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const here = `${PATH}/r/${id}`
  const r = readRental((k) => (k === "starts_at" ? when(s(fd, k)) : k === "ends_at" ? when(s(fd, k), true) : s(fd, k)))
  if ("error" in r) back(here, { error: fieldError(t, r) })
  const c = readCustom(await loadFields(ctx.supabase, ctx.org.id, "rentals"), (k) => s(fd, `custom.${k}`))
  if ("error" in c) back(here, { error: `${c.field}: ${t.dynamic(c.error)}` })
  const x = await rentals.updateRental(ctx.supabase, ctx.org.id, id, r.row, c.custom)
  back(here, "error" in x ? { error: message(t, x) } : { ok: t("rentals.saved") })
}

export async function addPersonAction(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const contact = idOf(fd, "contact_id")
  const role = s(fd, "role") === "member" ? "member" : "main"
  if (!contact) back(`${PATH}/r/${id}`, { error: t("errors.invalid_input") })
  const { error } = await ctx.supabase.from("rental_contacts").upsert({ org_id: ctx.org.id, rental_id: id, contact_id: contact, role }, { onConflict: "rental_id,contact_id" })
  deliverSoon()
  back(`${PATH}/r/${id}#people`, error ? { error: dbError(t, error) } : { ok: t("rentals.saved") })
}

export async function removePersonAction(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const { error } = await ctx.supabase.from("rental_contacts").delete().eq("rental_id", id).eq("contact_id", idOf(fd, "contact_id")).eq("org_id", ctx.org.id)
  back(`${PATH}/r/${id}#people`, error ? { error: dbError(t, error) } : { ok: t("rentals.saved") })
}

export async function giveNoticeAction(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const x = await rentals.giveNotice(ctx.supabase, ctx.org.id, id, s(fd, "ends_on") || null, today())
  deliverSoon()
  back(`${PATH}/r/${id}`, "error" in x ? { error: message(t, x) } : { ok: t("rentals.noticeGiven", { date: t.date(`${x.ends}T12:00:00`, { dateStyle: "medium" }) }) })
}

/** Key / device handed out to one person (optionally on the rental of the parent object). */
export async function handOutAction(fd: FormData) {
  const { ctx, t } = await manager()
  const object = idOf(fd, "object_id")
  const to = backTo(fd, `${PATH}/${object}`)
  const contact = idOf(fd, "contact_id")
  if (!contact) back(to, { error: t("errors.invalid_input") })
  const r = readRental((k) => (k === "starts_at" ? when(s(fd, k) || today()) : k === "ends_at" ? "" : s(fd, k)))
  if ("error" in r) back(to, { error: fieldError(t, r) })
  const x = await rentals.createRental(ctx.supabase, ctx.org.id, { object_id: object, parent_id: idOf(fd, "parent_id") || null, row: r.row, people: [{ contact_id: contact, role: "main" }] })
  deliverSoon()
  back(to, "error" in x ? { error: message(t, x) } : { ok: t("rentals.handedOut") })
}

export async function returnAction(fd: FormData) {
  const { ctx, t } = await manager()
  const x = await rentals.endNow(ctx.supabase, ctx.org.id, idOf(fd), fd.get("deposit_back") === "on")
  back(backTo(fd, PATH), "error" in x ? { error: message(t, x) } : { ok: t("rentals.returned") })
}

export async function trashRentalAction(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.rentals", p_id: idOf(fd) })
  back(backTo(fd, `${PATH}/list`), error ? { error: dbError(t, error) } : { ok: t("rentals.trashed") })
}

export async function bulkTrashRentals(fd: FormData) {
  const { ctx, t } = await manager()
  const ids = pickedIds(fd)
  const error = ids.length ? await trashMany(ctx, "public.rentals", ids) : null
  back(backTo(fd, `${PATH}/list`), error ? { error: dbError(t, error) } : { ok: t("common.bulkTrashed", { count: ids.length }) })
}

export async function restoreObjectAction(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.rental_objects", p_id: idOf(fd) })
  back(error ? `${PATH}?trash=1` : `${PATH}/${idOf(fd)}`, error ? { error: dbError(t, error) } : { ok: t("rentals.restored") })
}

export async function restoreRentalAction(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.rentals", p_id: idOf(fd) })
  back(error ? `${PATH}/list?view=trash` : `${PATH}/r/${idOf(fd)}`, error ? { error: dbError(t, error) } : { ok: t("rentals.restored") })
}
