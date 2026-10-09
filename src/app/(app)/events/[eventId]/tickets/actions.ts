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
  return { row: { name, description, quota, sales_start, sales_end, active: fd.getAll("active").includes("1") } }
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
