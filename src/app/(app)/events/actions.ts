"use server"

import { revalidatePath } from "next/cache"
import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { removeImage, replaceImage } from "@/lib/images"
import { fromLocalInput } from "@/lib/time"
import { back } from "@/lib/url"
import { slugify } from "./slug"

const PATH = "/events"
const STATUSES = ["draft", "published", "cancelled"] as const

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
  const title = text(fd, "title")
  if (!title || title.length > 200) return { error: "errors.invalid_input" }
  const starts = fromLocalInput(String(fd.get("starts_at") ?? ""))
  if (!starts) return { error: "errors.invalid_time" }
  const endsRaw = text(fd, "ends_at")
  const ends = endsRaw ? fromLocalInput(endsRaw) : null
  if (endsRaw && !ends) return { error: "errors.invalid_time" }
  if (ends && ends <= starts) return { error: "errors.end_before_start" }
  const capRaw = text(fd, "capacity")
  const capacity = capRaw ? Number(capRaw) : null
  if (capacity !== null && !(Number.isInteger(capacity) && capacity > 0)) return { error: "errors.invalid_input" }
  const slug = text(fd, "slug")
  if (slug && !/^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$/.test(slug)) return { error: "errors.invalid_input" }
  return {
    row: {
      title,
      starts_at: starts.toISOString(),
      ends_at: ends?.toISOString() ?? null,
      venue_name: text(fd, "venue_name")?.slice(0, 200) ?? null,
      venue_address: text(fd, "venue_address")?.slice(0, 500) ?? null,
      description: text(fd, "description")?.slice(0, 20000) ?? null,
      capacity,
    },
    slug,
  }
}

export async function createEvent(fd: FormData) {
  const { ctx, t } = await manager()
  const r = readEvent(fd)
  if ("error" in r) back(`${PATH}?new=event`, { error: t.dynamic(r.error!) })
  const insert = (slug: string) =>
    ctx.supabase
      .from("events")
      .insert({ ...r.row!, org_id: ctx.org.id, slug })
      .select("id")
      .single()
  let res = await insert(r.slug ?? slugify(r.row!.title))
  // Auto address taken (same title as another event) → add a short suffix once.
  if (res.error?.code === "23505" && !r.slug) res = await insert(`${slugify(r.row!.title).slice(0, 74)}-${crypto.randomUUID().slice(0, 4)}`)
  if (res.error) back(`${PATH}?new=event`, { error: res.error.code === "23505" ? t("errors.slug_taken") : dbError(t, res.error) })
  back(`${PATH}?edit=${res.data!.id}`, { ok: t("eventsPage.created") })
}

export async function updateEvent(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const r = readEvent(fd)
  const here = `${PATH}?edit=${id}`
  if ("error" in r) back(here, { error: t.dynamic(r.error!) })
  const { error, count } = await ctx.supabase
    .from("events")
    .update({ ...r.row!, ...(r.slug ? { slug: r.slug } : {}) }, { count: "exact" })
    .eq("id", id)
    .eq("org_id", ctx.org.id)
  if (error || !count)
    back(here, { error: error?.code === "23505" ? t("errors.slug_taken") : error ? dbError(t, error) : t("errors.not_allowed") })
  deliverSoon()
  back(here, { ok: t("eventsPage.saved") })
}

export async function setEventStatus(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const status = fd.get("status") as (typeof STATUSES)[number]
  const here = `${PATH}?edit=${id}`
  if (!STATUSES.includes(status)) back(here, { error: t("errors.invalid_input") })
  const { error, count } = await ctx.supabase.from("events").update({ status }, { count: "exact" }).eq("id", id).eq("org_id", ctx.org.id)
  if (error || !count) back(here, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  deliverSoon()
  back(here, {
    ok: t(status === "published" ? "eventsPage.published" : status === "draft" ? "eventsPage.unpublished" : "eventsPage.cancelledOk"),
  })
}

export async function trashEvent(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.events", p_id: id })
  if (error) back(`${PATH}?edit=${id}`, { error: dbError(t, error) })
  back(PATH, { ok: t("eventsPage.trashed") })
}

export async function restoreEvent(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.events", p_id: id })
  // A live event took the address meanwhile → unique violation.
  if (error) back(`${PATH}?trash=1&edit=${id}`, { error: error.code === "23505" ? t("errors.slug_taken") : dbError(t, error) })
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
  back(here, { ok: t("eventsPage.saved") })
}
