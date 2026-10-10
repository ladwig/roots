"use server"

import { redirect } from "next/navigation"
import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { fromLocalInput } from "@/lib/time"
import { back } from "@/lib/url"
import { linkToken, syncTickets, voidTicket } from "@/guestlists/server"
import { parsePrice } from "@/tickets/price"

const PATH = "/guestlists"
const UUID = /^[0-9a-f-]{36}$/

async function manager() {
  const ctx = await requirePerm("guestlists.manage")
  const t = await getT()
  if (!ctx.modules.has("guestlists")) back(PATH, { error: t("errors.not_allowed") })
  return { ctx, t }
}

export async function saveList(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const eventRaw = String(fd.get("event") ?? "")
  const eventId = UUID.test(eventRaw) ? eventRaw : null
  const retry = id ? `${PATH}/${id}?edit=1` : `${PATH}?new=list${eventId ? `&event=${eventId}` : ""}`
  const name = String(fd.get("name") ?? "").trim().slice(0, 100)
  const price = parsePrice(String(fd.get("door_price") ?? "0") || "0")
  const quotaRaw = String(fd.get("quota") ?? "").trim()
  const quota = quotaRaw ? Number(quotaRaw) : null
  const per = Number(fd.get("per_submission") ?? 5)
  const closesRaw = String(fd.get("link_closes_at") ?? "").trim()
  const closes = closesRaw ? fromLocalInput(closesRaw)?.toISOString() : null
  const artist = String(fd.get("artist") ?? "")
  const ticketType = String(fd.get("ticket_type") ?? "")
  if (!name || price === null || (quota !== null && !(Number.isInteger(quota) && quota > 0)) || !(Number.isInteger(per) && per >= 1 && per <= 50) || closes === undefined)
    back(retry, { error: t("errors.invalid_input") })
  const row = {
    name,
    door_price: price!,
    quota,
    per_submission: per,
    link_closes_at: closes,
    artist_id: UUID.test(artist) ? artist : null,
    ticket_type_id: eventId || id ? (UUID.test(ticketType) ? ticketType : null) : null,
    notes: String(fd.get("notes") ?? "").trim().slice(0, 2000) || null,
  }
  if (id) {
    const { error } = await ctx.supabase.from("guest_lists").update(row).eq("id", id).eq("org_id", ctx.org.id)
    if (error) back(retry, { error: dbError(t, error) })
    await syncTickets(id)
    back(`${PATH}/${id}`, { ok: t("guestlists.saved") })
  }
  const { data, error } = await ctx.supabase
    .from("guest_lists")
    .insert({ ...row, org_id: ctx.org.id, event_id: eventId, link_token: linkToken() })
    .select("id")
    .single()
  if (error) back(retry, { error: dbError(t, error) })
  redirect(`${PATH}/${data.id}`)
}

export async function setLink(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const what = String(fd.get("link"))
  const patch = what === "renew" ? { link_token: linkToken(), link_enabled: true } : { link_enabled: what === "on" }
  const { error } = await ctx.supabase.from("guest_lists").update(patch).eq("id", id).eq("org_id", ctx.org.id)
  if (error) back(`${PATH}/${id}`, { error: dbError(t, error) })
  back(`${PATH}/${id}`, { ok: t.dynamic(`guestlists.link_${what}`) })
}

export async function trashList(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const { data: entries } = await ctx.supabase.from("guest_entries").select("ticket_id").eq("list_id", id)
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.guest_lists", p_id: id })
  if (error) back(`${PATH}/${id}`, { error: dbError(t, error) })
  for (const e of entries ?? []) await voidTicket(e.ticket_id)
  back(PATH, { ok: t("guestlists.trashed") })
}

// Names: one per line ("Anna Muster", or "Anna Muster, anna@x.de").
export async function addEntries(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const here = `${PATH}/${id}`
  const lines = String(fd.get("names") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 500)
  if (!lines.length) back(here, { error: t("guestlists.noNames") })
  const { data: list } = await ctx.supabase.from("guest_lists").select("quota").eq("id", id).eq("org_id", ctx.org.id).maybeSingle()
  if (!list) back(PATH, { error: t("errors.not_allowed") })
  if (list.quota) {
    const { count } = await ctx.supabase.from("guest_entries").select("id", { count: "exact", head: true }).eq("list_id", id)
    if ((count ?? 0) + lines.length > list.quota) back(here, { error: t("guestlists.full") })
  }
  const rows = lines.map((l) => {
    const [name, email] = l.split(/[,;\t]/).map((s) => s.trim())
    return { org_id: ctx.org.id, list_id: id, name: name.slice(0, 200), email: email && /@/.test(email) ? email.toLowerCase().slice(0, 320) : null }
  })
  const { error } = await ctx.supabase.from("guest_entries").insert(rows)
  if (error) back(here, { error: dbError(t, error) })
  await syncTickets(id)
  back(here, { ok: t("guestlists.added", { count: rows.length }) })
}

// Replace a person (e.g. a friend can't come): same entry and, if linked, same ticket with the new name.
export async function renameEntry(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const name = String(fd.get("name") ?? "").trim().slice(0, 200)
  const { data: entry } = await ctx.supabase.from("guest_entries").select("list_id").eq("id", String(fd.get("entry") ?? "")).eq("org_id", ctx.org.id).maybeSingle()
  if (!entry || !name) back(`${PATH}/${id}`, { error: t("errors.invalid_input") })
  const { error } = await ctx.supabase.from("guest_entries").update({ name }).eq("id", String(fd.get("entry"))).eq("org_id", ctx.org.id)
  if (error) back(`${PATH}/${id}`, { error: dbError(t, error) })
  await syncTickets(entry.list_id)
  back(`${PATH}/${id}`, { ok: t("guestlists.saved") })
}

export async function removeEntry(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const { data: entry } = await ctx.supabase.from("guest_entries").select("ticket_id").eq("id", String(fd.get("entry") ?? "")).eq("org_id", ctx.org.id).maybeSingle()
  const { error } = await ctx.supabase.from("guest_entries").delete().eq("id", String(fd.get("entry") ?? "")).eq("org_id", ctx.org.id)
  if (error) back(`${PATH}/${id}`, { error: dbError(t, error) })
  await voidTicket(entry?.ticket_id ?? null)
  deliverSoon()
  back(`${PATH}/${id}`, { ok: t("guestlists.removed") })
}
