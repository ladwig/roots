import { z } from "zod"
import { checkEvent, EVENT_SLUG, EVENT_STATUSES, insertEvent, TICKET_NAMES } from "@/app/(app)/events/fields"
import { deliverSoon } from "@/events/worker"
import { messages } from "@/i18n/config"
import { createT } from "@/i18n/translate"
import { loadFields, readCustomObject } from "@/lib/custom-fields"
import { imageUrl, removeImage } from "@/lib/images"
import { refreshPublicFromApi } from "@/lib/public-cache"
import type { TablesUpdate } from "@/lib/supabase/types"
import { ApiError, dbError, endpoint, list, notFound, page, paged, uuid, type Endpoint } from "../core"
import { Custom, putImage, ts, type Db } from "./shared"

const en = createT("en", messages.en)
const dt = z.iso.datetime({ offset: true }).describe("ISO 8601 time")
const ok = z.object({ ok: z.literal(true) })

export const Event = z.object({
  id: uuid,
  title: z.string(),
  slug: z.string().describe("Address of the public page: /e/<slug>"),
  status: z.enum(EVENT_STATUSES),
  starts_at: ts,
  ends_at: ts.nullable(),
  location_id: uuid.nullable(),
  venue_name: z.string().nullable(),
  venue_address: z.string().nullable(),
  description: z.string().nullable(),
  capacity: z.number().int().nullable().describe("Max. tickets over all types (null = no limit); sold out → waiting list"),
  image_url: z.string().nullable(),
  ticket_names: z.enum(TICKET_NAMES).describe("Ask buyers for a name per ticket"),
  max_tickets_per_order: z.number().int(),
  links: z.array(z.object({ label: z.string(), url: z.string() })).describe("The event's own links (max 3), shown as buttons on its page"),
  email_template_id: uuid.nullable().describe("Email template for this event's ticket, guest-list and waiting-list mails (null = the org's default, else roots' built-in mail). See GET /email/templates"),
  custom: Custom,
  published_at: ts.nullable(),
  deleted_at: ts.nullable().describe("Set while in the trash"),
  created_at: ts,
  updated_at: ts,
})
export const EVENT_COLS =
  "id, title, slug, status, starts_at, ends_at, location_id, venue_name, venue_address, description, capacity, image_path, ticket_names, max_tickets_per_order, links, email_template_id, custom, published_at, deleted_at, created_at, updated_at"
const eventOut = <T extends { image_path: string | null }>({ image_path, ...e }: T) => ({ ...e, image_url: imageUrl(image_path) ?? null })

const EventFields = z.object({
  title: z.string().max(200),
  slug: z.string().regex(EVENT_SLUG).describe("2–80 characters a–z, 0–9, hyphens. Default: from the title"),
  status: z.enum(EVENT_STATUSES).describe("draft = not public; published = public page + ticket shop; cancelled = public, marked cancelled"),
  starts_at: dt,
  ends_at: dt.nullable(),
  location_id: uuid.nullable().describe("A location of the organisation"),
  venue_name: z.string().max(200).nullable(),
  venue_address: z.string().max(500).nullable(),
  description: z.string().max(20000).nullable(),
  capacity: z.number().int().min(1).nullable(),
  ticket_names: z.enum(TICKET_NAMES),
  max_tickets_per_order: z.number().int().min(1).max(100),
  email_template_id: uuid.nullable().describe("An email template of the org (GET /email/templates); null = the org's default"),
  links: z.array(z.object({ label: z.string().trim().min(1).max(60), url: z.url({ protocol: /^https?$/ }).max(500) })).max(3).describe("Up to 3 links (title + https URL), e.g. Telegram group; replaces the list"),
  custom: Custom.describe("Custom fields of the org for events: { key: value } (validated like in the App; on update merged)"),
})

