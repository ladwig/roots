"use server"

import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { fromLocalInput } from "@/lib/time"
import { back } from "@/lib/url"
import { checkCode, checkTicketType, checkTier, normalizeCode } from "@/tickets/fields"
import { parsePrice } from "@/tickets/price"
import { readDoor } from "@/tickets/door-fields"

async function manager(eventId: string) {
  const ctx = await requirePerm("tickets.manage")
  const t = await getT()
  const here = `/events/${eventId}/tickets`
  if (!ctx.modules.has("tickets") || !/^[0-9a-f-]{36}$/.test(eventId)) back("/events", { error: t("errors.not_allowed") })
  return { ctx, t, here }
}

function readType(fd: FormData) {
  const name = String(fd.get("name") ?? "").trim().slice(0, 100)
  const description = String(fd.get("description") ?? "").trim().slice(0, 1000) || null
  const quotaRaw = String(fd.get("quota") ?? "").trim()
  const quota = quotaRaw ? Number(quotaRaw) : null
  const startRaw = String(fd.get("sales_start") ?? "").trim()
  const endRaw = String(fd.get("sales_end") ?? "").trim()
  const sales_start = startRaw ? fromLocalInput(startRaw)?.toISOString() : null
  const sales_end = endRaw ? fromLocalInput(endRaw)?.toISOString() : null
  const error =
    checkTicketType({ name, quota, sales_start: sales_start ?? null, sales_end: sales_end ?? null }) ??
    (sales_start === undefined || sales_end === undefined ? "errors.invalid_time" : null)
  if (error) return { error }
  return { row: { name, description, quota, sales_start: sales_start ?? null, sales_end: sales_end ?? null, hidden: fd.get("hidden") === "1" } }
}

export async function saveTicketType(fd: FormData) {
  const eventId = String(fd.get("event") ?? "")
  const { ctx, t, here } = await manager(eventId)
  const id = String(fd.get("id") ?? "")
  const r = readType(fd)
  const price = parsePrice(String(fd.get("price") ?? ""))
  const retry = `${here}?${id ? `edit=${id}` : "new=type"}`
  if ("error" in r) back(retry, { error: t.dynamic(r.error!) })
  if (price === null) back(retry, { error: t("tickets.invalidPrice") })
  const { error } = id
    ? await ctx.supabase.from("ticket_types").update({ ...r.row!, price }).eq("id", id).eq("event_id", eventId)
    : await ctx.supabase.from("ticket_types").insert({ ...r.row!, price, org_id: ctx.org.id, event_id: eventId })
  if (error) back(retry, { error: dbError(t, error) })
  back(here, { ok: t("tickets.saved") })
}

export async function deleteTicketType(fd: FormData) {
  const eventId = String(fd.get("event") ?? "")
  const { ctx, t, here } = await manager(eventId)
  const id = String(fd.get("id") ?? "")
  const { error } = await ctx.supabase.from("ticket_types").delete().eq("id", id).eq("event_id", eventId)
  // Has tickets → foreign key: deactivate instead.
  if (error) back(`${here}?edit=${id}`, { error: error.code === "23503" ? t("tickets.typeHasTickets") : dbError(t, error) })
  back(here, { ok: t("tickets.deleted") })
}

