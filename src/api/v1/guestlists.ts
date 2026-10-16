import { z } from "zod"
import { deliverSoon } from "@/events/worker"
import { linkToken, syncTickets, voidTicket } from "@/guestlists/server"
import { siteUrl } from "@/lib/url"
import { ApiError, dbError, endpoint, list, notFound, page, paged, uuid, type Endpoint } from "../core"
import { ts, type Db } from "./shared"

const TAG = "Guest lists"

const GuestList = z.object({
  id: uuid,
  name: z.string(),
  event_id: uuid.nullable().describe("null = permanent list, valid at every event"),
  artist_id: uuid.nullable(),
  ticket_type_id: uuid.nullable().describe("The ticket type its entries get (event lists: the list's own hidden type, created automatically)"),
  door_price: z.number().int().describe("Cents to pay at the door (0 = free)"),
  quota: z.number().int().nullable().describe("Max. entries (null = unlimited)"),
  per_submission: z.number().int().describe("Max. names per sign-up link submission"),
  link_enabled: z.boolean().describe("Public sign-up link active"),
  link_closes_at: ts.nullable(),
  notes: z.string().nullable(),
  entry_count: z.number().int(),
  created_at: ts,
  updated_at: ts,
})
const GuestListDetail = GuestList.extend({ link_url: z.string().nullable().describe("Public sign-up link (works while link_enabled)") })
const LIST_COLS =
  "id, name, event_id, artist_id, ticket_type_id, door_price, quota, per_submission, link_enabled, link_closes_at, notes, created_at, updated_at, link_token, guest_entries(count)"
type ListRow = { link_token: string | null; guest_entries: unknown } & Record<string, unknown>
const listOut = ({ guest_entries, ...l }: ListRow) => {
  delete (l as Partial<ListRow>).link_token // only as link_url on the detail
  return { ...l, entry_count: (guest_entries as { count: number }[])[0]?.count ?? 0 }
}

const Entry = z.object({
  id: uuid,
  list_id: uuid,
  name: z.string(),
  email: z.string().nullable(),
  note: z.string().nullable(),
  added_via: z.enum(["app", "link", "api"]),
  submitted_by: z.string().nullable().describe("Who entered the name via the sign-up link"),
  ticket_id: uuid.nullable(),
  ticket_code: z.string().nullable().describe("Code of the linked free ticket"),
  checkins: z.array(z.object({ event_id: uuid, checked_in_at: ts })),
  created_at: ts,
})
const ENTRY_COLS = "id, list_id, name, email, note, added_via, submitted_by, ticket_id, created_at, tickets!guest_entries_ticket_id_fkey(code), guest_checkins(event_id, checked_in_at)"
type EntryRow = { list_id: string; tickets: { code: string } | null; guest_checkins: { event_id: string; checked_in_at: string }[] }
const entryOut = <R extends EntryRow>({ tickets, guest_checkins, ...e }: R) => ({ ...e, ticket_code: tickets?.code ?? null, checkins: guest_checkins })

const DoorEntry = z.object({
  id: uuid,
  list_id: uuid,
  list_name: z.string(),
  door_price: z.number().int().describe("Cents to pay at the door"),
  name: z.string(),
  checked_in_at: ts.nullable().describe("Check-in at this event"),
})
const Checkin = z.object({ entry_id: uuid, event_id: uuid, checked_in_at: ts })

const email = z.email().max(320)
const EntryIn = z.object({ name: z.string().trim().min(1).max(200), email: email.nullish(), note: z.string().max(500).nullish() }).strict()
const ListFields = {
  name: z.string().trim().min(1).max(100),
  door_price: z.number().int().min(0).max(99_999_999).describe("Cents"),
  quota: z.number().int().min(1).max(100_000).nullable(),
  per_submission: z.number().int().min(1).max(50),
  link_closes_at: z.iso.datetime({ offset: true }).nullable(),
  artist_id: uuid.nullable(),
  ticket_type_id: uuid.nullable().describe("Optional, event lists only: use this ticket type of the event instead of the list's own automatic one"),
  notes: z.string().max(2000).nullable(),
}