// Messages for the shared field checks (keys from the App's validators).
const INVALID: Record<string, [string, string]> = {
  "errors.invalid_input": ["invalid_input", "Invalid input."],
  "errors.end_before_start": ["end_before_start", "The end must be after the start."],
  "tickets.codeFormat": ["invalid_code", "Codes are 3–40 characters: A–Z, 0–9 and hyphens."],
  "tickets.codeValue": ["invalid_value", "value: percent 1–100, amount in cents ≥ 0, none 0."],
}
export const invalid = (key: string) => new ApiError(422, ...(INVALID[key] ?? INVALID["errors.invalid_input"]))
// Custom field values through the same validator as the App's form.
async function eventCustom(db: Db, orgId: string, values: Record<string, string | number | boolean> | undefined) {
  const r = readCustomObject(await loadFields(db, orgId, "events"), values)
  if ("error" in r) throw new ApiError(422, r.error.replace(/^errors\./, ""), `${r.field}: ${en.dynamic(r.error)}`)
  return r.custom
}
const slugTaken = () => new ApiError(409, "slug_taken", "Another event already uses this address (slug).")

// Body → row: strings trimmed ("" = null), times normalised to UTC.
export const clean = <T extends Record<string, unknown>>(b: T) =>
  Object.fromEntries(
    Object.entries(b).map(([k, v]) => [k, typeof v === "string" ? (/_(at|start|end|from|until)$/.test(k) ? new Date(v).toISOString() : v.trim() || null) : v]),
  ) as { [K in keyof T]: string extends T[K] ? Exclude<T[K], string> | string | null : T[K] }

export async function eventOf(db: Db, orgId: string, id: string) {
  const { data } = await db.from("events").select("id").eq("id", id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
  if (!data) throw notFound()
}
async function getEvent(db: Db, orgId: string, id: string) {
  const { data } = await db.from("events").select(EVENT_COLS).eq("id", id).eq("org_id", orgId).maybeSingle()
  if (!data) throw notFound()
  return eventOut(data)
}
async function locationOf(db: Db, orgId: string, id: string | null | undefined) {
  if (!id) return
  const { data } = await db.from("locations").select("id").eq("id", id).eq("org_id", orgId).maybeSingle()
  if (!data) throw new ApiError(422, "invalid_reference", "location_id does not belong to this organisation.")
}
async function templateOf(db: Db, orgId: string, id: string | null | undefined) {
  if (!id) return
  const { data } = await db.from("email_templates").select("id").eq("id", id).eq("org_id", orgId).maybeSingle()
  if (!data) throw new ApiError(422, "invalid_reference", "email_template_id does not belong to this organisation.")
}

// Lineup
const Slot = z.object({
  id: uuid,
  event_id: uuid,
  artist_id: uuid.nullable(),
  artist_name: z.string().nullable(),
  title: z.string().nullable().describe("Free title when there's no artist (Doors, Panel…)"),
  stage: z.string().nullable(),
  starts_at: ts,
  ends_at: ts.nullable(),
  public: z.boolean().describe("Shown in the public timetable"),
  notes: z.string().nullable().describe("Internal"),
  created_at: ts,
  updated_at: ts,
})
const SLOT_COLS = "id, event_id, artist_id, title, stage, starts_at, ends_at, public, notes, created_at, updated_at, artists(name)"
const slotOut = <T extends { artists: { name: string } | null }>({ artists, ...s }: T) => ({ ...s, artist_name: artists?.name ?? null })
const SlotFields = z.object({
  artist_id: uuid.nullable(),
  new_artist: z.string().min(1).max(200).describe("Creates an artist with this name and puts it on the slot"),
  title: z.string().max(200).nullable(),
  stage: z.string().max(100).nullable(),
  starts_at: dt,
  ends_at: dt.nullable(),
  public: z.boolean(),
  notes: z.string().max(2000).nullable(),
})

const Artist = z.object({
  id: uuid,
  name: z.string(),
  description: z.string().nullable().describe("Public (shown with the lineup)"),
  links: z.array(z.string()),
  notes: z.string().nullable().describe("Internal (fee, rider, hotel…)"),
  created_at: ts,
  updated_at: ts,
})
const ARTIST_COLS = "id, name, description, links, notes, created_at, updated_at"
const ArtistFields = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(5000).nullable(),
    links: z
      .array(z.string().max(500).regex(/^https?:\/\/\S+$/))
      .max(10)
      .describe("http(s) links, max. 10"),
    notes: z.string().max(5000).nullable(),
  })
  .strict()

