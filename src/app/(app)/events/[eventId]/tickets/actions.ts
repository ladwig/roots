"use server"

import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { fromLocalInput } from "@/lib/time"
import { back } from "@/lib/url"
import { parsePrice } from "@/tickets/price"

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
  if (!name || (quota !== null && !(Number.isInteger(quota) && quota > 0))) return { error: "errors.invalid_input" }
  if (sales_start === undefined || sales_end === undefined) return { error: "errors.invalid_time" }
  if (sales_start && sales_end && sales_end <= sales_start) return { error: "errors.end_before_start" }
  return { row: { name, description, quota, sales_start, sales_end, active: fd.getAll("active").includes("1"), hidden: fd.get("hidden") === "1" } }
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
    .update({ ticket_names: names, max_tickets_per_order: max }, { count: "exact" })
    .eq("id", eventId)
    .eq("org_id", ctx.org.id)
  if (error || !count) back(here, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  back(here, { ok: t("tickets.saved") })
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
  if (!name || (quota !== null && !(Number.isInteger(quota) && quota > 0)) || !Number.isInteger(position)) back(retry, { error: t("errors.invalid_input") })
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
  const code = String(fd.get("code") ?? "").trim().toUpperCase().replace(/\s+/g, "-")
  const kind = String(fd.get("kind") ?? "")
  const raw = String(fd.get("value") ?? "").trim()
  const value = kind === "percent" ? Number(raw) : kind === "amount" ? parsePrice(raw) : 0
  const maxRaw = String(fd.get("max_uses") ?? "").trim()
  const max_uses = maxRaw ? Number(maxRaw) : null
  const fromRaw = String(fd.get("valid_from") ?? "").trim()
  const untilRaw = String(fd.get("valid_until") ?? "").trim()
  const valid_from = fromRaw ? fromLocalInput(fromRaw)?.toISOString() : null
  const valid_until = untilRaw ? fromLocalInput(untilRaw)?.toISOString() : null
  const type_ids = fd.getAll("type_ids").map(String).filter((v) => /^[0-9a-f-]{36}$/.test(v))
  if (!/^[A-Z0-9][A-Z0-9-]{1,38}[A-Z0-9]$/.test(code)) back(retry, { error: t("tickets.codeFormat") })
  if (!["percent", "amount", "none"].includes(kind) || value === null || !Number.isInteger(value) || value < 0 || (kind === "percent" && (value < 1 || value > 100)))
    back(retry, { error: t("tickets.codeValue") })
  if ((max_uses !== null && !(Number.isInteger(max_uses) && max_uses > 0)) || valid_from === undefined || valid_until === undefined)
    back(retry, { error: t("errors.invalid_input") })
  if (valid_from && valid_until && valid_until <= valid_from) back(retry, { error: t("errors.end_before_start") })
  const row = { code, kind, value: value!, max_uses, valid_from, valid_until, type_ids, active: fd.getAll("active").includes("1") }
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
