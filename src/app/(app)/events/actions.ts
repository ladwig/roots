"use server"

import { revalidatePath } from "next/cache"
import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { removeImage, replaceImage } from "@/lib/images"
import { fromLocalInput } from "@/lib/time"
import { loadFields, readCustom } from "@/lib/custom-fields"
import { refreshPublic } from "@/lib/public-cache"
import { back } from "@/lib/url"
import { checkEvent, EVENT_STATUSES, insertEvent } from "./fields"

const PATH = "/events"

async function manager() {
  const ctx = await requirePerm("events.manage")
  const t = await getT()
  if (!ctx.modules.has("events")) back(PATH, { error: t("errors.not_allowed") })
  return { ctx, t }
}

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim() || null
// Record id comes in as a hidden field (works without JS and is callable by plain form posts).
const idOf = (fd: FormData) => String(fd.get("id") ?? "")

// Validates the form; returns the row or an errors.* key.
function readEvent(fd: FormData) {
  const starts = fromLocalInput(String(fd.get("starts_at") ?? ""))
  if (!starts) return { error: "errors.invalid_time" }
  const endsRaw = text(fd, "ends_at")
  const ends = endsRaw ? fromLocalInput(endsRaw) : null
  if (endsRaw && !ends) return { error: "errors.invalid_time" }
  const capRaw = text(fd, "capacity")
  const row = {
    title: text(fd, "title") ?? "",
    starts_at: starts.toISOString(),
    ends_at: ends?.toISOString() ?? null,
    location_id: /^[0-9a-f-]{36}$/.test(String(fd.get("location") ?? "")) ? String(fd.get("location")) : null,
    venue_name: text(fd, "venue_name")?.slice(0, 200) ?? null,
    venue_address: text(fd, "venue_address")?.slice(0, 500) ?? null,
    description: text(fd, "description")?.slice(0, 20000) ?? null,
    capacity: capRaw ? Number(capRaw) : null,
  }
  const slug = text(fd, "slug")
  const error = checkEvent(row, slug)
  return error ? { error } : { row, slug }
}

// The org's custom fields for events (names "custom.<key>").
async function readEventCustom(ctx: Awaited<ReturnType<typeof manager>>["ctx"], fd: FormData) {
  return readCustom(await loadFields(ctx.supabase, ctx.org.id, "events"), (k) => String(fd.get(`custom.${k}`) ?? ""))
}

export async function createEvent(fd: FormData) {
  const { ctx, t } = await manager()
  const r = readEvent(fd)
  if ("error" in r) back(`${PATH}?new=event`, { error: t.dynamic(r.error!) })
  const c = await readEventCustom(ctx, fd)
  if ("error" in c) back(`${PATH}?new=event`, { error: `${c.field}: ${t.dynamic(c.error)}` })
  const res = await insertEvent(ctx.supabase, { ...r.row!, custom: c.custom, org_id: ctx.org.id }, r.slug ?? null)
  if (res.error) back(`${PATH}?new=event`, { error: res.error.code === "23505" ? t("errors.slug_taken") : dbError(t, res.error) })
  refreshPublic(ctx.org.id) // public pages show this
  back(`${PATH}?edit=${res.data!.id}`, { ok: t("eventsPage.created") })
}

export async function updateEvent(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const r = readEvent(fd)
  const here = `${PATH}?edit=${id}`
  if ("error" in r) back(here, { error: t.dynamic(r.error!) })
  const c = await readEventCustom(ctx, fd)
  if ("error" in c) back(here, { error: `${c.field}: ${t.dynamic(c.error)}` })
  const { error, count } = await ctx.supabase
    .from("events")
    .update({ ...r.row!, custom: c.custom, ...(r.slug ? { slug: r.slug } : {}) }, { count: "exact" })
    .eq("id", id)
    .eq("org_id", ctx.org.id)
  if (error || !count)
    back(here, { error: error?.code === "23505" ? t("errors.slug_taken") : error ? dbError(t, error) : t("errors.not_allowed") })
  deliverSoon()
  refreshPublic(ctx.org.id) // public pages show this
  back(here, { ok: t("eventsPage.saved") })
}

export async function setEventStatus(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const status = fd.get("status") as (typeof EVENT_STATUSES)[number]
  const here = `${PATH}?edit=${id}`
  if (!EVENT_STATUSES.includes(status)) back(here, { error: t("errors.invalid_input") })
  const { error, count } = await ctx.supabase.from("events").update({ status }, { count: "exact" }).eq("id", id).eq("org_id", ctx.org.id)
  if (error || !count) back(here, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  deliverSoon()
  refreshPublic(ctx.org.id) // public pages show this
  back(here, {
    ok: t(status === "published" ? "eventsPage.published" : status === "draft" ? "eventsPage.unpublished" : "eventsPage.cancelledOk"),
  })
}

export async function trashEvent(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.events", p_id: id })
  if (error) back(`${PATH}?edit=${id}`, { error: dbError(t, error) })
  refreshPublic(ctx.org.id) // public pages show this
  back(PATH, { ok: t("eventsPage.trashed") })
}

export async function restoreEvent(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.events", p_id: id })
  // A live event took the address meanwhile → unique violation.
  if (error) back(`${PATH}?trash=1&edit=${id}`, { error: error.code === "23505" ? t("errors.slug_taken") : dbError(t, error) })
  refreshPublic(ctx.org.id) // public pages show this
  back(`${PATH}?edit=${id}`, { ok: t("eventsPage.restored") })
}

export async function updateEventImage(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const here = `${PATH}?edit=${id}`
  const { data: ev } = await ctx.supabase.from("events").select("image_path").eq("id", id).eq("org_id", ctx.org.id).maybeSingle()
  if (!ev) back(here, { error: t("errors.not_allowed") })
  let image_path: string | null = null
  if (fd.get("remove") === "1") await removeImage(ctx.supabase, ev.image_path)
  else {
    const res = await replaceImage(ctx.supabase, `orgs/${ctx.org.id}/events/${id}`, fd.get("file"), ev.image_path)
    if ("error" in res) back(here, { error: t.dynamic(`errors.${res.error}`) })
    image_path = res.path!
  }
  const { error } = await ctx.supabase.from("events").update({ image_path }).eq("id", id)
  if (error) back(here, { error: dbError(t, error) })
  revalidatePath(PATH)
  refreshPublic(ctx.org.id) // public pages show this
  back(here, { ok: t("eventsPage.saved") })
}