async function artistOf(db: Db, orgId: string, id: string | null | undefined) {
  if (!id) return
  const { data } = await db.from("artists").select("id").eq("id", id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
  if (!data) throw new ApiError(422, "invalid_reference", "artist_id does not belong to this organisation.")
}

// Validates a slot (merged with the stored one on PATCH) and creates `new_artist` if given.
async function slotRow(db: Db, orgId: string, body: Partial<z.infer<typeof SlotFields>>, old?: { artist_id: string | null; title: string | null; starts_at: string; ends_at: string | null }) {
  const { new_artist, ...rest } = body
  const row = clean(rest)
  const next = { ...old, ...row }
  if (next.ends_at && next.starts_at && Date.parse(next.ends_at) <= Date.parse(next.starts_at)) throw invalid("errors.end_before_start")
  if (!new_artist?.trim() && !next.artist_id && !next.title) throw new ApiError(422, "artist_or_title", "Give artist_id, new_artist or title.")
  await artistOf(db, orgId, row.artist_id)
  if (new_artist?.trim()) {
    const { data, error } = await db.from("artists").insert({ org_id: orgId, name: new_artist.trim() }).select("id").single()
    if (error) throw dbError(error)
    row.artist_id = data.id
  }
  return row
}

const imageOf = async (db: Db, orgId: string, id: string) => {
  const { data } = await db.from("events").select("image_path").eq("id", id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
  if (!data) throw notFound()
  return data.image_path
}

export const endpoints: Endpoint[] = [
  endpoint({
    method: "PUT",
    path: "/events/{id}/image",
    permission: "events.manage",
    tag: "Events",
    summary: "Upload the event picture",
    description: "Send the image itself as the body (`Content-Type: image/jpeg|png|webp|gif`, max. 2 MB). Replaces the previous picture.",
    upload: "image",
    response: z.object({ image_url: z.string() }),
    async handler({ db, orgId, params, request }) {
      const previous = await imageOf(db, orgId, params.id)
      const path = await putImage(db, request, `orgs/${orgId}/events/${params.id}`, previous)
      const { error } = await db.from("events").update({ image_path: path }).eq("id", params.id).eq("org_id", orgId)
      if (error) throw dbError(error)
      refreshPublicFromApi(orgId)
      return { image_url: imageUrl(path) }
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/events/{id}/image",
    permission: "events.manage",
    tag: "Events",
    summary: "Remove the event picture",
    response: z.object({ ok: z.literal(true) }),
    async handler({ db, orgId, params }) {
      const previous = await imageOf(db, orgId, params.id)
      const { error } = await db.from("events").update({ image_path: null }).eq("id", params.id).eq("org_id", orgId)
      if (error) throw dbError(error)
      await removeImage(db, previous)
      refreshPublicFromApi(orgId)
      return { ok: true }
    },
  }),
  endpoint({
    method: "GET",
    path: "/events",
    permission: "events.view",
    tag: "Events",
    summary: "List events",
    query: page.extend({
      status: z.enum(EVENT_STATUSES).optional(),
      from: z.iso.datetime({ offset: true }).optional().describe("Only events ending/starting after this time"),
      deleted: z.stringbool().default(false).describe("true = the trash (purged after 30 days)"),
    }),
    response: list(Event),
    async handler({ db, orgId, query }) {
      let q = db.from("events").select(EVENT_COLS).eq("org_id", orgId).order("starts_at").range(query.offset, query.offset + query.limit)
      q = query.deleted ? q.not("deleted_at", "is", null) : q.is("deleted_at", null)
      if (query.status) q = q.eq("status", query.status)
      if (query.from) q = q.or(`ends_at.gte.${query.from},and(ends_at.is.null,starts_at.gte.${query.from})`)
      const { data } = await q
      return paged(data?.map(eventOut) ?? [], query)
    },
  }),
  endpoint({
    method: "GET",
    path: "/events/{id}",
    permission: "events.view",
    tag: "Events",
    summary: "Get an event",
    description: "Also returns events in the trash (`deleted_at` set).",
    response: Event,
    handler: ({ db, orgId, params }) => getEvent(db, orgId, params.id),
  }),
  endpoint({
    method: "POST",
    path: "/events",
    permission: "events.manage",
    tag: "Events",
    summary: "Create an event",
    description: "Starts as a draft unless `status` is given. Without `slug` the address comes from the title (409 `slug_taken` if a given slug is in use).",
    body: EventFields.partial().required({ title: true, starts_at: true }).strict(),
    response: Event,
    status: 201,
    async handler({ db, orgId, body }) {
      const { slug, custom, ...rest } = body
      const row = { ...clean(rest), custom: await eventCustom(db, orgId, custom) }
      const err = checkEvent({ ends_at: null, capacity: null, ...row, title: row.title ?? null, starts_at: row.starts_at! }, slug)
      if (err) throw invalid(err)
      await Promise.all([locationOf(db, orgId, row.location_id), templateOf(db, orgId, row.email_template_id)])
      const res = await insertEvent(db, { ...row, title: row.title!, starts_at: row.starts_at!, org_id: orgId }, slug ?? null)
      if (res.error) throw res.error.code === "23505" ? slugTaken() : dbError(res.error)
      deliverSoon()
      refreshPublicFromApi(orgId)
      return getEvent(db, orgId, res.data.id)
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/events/{id}",
    permission: "events.manage",
    tag: "Events",
    summary: "Update an event",
    description:
      "Only the given fields change; null clears. `status` publishes (`published`), unpublishes (`draft`) or cancels (`cancelled`) the event. `ticket_names` and `max_tickets_per_order` are the ticket shop settings.",
    body: EventFields.partial().strict(),
    response: Event,
    async handler({ db, orgId, params, body }) {
      const { data: old } = await db.from("events").select("title, starts_at, ends_at, capacity, custom").eq("id", params.id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
      if (!old) throw notFound()
      const { custom, ...fields } = body
      const row = { ...clean(fields), ...(custom && { custom: await eventCustom(db, orgId, { ...(old.custom as Record<string, string>), ...custom }) }) }
      const err = checkEvent({ ...old, ...row, title: row.title === undefined ? old.title : row.title, starts_at: row.starts_at ?? old.starts_at }, body.slug)
      if (err) throw invalid(err)
      await Promise.all([locationOf(db, orgId, row.location_id), templateOf(db, orgId, row.email_template_id)])
      const { data, error } = await db
        .from("events")
        .update(row as TablesUpdate<"events">)
        .eq("id", params.id)
        .eq("org_id", orgId)
        .select(EVENT_COLS)
        .single()
      if (error) throw error.code === "23505" ? slugTaken() : dbError(error)
      deliverSoon()
      refreshPublicFromApi(orgId)
      return eventOut(data)
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/events/{id}",
    permission: "events.manage",
    tag: "Events",
    summary: "Move an event to the trash",
    description: "Its public page goes offline. Restorable for 30 days, then purged.",
    response: ok,
    async handler({ db, orgId, params }) {
      await eventOf(db, orgId, params.id)
      const { error } = await db.rpc("soft_delete", { p_table: "public.events", p_id: params.id })
      if (error) throw dbError(error)
      refreshPublicFromApi(orgId)
      return { ok: true as const }
    },
  }),
  endpoint({
    method: "POST",
    path: "/events/{id}/restore",
    permission: "events.manage",
    tag: "Events",
    summary: "Restore an event from the trash",
    description: "409 `slug_taken` if another event took its address meanwhile.",
    response: Event,
    async handler({ db, orgId, params }) {
      const { data } = await db.from("events").select("id").eq("id", params.id).eq("org_id", orgId).not("deleted_at", "is", null).maybeSingle()
      if (!data) throw notFound()
      const { error } = await db.rpc("restore_deleted", { p_table: "public.events", p_id: params.id })
      if (error) throw error.code === "23505" ? slugTaken() : dbError(error)
      refreshPublicFromApi(orgId)
      return getEvent(db, orgId, params.id)
    },
  }),

  // Lineup: timetable slots per event + the org's artists
  endpoint({
    method: "GET",
    path: "/events/{id}/slots",
    permission: "events.view",
    tag: "Lineup",
    summary: "Lineup / timetable of an event",
    response: z.object({ data: z.array(Slot) }),
    async handler({ db, orgId, params }) {
      await eventOf(db, orgId, params.id)
      const { data } = await db.from("event_slots").select(SLOT_COLS).eq("event_id", params.id).eq("org_id", orgId).order("starts_at").limit(1000)
      return { data: data?.map(slotOut) ?? [] }
    },
  }),
  endpoint({
    method: "POST",
    path: "/events/{id}/slots",
    permission: "events.manage",
    tag: "Lineup",
    summary: "Add a lineup slot",
    description: "An artist (`artist_id`, or `new_artist` to create one) or a free `title`, with stage and times.",
    body: SlotFields.partial().required({ starts_at: true }).strict(),
    response: Slot,
    status: 201,
    async handler({ db, orgId, params, body }) {
      await eventOf(db, orgId, params.id)
      const row = await slotRow(db, orgId, body)
      const { data, error } = await db
        .from("event_slots")
        .insert({ ...row, starts_at: row.starts_at!, org_id: orgId, event_id: params.id })
        .select(SLOT_COLS)
        .single()
      if (error) throw dbError(error)
      return slotOut(data)
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/event-slots/{id}",
    permission: "events.manage",
    tag: "Lineup",
    summary: "Change a lineup slot",
    body: SlotFields.partial().strict(),
    response: Slot,
    async handler({ db, orgId, params, body }) {
      const { data: old } = await db.from("event_slots").select("artist_id, title, starts_at, ends_at").eq("id", params.id).eq("org_id", orgId).maybeSingle()
      if (!old) throw notFound()
      const row = await slotRow(db, orgId, body, old)
      const { data, error } = await db.from("event_slots").update({ ...row, starts_at: row.starts_at ?? undefined }).eq("id", params.id).eq("org_id", orgId).select(SLOT_COLS).single()
      if (error) throw dbError(error)
      return slotOut(data)
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/event-slots/{id}",
    permission: "events.manage",
    tag: "Lineup",
    summary: "Remove a lineup slot",
    response: ok,
    async handler({ db, orgId, params }) {
      const { data, error } = await db.from("event_slots").delete().eq("id", params.id).eq("org_id", orgId).select("id")
      if (error) throw dbError(error)
      if (!data.length) throw notFound()
      return { ok: true as const }
    },
  }),
  endpoint({
    method: "GET",
    path: "/artists",
    permission: "events.view",
    tag: "Lineup",
    summary: "List artists",
    query: page.extend({ q: z.string().max(100).optional().describe("Search by name") }),
    response: list(Artist),
    async handler({ db, orgId, query }) {
      let q = db.from("artists").select(ARTIST_COLS).eq("org_id", orgId).is("deleted_at", null).order("name").range(query.offset, query.offset + query.limit)
      const s = query.q?.replace(/[%,()*]/g, "").trim()
      if (s) q = q.ilike("name", `%${s}%`)
      const { data } = await q
      return paged(data, query)
    },
  }),
  endpoint({
    method: "GET",
    path: "/artists/{id}",
    permission: "events.view",
    tag: "Lineup",
    summary: "Get an artist",
    response: Artist,
    async handler({ db, orgId, params }) {
      const { data } = await db.from("artists").select(ARTIST_COLS).eq("id", params.id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
      if (!data) throw notFound()
      return data
    },
  }),
  endpoint({
    method: "POST",
    path: "/artists",
    permission: "events.manage",
    tag: "Lineup",
    summary: "Create an artist",
    body: ArtistFields.partial().required({ name: true }).strict(),
    response: Artist,
    status: 201,
    async handler({ db, orgId, body }) {
      const row = clean(body)
      if (!row.name) throw invalid("errors.invalid_input")
      const { data, error } = await db
        .from("artists")
        .insert({ ...row, name: row.name, org_id: orgId })
        .select(ARTIST_COLS)
        .single()
      if (error) throw dbError(error)
      return data
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/artists/{id}",
    permission: "events.manage",
    tag: "Lineup",
    summary: "Update an artist",
    body: ArtistFields.partial().strict(),
    response: Artist,
    async handler({ db, orgId, params, body }) {
      const row = clean(body)
      if (row.name === null) throw invalid("errors.invalid_input")
      const { data, error } = await db
        .from("artists")
        .update({ ...row, name: row.name ?? undefined })
        .eq("id", params.id)
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .select(ARTIST_COLS)
        .maybeSingle()
      if (error) throw dbError(error)
      if (!data) throw notFound()
      return data
    },
  }),
]