export async function saveTicketSettings(fd: FormData) {
  const eventId = String(fd.get("event") ?? "")
  const { ctx, t, here } = await manager(eventId)
  const names = String(fd.get("ticket_names"))
  const max = Number(fd.get("max_tickets_per_order"))
  if (!["off", "optional", "required"].includes(names) || !Number.isInteger(max) || max < 1 || max > 100)
    back(here, { error: t("errors.invalid_input") })
  // Event fields need events.manage (RLS); ticket managers without it get an error from the DB.
  const { error, count } = await ctx.supabase
    .from("events")
    .update({ ticket_names: names, max_tickets_per_order: max, show_code_field: fd.get("show_code_field") === "on" }, { count: "exact" })
    .eq("id", eventId)
    .eq("org_id", ctx.org.id)
  if (error || !count) back(here, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  back(here, { ok: t("tickets.saved") })
}

// Abendkasse settings (events.door): methods, card reader, cash book account (must be the org's).
export async function saveDoorSettings(fd: FormData) {
  const eventId = String(fd.get("event") ?? "")
  const { ctx, t, here } = await manager(eventId)
  const door = readDoor({ methods: fd.getAll("methods").map(String), reader_id: String(fd.get("reader_id") ?? ""), cash_account_id: String(fd.get("cash_account_id") ?? "") })
  if (door.cash_account_id) {
    const { data: acc } = await ctx.supabase.from("cash_accounts").select("id").eq("id", door.cash_account_id).eq("org_id", ctx.org.id).maybeSingle()
    if (!acc) back(`${here}#door`, { error: t("errors.not_allowed") })
  }
  const { error, count } = await ctx.supabase.from("events").update({ door }, { count: "exact" }).eq("id", eventId).eq("org_id", ctx.org.id)
  if (error || !count) back(`${here}#door`, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  back(`${here}#door`, { ok: t("tickets.saved") })
}

// Price tiers of a type (Early Bird → Regular → …). Order = position; the first not sold out/ended is current.
export async function saveTier(fd: FormData) {
  const eventId = String(fd.get("event") ?? "")
  const { ctx, t, here } = await manager(eventId)
  const typeId = String(fd.get("type") ?? "")
  const id = String(fd.get("id") ?? "")
  const retry = `${here}?edit=${typeId}`
  const name = String(fd.get("name") ?? "").trim().slice(0, 100)
  const price = parsePrice(String(fd.get("price") ?? ""))
  const quotaRaw = String(fd.get("quota") ?? "").trim()
  const quota = quotaRaw ? Number(quotaRaw) : null
  const endRaw = String(fd.get("sales_end") ?? "").trim()
  const sales_end = endRaw ? fromLocalInput(endRaw)?.toISOString() : null
  const position = Number(fd.get("position") ?? 0)
  if (checkTier({ name, quota, position })) back(retry, { error: t("errors.invalid_input") })
  if (price === null) back(retry, { error: t("tickets.invalidPrice") })
  if (sales_end === undefined) back(retry, { error: t("errors.invalid_time") })
  const row = { name, price, quota, sales_end, position }
  const { error } = id
    ? await ctx.supabase.from("ticket_tiers").update(row).eq("id", id).eq("type_id", typeId)
    : await ctx.supabase.from("ticket_tiers").insert({ ...row, org_id: ctx.org.id, type_id: typeId })
  if (error) back(retry, { error: dbError(t, error) })
  back(retry, { ok: t("tickets.saved") })
}

export async function deleteTier(fd: FormData) {
  const eventId = String(fd.get("event") ?? "")
  const { ctx, t, here } = await manager(eventId)
  const typeId = String(fd.get("type") ?? "")
  const { error } = await ctx.supabase.from("ticket_tiers").delete().eq("id", String(fd.get("id") ?? "")).eq("type_id", typeId)
  if (error) back(`${here}?edit=${typeId}`, { error: error.code === "23503" ? t("tickets.tierHasTickets") : dbError(t, error) })
  back(`${here}?edit=${typeId}`, { ok: t("tickets.deleted") })
}

// Promo codes / discount links. kind: percent | amount (cents) | none (only unlocks hidden types).
export async function saveCode(fd: FormData) {
  const eventId = String(fd.get("event") ?? "")
  const { ctx, t, here } = await manager(eventId)
  const id = String(fd.get("id") ?? "")
  const retry = `${here}?${id ? `code=${id}` : "new=code"}`
  const code = normalizeCode(String(fd.get("code") ?? ""))
  const kind = String(fd.get("kind") ?? "")
  const raw = String(fd.get("value") ?? "").trim()
  const value = kind === "percent" ? Number(raw) : kind === "amount" ? parsePrice(raw) : 0
  const maxRaw = String(fd.get("max_uses") ?? "").trim()
  const max_uses = maxRaw && kind !== "none" ? Number(maxRaw) : null // unlock-only: the ticket type's quota is the limit
  const fromRaw = String(fd.get("valid_from") ?? "").trim()
  const untilRaw = String(fd.get("valid_until") ?? "").trim()
  const valid_from = fromRaw ? fromLocalInput(fromRaw)?.toISOString() : null
  const valid_until = untilRaw ? fromLocalInput(untilRaw)?.toISOString() : null
  const type_ids = fd.getAll("type_ids").map(String).filter((v) => /^[0-9a-f-]{36}$/.test(v))
  const invalid =
    checkCode({ code, kind, value, max_uses, valid_from: valid_from ?? null, valid_until: valid_until ?? null }) ??
    (valid_from === undefined || valid_until === undefined ? "errors.invalid_input" : null)
  if (invalid) back(retry, { error: t.dynamic(invalid) })
  const row = { code, kind, value: value!, max_uses, valid_from: valid_from ?? null, valid_until: valid_until ?? null, type_ids, active: fd.getAll("active").includes("1") }
  const { error } = id
    ? await ctx.supabase.from("ticket_codes").update(row).eq("id", id).eq("event_id", eventId)
    : await ctx.supabase.from("ticket_codes").insert({ ...row, org_id: ctx.org.id, event_id: eventId })
  if (error) back(retry, { error: error.code === "23505" ? t("tickets.codeTaken") : dbError(t, error) })
  back(here, { ok: t("tickets.saved") })
}

export async function deleteCode(fd: FormData) {
  const eventId = String(fd.get("event") ?? "")
  const { ctx, t, here } = await manager(eventId)
  const id = String(fd.get("id") ?? "")
  const { error } = await ctx.supabase.from("ticket_codes").delete().eq("id", id).eq("event_id", eventId)
  if (error) back(`${here}?code=${id}`, { error: error.code === "23503" ? t("tickets.codeUsed") : dbError(t, error) })
  back(here, { ok: t("tickets.deleted") })
}

/** Take someone off the waiting list (a held offer is released for the next in line). */
export async function removeFromWaitlist(fd: FormData) {
  const { ctx, t, here } = await manager(String(fd.get("event") ?? ""))
  const { error, count } = await ctx.supabase
    .from("event_waitlist")
    .update({ status: "cancelled" }, { count: "exact" })
    .eq("id", String(fd.get("id") ?? ""))
    .eq("org_id", ctx.org.id)
    .in("status", ["waiting", "offered"])
  back(`${here}#waitlist`, error || !count ? { error: error ? dbError(t, error) : t("errors.not_allowed") } : { ok: t("waitlist.removed") })
}

/** Pause or resume selling a ticket type (sold tickets stay valid). */
export async function setTicketTypeActive(fd: FormData) {
  const eventId = String(fd.get("event") ?? "")
  const { ctx, t, here } = await manager(eventId)
  const id = String(fd.get("id") ?? "")
  const active = fd.get("active") === "1"
  const { error } = await ctx.supabase.from("ticket_types").update({ active }).eq("id", id).eq("event_id", eventId)
  back(`${here}?edit=${id}`, error ? { error: dbError(t, error) } : { ok: active ? t("tickets.activated") : t("tickets.paused") })
}