async function listOf(db: Db, orgId: string, id: string) {
  const { data } = await db.from("guest_lists").select("id, event_id, quota").eq("id", id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
  if (!data) throw notFound()
  return data
}
async function getList(db: Db, orgId: string, id: string) {
  const [{ data }, { data: org }] = await Promise.all([
    db.from("guest_lists").select(LIST_COLS).eq("id", id).eq("org_id", orgId).is("deleted_at", null).maybeSingle(),
    db.from("orgs").select("slug").eq("id", orgId).single(),
  ])
  if (!data) throw notFound()
  return { ...listOut(data), link_url: data.link_token && org ? siteUrl(org.slug, `/g/${data.link_token}`) : null }
}
async function getEntry(db: Db, orgId: string, id: string) {
  const { data } = await db.from("guest_entries").select(ENTRY_COLS).eq("id", id).eq("org_id", orgId).maybeSingle()
  if (!data) throw notFound()
  return entryOut(data)
}
// Referenced rows must belong to the org (tables are read without RLS); the ticket type must be one of the list's event.
async function checkRefs(db: Db, orgId: string, eventId: string | null, b: { artist_id?: string | null; ticket_type_id?: string | null }) {
  const bad = (field: string) => new ApiError(422, "invalid_reference", `${field} does not belong to this organisation.`)
  if (eventId) {
    const { data } = await db.from("events").select("id").eq("id", eventId).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
    if (!data) throw bad("event_id")
  }
  if (b.artist_id) {
    const { data } = await db.from("artists").select("id").eq("id", b.artist_id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
    if (!data) throw bad("artist_id")
  }
  if (b.ticket_type_id) {
    if (!eventId) throw new ApiError(422, "invalid_input", "Only event lists can be linked to a ticket type.")
    const { data } = await db.from("ticket_types").select("id").eq("id", b.ticket_type_id).eq("event_id", eventId).eq("org_id", orgId).maybeSingle()
    if (!data) throw new ApiError(422, "invalid_reference", "ticket_type_id is not a ticket type of this list's event.")
  }
}
// The entry, its list and the event it is checked in at: event lists only at their event, permanent lists at any.
async function checkinTarget(db: Db, orgId: string, entryId: string, eventId: string | undefined) {
  const { data: entry } = await db.from("guest_entries").select("id, guest_lists!inner(event_id, deleted_at)").eq("id", entryId).eq("org_id", orgId).maybeSingle()
  if (!entry || entry.guest_lists.deleted_at) throw notFound()
  const event = eventId ?? entry.guest_lists.event_id
  if (!event) throw new ApiError(422, "event_required", "This entry is on a permanent list: send event_id.")
  if (entry.guest_lists.event_id && entry.guest_lists.event_id !== event) throw new ApiError(422, "wrong_event", "This entry's list is for another event.")
  const { data: ev } = await db.from("events").select("id").eq("id", event).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
  if (!ev) throw new ApiError(422, "invalid_reference", "event_id does not belong to this organisation.")
  return event
}

export const endpoints: Endpoint[] = [
  // --- Lists --------------------------------------------------------------------------------------
  endpoint({
    method: "GET",
    path: "/guest-lists",
    permission: "guestlists.view",
    tag: TAG,
    summary: "List guest lists",
    description: "With `event_id`: that event's lists plus the permanent lists (valid at every event).",
    query: page.extend({ event_id: uuid.optional(), permanent: z.enum(["true", "false"]).optional().describe("Only permanent (true) or only event lists (false)") }),
    response: list(GuestList),
    async handler({ db, orgId, query }) {
      let q = db.from("guest_lists").select(LIST_COLS).eq("org_id", orgId).is("deleted_at", null).order("created_at").range(query.offset, query.offset + query.limit)
      if (query.event_id) q = q.or(`event_id.eq.${query.event_id},event_id.is.null`)
      if (query.permanent === "true") q = q.is("event_id", null)
      if (query.permanent === "false") q = q.not("event_id", "is", null)
      const { data } = await q
      return paged(data?.map(listOut) ?? [], query)
    },
  }),
  endpoint({
    method: "GET",
    path: "/guest-lists/{id}",
    permission: "guestlists.view",
    tag: TAG,
    summary: "Get a guest list",
    response: GuestListDetail,
    handler: ({ db, orgId, params }) => getList(db, orgId, params.id),
  }),
  endpoint({
    method: "POST",
    path: "/guest-lists",
    permission: "guestlists.manage",
    tag: TAG,
    summary: "Create a guest list",
    description: "Without `event_id` the list is permanent (valid at every event). The sign-up link starts disabled (POST /guest-lists/{id}/link).",
    body: z
      .object({
        name: ListFields.name,
        event_id: uuid.nullable().default(null),
        door_price: ListFields.door_price.default(0),
        quota: ListFields.quota.default(null),
        per_submission: ListFields.per_submission.default(5),
        link_closes_at: ListFields.link_closes_at.default(null),
        artist_id: ListFields.artist_id.default(null),
        ticket_type_id: ListFields.ticket_type_id.default(null),
        notes: ListFields.notes.default(null),
      })
      .strict(),
    response: GuestListDetail,
    status: 201,
    async handler({ db, orgId, body }) {
      await checkRefs(db, orgId, body.event_id, body)
      const { data, error } = await db
        .from("guest_lists")
        .insert({ ...body, link_closes_at: body.link_closes_at && new Date(body.link_closes_at).toISOString(), org_id: orgId, link_token: linkToken() })
        .select("id")
        .single()
      if (error) throw dbError(error)
      return getList(db, orgId, data.id)
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/guest-lists/{id}",
    permission: "guestlists.manage",
    tag: TAG,
    summary: "Change a guest list",
    description: "The event can't be changed. Linking a ticket type gives every entry a free ticket.",
    body: z.object(ListFields).partial().strict(),
    response: GuestListDetail,
    async handler({ db, orgId, params, body }) {
      const l = await listOf(db, orgId, params.id)
      await checkRefs(db, orgId, l.event_id, body)
      const patch = { ...body, ...(body.link_closes_at ? { link_closes_at: new Date(body.link_closes_at).toISOString() } : {}) }
      const { error } = await db.from("guest_lists").update(patch).eq("id", l.id).eq("org_id", orgId)
      if (error) throw dbError(error)
      await syncTickets(l.id)
      return getList(db, orgId, l.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/guest-lists/{id}/link",
    permission: "guestlists.manage",
    tag: TAG,
    summary: "Switch the public sign-up link",
    description: "`on` / `off` enable or disable it; `renew` creates a new link (the old one stops working) and enables it.",
    body: z.object({ action: z.enum(["on", "off", "renew"]) }).strict(),
    response: GuestListDetail,
    async handler({ db, orgId, params, body }) {
      const l = await listOf(db, orgId, params.id)
      const patch = body.action === "renew" ? { link_token: linkToken(), link_enabled: true } : { link_enabled: body.action === "on" }
      const { error } = await db.from("guest_lists").update(patch).eq("id", l.id).eq("org_id", orgId)
      if (error) throw dbError(error)
      return getList(db, orgId, l.id)
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/guest-lists/{id}",
    permission: "guestlists.manage",
    tag: TAG,
    summary: "Move a guest list to the trash",
    description: "Restorable for 30 days (POST /guest-lists/{id}/restore). The entries' free tickets are voided.",
    response: z.object({ id: uuid, deleted: z.literal(true) }),
    async handler({ db, orgId, params }) {
      const l = await listOf(db, orgId, params.id)
      const { data: entries } = await db.from("guest_entries").select("ticket_id").eq("list_id", l.id).eq("org_id", orgId)
      const { error } = await db.rpc("soft_delete", { p_table: "public.guest_lists", p_id: l.id })
      if (error) throw dbError(error)
      for (const e of entries ?? []) await voidTicket(e.ticket_id)
      return { id: l.id, deleted: true as const }
    },
  }),
  endpoint({
    method: "POST",
    path: "/guest-lists/{id}/restore",
    permission: "guestlists.manage",
    tag: TAG,
    summary: "Restore a guest list from the trash",
    description: "Entries of a list linked to a ticket type get new free tickets (the old ones were voided).",
    response: GuestListDetail,
    async handler({ db, orgId, params }) {
      const { data } = await db.from("guest_lists").select("id").eq("id", params.id).eq("org_id", orgId).not("deleted_at", "is", null).maybeSingle()
      if (!data) throw notFound()
      const { error } = await db.rpc("restore_deleted", { p_table: "public.guest_lists", p_id: data.id })
      if (error) throw dbError(error)
      await syncTickets(data.id)
      return getList(db, orgId, data.id)
    },
  }),

  // --- Entries ------------------------------------------------------------------------------------
  endpoint({
    method: "GET",
    path: "/guest-lists/{id}/entries",
    permission: "guestlists.view",
    tag: TAG,
    summary: "Entries of a guest list",
    query: page.extend({ q: z.string().max(100).optional().describe("Search in names") }),
    response: list(Entry),
    async handler({ db, orgId, params, query }) {
      const l = await listOf(db, orgId, params.id)
      let q = db.from("guest_entries").select(ENTRY_COLS).eq("list_id", l.id).eq("org_id", orgId).order("name").order("id").range(query.offset, query.offset + query.limit)
      if (query.q) q = q.ilike("name", `%${query.q.replace(/[%_\\]/g, "\\$&")}%`)
      const { data } = await q
      return paged(data?.map(entryOut) ?? [], query)
    },
  }),
  endpoint({
    method: "POST",
    path: "/guest-lists/{id}/entries",
    permission: "guestlists.manage",
    tag: TAG,
    summary: "Add guests",
    description: "Up to 500 names at once; fails as a whole if the list's quota would be exceeded (`list_full`).",
    body: z.object({ entries: z.array(EntryIn).min(1).max(500) }).strict(),
    response: z.object({ data: z.array(Entry) }),
    status: 201,
    async handler({ db, orgId, params, body }) {
      const l = await listOf(db, orgId, params.id)
      if (l.quota) {
        const { count } = await db.from("guest_entries").select("id", { count: "exact", head: true }).eq("list_id", l.id)
        if ((count ?? 0) + body.entries.length > l.quota) throw new ApiError(422, "list_full", "The list is full (quota).")
      }
      const rows = body.entries.map((e) => ({ org_id: orgId, list_id: l.id, name: e.name, email: e.email?.toLowerCase() ?? null, note: e.note ?? null, added_via: "api" }))
      const { data, error } = await db.from("guest_entries").insert(rows).select("id")
      if (error) throw dbError(error)
      await syncTickets(l.id)
      const { data: created } = await db
        .from("guest_entries")
        .select(ENTRY_COLS)
        .in("id", data.map((e) => e.id))
        .eq("org_id", orgId)
        .order("name")
      return { data: created?.map(entryOut) ?? [] }
    },
  }),
  endpoint({
    method: "GET",
    path: "/guest-entries/{id}",
    permission: "guestlists.view",
    tag: TAG,
    summary: "Get a guest entry",
    response: Entry,
    handler: ({ db, orgId, params }) => getEntry(db, orgId, params.id),
  }),
  endpoint({
    method: "PATCH",
    path: "/guest-entries/{id}",
    permission: "guestlists.manage",
    tag: TAG,
    summary: "Change a guest entry",
    description: "Replacing a person keeps the entry and, if linked, the same ticket (with the new name).",
    body: EntryIn.partial().strict(),
    response: Entry,
    async handler({ db, orgId, params, body }) {
      const e = await getEntry(db, orgId, params.id)
      const patch = { ...body, ...(body.email ? { email: body.email.toLowerCase() } : {}) }
      const { error } = await db.from("guest_entries").update(patch).eq("id", params.id).eq("org_id", orgId)
      if (error) throw dbError(error)
      await syncTickets(e.list_id)
      return getEntry(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/guest-entries/{id}",
    permission: "guestlists.manage",
    tag: TAG,
    summary: "Remove a guest",
    description: "Its free ticket, if any, is voided.",
    response: z.object({ id: uuid, deleted: z.literal(true) }),
    async handler({ db, orgId, params }) {
      const { data: entry } = await db.from("guest_entries").select("id, ticket_id").eq("id", params.id).eq("org_id", orgId).maybeSingle()
      if (!entry) throw notFound()
      const { error } = await db.from("guest_entries").delete().eq("id", entry.id).eq("org_id", orgId)
      if (error) throw dbError(error)
      await voidTicket(entry.ticket_id)
      deliverSoon()
      return { id: entry.id, deleted: true as const }
    },
  }),

  // --- Door (check-in) ----------------------------------------------------------------------------
  endpoint({
    method: "GET",
    path: "/events/{id}/guests",
    permission: "guestlists.checkin",
    tag: TAG,
    summary: "Door list of an event",
    description: "Everyone on the event's lists and on the permanent lists, with their check-in at this event.",
    query: page.extend({ q: z.string().max(100).optional().describe("Search in names"), list_id: uuid.optional() }),
    response: list(DoorEntry),
    async handler({ db, orgId, params, query }) {
      const [{ data: ev }, { data: lists }] = await Promise.all([
        db.from("events").select("id").eq("id", params.id).eq("org_id", orgId).is("deleted_at", null).maybeSingle(),
        db.from("guest_lists").select("id, name, door_price").eq("org_id", orgId).is("deleted_at", null).or(`event_id.eq.${params.id},event_id.is.null`),
      ])
      if (!ev) throw notFound()
      const ids = (lists ?? []).map((l) => l.id).filter((id) => !query.list_id || id === query.list_id)
      if (!ids.length) return paged([], query)
      let q = db
        .from("guest_entries")
        .select("id, list_id, name, guest_checkins(event_id, checked_in_at)")
        .eq("org_id", orgId)
        .in("list_id", ids)
        .order("name")
        .order("id")
        .range(query.offset, query.offset + query.limit)
      if (query.q) q = q.ilike("name", `%${query.q.replace(/[%_\\]/g, "\\$&")}%`)
      const { data } = await q
      const byId = new Map(lists!.map((l) => [l.id, l]))
      const rows = (data ?? []).map((e) => ({
        id: e.id,
        list_id: e.list_id,
        list_name: byId.get(e.list_id)!.name,
        door_price: byId.get(e.list_id)!.door_price,
        name: e.name,
        checked_in_at: e.guest_checkins.find((c) => c.event_id === params.id)?.checked_in_at ?? null,
      }))
      return paged(rows, query)
    },
  }),
  endpoint({
    method: "POST",
    path: "/guest-entries/{id}/check-in",
    permission: "guestlists.checkin",
    tag: TAG,
    summary: "Check a guest in",
    description: "At the list's event; entries of permanent lists need `event_id`. Fails with 409 if already checked in at that event.",
    body: z.object({ event_id: uuid.optional() }).strict(),
    response: Checkin,
    status: 201,
    async handler({ db, orgId, params, body }) {
      const event = await checkinTarget(db, orgId, params.id, body.event_id)
      const { data, error } = await db.from("guest_checkins").insert({ org_id: orgId, entry_id: params.id, event_id: event }).select("entry_id, event_id, checked_in_at").single()
      if (error) throw error.code === "23505" ? new ApiError(409, "already_checked_in", "Already checked in at this event.") : dbError(error)
      return data
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/guest-entries/{id}/check-in",
    permission: "guestlists.checkin",
    tag: TAG,
    summary: "Undo a guest's check-in",
    query: z.object({ event_id: uuid.optional().describe("Required for entries of permanent lists") }),
    response: z.object({ entry_id: uuid, event_id: uuid, deleted: z.literal(true) }),
    async handler({ db, orgId, params, query }) {
      const event = await checkinTarget(db, orgId, params.id, query.event_id)
      const { data, error } = await db.from("guest_checkins").delete().eq("entry_id", params.id).eq("event_id", event).eq("org_id", orgId).select("id")
      if (error) throw dbError(error)
      if (!data.length) throw notFound()
      return { entry_id: params.id, event_id: event, deleted: true as const }
    },
  }),
]
