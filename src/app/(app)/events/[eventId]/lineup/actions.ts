"use server"

import { redirect } from "next/navigation"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { fromLocalInput } from "@/lib/time"
import { back } from "@/lib/url"
import { linkToken } from "@/guestlists/server"

const UUID = /^[0-9a-f-]{36}$/
async function manager(eventId: string) {
  const ctx = await requirePerm("events.manage")
  const t = await getT()
  if (!UUID.test(eventId)) back("/events", { error: t("errors.not_allowed") })
  return { ctx, t, here: `/events/${eventId}/lineup` }
}

// Slot: an artist (existing, or a new one by name) or a free title, with stage and times.
export async function saveSlot(fd: FormData) {
  const eventId = String(fd.get("event") ?? "")
  const { ctx, t, here } = await manager(eventId)
  const id = String(fd.get("id") ?? "")
  const retry = `${here}?${id ? `slot=${id}` : "new=slot"}`
  const starts = fromLocalInput(String(fd.get("starts_at") ?? ""))
  const endsRaw = String(fd.get("ends_at") ?? "").trim()
  const ends = endsRaw ? fromLocalInput(endsRaw) : null
  if (!starts || (endsRaw && !ends)) back(retry, { error: t("errors.invalid_time") })
  if (ends && ends <= starts) back(retry, { error: t("errors.end_before_start") })
  let artistId = String(fd.get("artist") ?? "")
  const newArtist = String(fd.get("new_artist") ?? "").trim().slice(0, 200)
  if (newArtist) {
    const { data, error } = await ctx.supabase.from("artists").insert({ org_id: ctx.org.id, name: newArtist }).select("id").single()
    if (error) back(retry, { error: dbError(t, error) })
    artistId = data.id
  }
  const title = String(fd.get("title") ?? "").trim().slice(0, 200) || null
  if (!UUID.test(artistId) && !title) back(retry, { error: t("lineup.needArtistOrTitle") })
  const row = {
    artist_id: UUID.test(artistId) ? artistId : null,
    title,
    stage: String(fd.get("stage") ?? "").trim().slice(0, 100) || null,
    starts_at: starts.toISOString(),
    ends_at: ends?.toISOString() ?? null,
    public: fd.get("public") === "1",
    notes: String(fd.get("notes") ?? "").trim().slice(0, 2000) || null,
  }
  const { error } = id
    ? await ctx.supabase.from("event_slots").update(row).eq("id", id).eq("event_id", eventId)
    : await ctx.supabase.from("event_slots").insert({ ...row, org_id: ctx.org.id, event_id: eventId })
  if (error) back(retry, { error: dbError(t, error) })
  back(here, { ok: t("lineup.saved") })
}

export async function deleteSlot(fd: FormData) {
  const eventId = String(fd.get("event") ?? "")
  const { ctx, t, here } = await manager(eventId)
  const { error } = await ctx.supabase.from("event_slots").delete().eq("id", String(fd.get("id") ?? "")).eq("event_id", eventId)
  if (error) back(here, { error: dbError(t, error) })
  back(here, { ok: t("lineup.deleted") })
}

export async function saveArtist(fd: FormData) {
  const eventId = String(fd.get("event") ?? "")
  const { ctx, t, here } = await manager(eventId)
  const id = String(fd.get("id") ?? "")
  const name = String(fd.get("name") ?? "").trim().slice(0, 200)
  const links = String(fd.get("links") ?? "")
    .split(/\s+/)
    .filter((l) => /^https?:\/\/\S+$/.test(l))
    .slice(0, 10)
  if (!name) back(`${here}?artist=${id}`, { error: t("errors.invalid_input") })
  const { error } = await ctx.supabase
    .from("artists")
    .update({
      name,
      links,
      description: String(fd.get("description") ?? "").trim().slice(0, 5000) || null,
      notes: String(fd.get("notes") ?? "").trim().slice(0, 5000) || null,
    })
    .eq("id", id)
    .eq("org_id", ctx.org.id)
  if (error) back(`${here}?artist=${id}`, { error: dbError(t, error) })
  back(here, { ok: t("lineup.saved") })
}

// "Guest list for this artist": one list per artist and event, link already on.
export async function artistGuestList(fd: FormData) {
  const eventId = String(fd.get("event") ?? "")
  const { ctx, t, here } = await manager(eventId)
  if (!ctx.modules.has("guestlists") || !ctx.can("guestlists.manage")) back(here, { error: t("errors.not_allowed") })
  const artistId = String(fd.get("artist") ?? "")
  const { data: existing } = await ctx.supabase.from("guest_lists").select("id").eq("event_id", eventId).eq("artist_id", artistId).is("deleted_at", null).maybeSingle()
  if (existing) redirect(`/guestlists/${existing.id}`)
  const { data: artist } = await ctx.supabase.from("artists").select("name").eq("id", artistId).eq("org_id", ctx.org.id).maybeSingle()
  if (!artist) back(here, { error: t("errors.not_allowed") })
  const { data, error } = await ctx.supabase
    .from("guest_lists")
    .insert({ org_id: ctx.org.id, event_id: eventId, artist_id: artistId, name: `${artist.name} +`, quota: 5, per_submission: 5, link_token: linkToken(), link_enabled: true })
    .select("id")
    .single()
  if (error) back(here, { error: dbError(t, error) })
  redirect(`/guestlists/${data.id}`)
}
