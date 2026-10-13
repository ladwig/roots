import { z } from "zod"
import { readContact } from "@/app/(app)/contacts/fields"
import { importContactRows } from "@/contacts/server"
import { deliverSoon } from "@/events/worker"
import { messages } from "@/i18n/config"
import { createT } from "@/i18n/translate"
import { loadFields } from "@/lib/custom-fields"
import { ApiError, dbError as coreDbError, endpoint, list, notFound, page, paged, uuid, type Endpoint } from "../core"
import { Custom, ts, type Db } from "./shared"

const en = createT("en", messages.en)

const Contact = z.object({
  id: uuid,
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  company: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  street: z.string().nullable(),
  postal_code: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable().describe("ISO 3166-1 alpha-2, e.g. DE"),
  birthday: z.string().nullable().describe("YYYY-MM-DD"),
  tags: z.array(z.string()),
  custom: Custom,
  created_at: ts,
  updated_at: ts,
})
const CONTACT_COLS = "id, first_name, last_name, company, email, phone, street, postal_code, city, country, birthday, tags, custom, created_at, updated_at"
const ContactInput = z
  .object({
    first_name: z.string().max(100),
    last_name: z.string().max(100),
    company: z.string().max(200),
    email: z.string().max(320),
    phone: z.string().max(50),
    street: z.string().max(200),
    postal_code: z.string().max(20),
    city: z.string().max(100),
    country: z.string().max(60).describe("ISO code or country name"),
    birthday: z.string().max(10).describe("YYYY-MM-DD or DD.MM.YYYY"),
    tags: z.array(z.string().max(40)).max(50),
    custom: Custom,
  })
  .partial()
  .strict()
const Note = z.object({ id: uuid, body: z.string(), created_at: ts, updated_at: ts })
const Ok = z.object({ ok: z.literal(true) })
const ImportRows = z
  .object({
    rows: z
      .array(z.record(z.string().max(100), z.string().max(5000)))
      .min(1)
      .max(5000)
      .describe('One object per contact: built-in field → text (first_name, last_name, company, email, phone, street, postal_code, city, country, birthday, tags as "a, b") and "custom.<key>" → text'),
    mode: z.enum(["skip", "update"]).default("skip").describe("skip: rows whose email exists are skipped; update: those contacts get the given values (tags added, custom merged)"),
  })
  .strict()
export const ImportResult = z.object({
  inserted: z.number().int(),
  updated: z.number().int(),
  skipped: z.number().int(),
  errors: z.array(z.object({ line: z.number().int().describe("Row number + 1 (as in a CSV with header)"), message: z.string() })),
})

async function contactRow(db: Db, orgId: string, input: z.infer<typeof ContactInput>) {
  const defs = await loadFields(db, orgId, "contacts")
  const r = readContact((k) => {
    if (k.startsWith("custom.")) {
      const v = input.custom?.[k.slice(7)]
      return v === undefined ? "" : typeof v === "boolean" ? (v ? "1" : "") : String(v)
    }
    const v = (input as Record<string, unknown>)[k]
    return Array.isArray(v) ? v.join(",") : v == null ? "" : String(v)
  }, defs)
  if ("error" in r) throw new ApiError(422, r.error.replace(/^errors\./, ""), (r.field ? `${r.field}: ` : "") + en.dynamic(r.error))
  return r.row
}
const dbError = (e: { code?: string; message: string }) => (e.code === "23505" ? new ApiError(409, "conflict", "A contact with this email already exists.") : coreDbError(e))

async function liveContact(db: Db, orgId: string, id: string) {
  const { data } = await db.from("contacts").select("id").eq("id", id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
  if (!data) throw notFound()
}

// Soft delete / restore through the DB functions (they check the key's permission). A foreign or missing id → 404.
export async function trashRow(db: Db, table: string, id: string, restore = false) {
  const { data, error } = await db.rpc(restore ? "restore_deleted" : "soft_delete", { p_table: table, p_id: id })
  if (error?.message === "not_allowed") throw notFound()
  if (error) throw coreDbError(error)
  if (!data) throw notFound()
}

export const endpoints: Endpoint[] = [
  endpoint({
    method: "GET",
    path: "/contacts",
    permission: "crm.view",
    tag: "Contacts",
    summary: "List contacts",
    query: page.extend({
      q: z.string().max(100).optional().describe("Search in name, company, email, phone, city"),
      tag: z.string().max(40).optional(),
      email: z.string().max(320).optional().describe("Exact email"),
      updated_since: z.iso.datetime({ offset: true }).optional().describe("For syncing: changed after this time"),
    }),
    response: list(Contact),
    async handler({ db, orgId, query }) {
      let q = db.from("contacts").select(CONTACT_COLS).eq("org_id", orgId).is("deleted_at", null).order("created_at").range(query.offset, query.offset + query.limit)
      const s = query.q?.replace(/[%,()*]/g, "").trim()
      if (s) q = q.or(["first_name", "last_name", "company", "email", "phone", "city"].map((c) => `${c}.ilike.%${s}%`).join(","))
      if (query.tag) q = q.contains("tags", [query.tag])
      if (query.email) q = q.eq("email", query.email.trim().toLowerCase())
      if (query.updated_since) q = q.gte("updated_at", query.updated_since)
      const { data } = await q
      return paged(data, query)
    },
  }),
  // Before /contacts/{id}: the dispatcher takes the first matching path.
  endpoint({
    method: "GET",
    path: "/contacts/trash",
    permission: "crm.manage",
    tag: "Contacts",
    summary: "List deleted contacts",
    description: "Contacts in the trash (restorable for 30 days, then purged). Newest deletion first.",
    query: page,
    response: list(Contact.extend({ deleted_at: ts })),
    async handler({ db, orgId, query }) {
      const { data } = await db
        .from("contacts")
        .select(`${CONTACT_COLS}, deleted_at`)
        .eq("org_id", orgId)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .range(query.offset, query.offset + query.limit)
      return paged(data as (Record<string, unknown> & { deleted_at: string })[] | null, query)
    },
  }),
  endpoint({
    method: "POST",
    path: "/contacts/import",
    permission: "crm.manage",
    tag: "Contacts",
    summary: "Import contacts in bulk",
    description:
      "Same rules as the CSV import in the app: every row is validated, rows with errors are reported (`errors`, others still go in), the same email twice keeps the first row. New contacts are inserted together (one `contacts.imported` event).",
    body: ImportRows,
    response: ImportResult,
    async handler({ db, orgId, body }) {
      const r = await importContactRows(db, orgId, body, en)
      if ("error" in r) throw new ApiError(422, "import_failed", r.error)
      deliverSoon()
      return r
    },
  }),
  endpoint({
    method: "GET",
    path: "/contact-tags",
    permission: "crm.view",
    tag: "Contacts",
    summary: "All tags in use",
    description: "Distinct tags of the organisation's live contacts, sorted.",
    response: z.object({ data: z.array(z.string()) }),
    async handler({ db, orgId }) {
      const { data, error } = await db.rpc("contact_tags", { p_org: orgId })
      if (error) throw coreDbError(error)
      return { data: data ?? [] }
    },
  }),
  endpoint({
    method: "GET",
    path: "/contacts/{id}",
    permission: "crm.view",
    tag: "Contacts",
    summary: "Get a contact",
    response: Contact,
    async handler({ db, orgId, params }) {
      const { data } = await db.from("contacts").select(CONTACT_COLS).eq("id", params.id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
      if (!data) throw notFound()
      return data
    },
  }),
  endpoint({
    method: "POST",
    path: "/contacts",
    permission: "crm.manage",
    tag: "Contacts",
    summary: "Create a contact",
    description: "Needs at least first_name, last_name, company or email. Email is unique per organisation (409 if taken). Emits `contact.created`.",
    body: ContactInput,
    response: Contact,
    status: 201,
    async handler({ db, orgId, body }) {
      const row = await contactRow(db, orgId, body)
      const { data, error } = await db.from("contacts").insert({ ...row, org_id: orgId }).select(CONTACT_COLS).single()
      if (error) throw dbError(error)
      deliverSoon()
      return data
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/contacts/{id}",
    permission: "crm.manage",
    tag: "Contacts",
    summary: "Update a contact",
    description: "Only the given fields change; `custom` is merged; `tags` replaces the list.",
    body: ContactInput,
    response: Contact,
    async handler({ db, orgId, params, body }) {
      const { data: old } = await db.from("contacts").select(CONTACT_COLS).eq("id", params.id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
      if (!old) throw notFound()
      const input = { ...old, ...body, custom: { ...(old.custom as Record<string, string | number | boolean>), ...body.custom } }
      const row = await contactRow(db, orgId, input as z.infer<typeof ContactInput>) // id/timestamps are ignored by readContact
      const { data, error } = await db.from("contacts").update(row).eq("id", params.id).eq("org_id", orgId).select(CONTACT_COLS).single()
      if (error) throw dbError(error)
      return data
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/contacts/{id}",
    permission: "crm.manage",
    tag: "Contacts",
    summary: "Delete a contact (to the trash)",
    description: "Soft delete: hidden everywhere, restorable for 30 days (POST /contacts/{id}/restore), then purged.",
    response: Ok,
    async handler({ db, params }) {
      await trashRow(db, "public.contacts", params.id)
      return { ok: true as const }
    },
  }),
  endpoint({
    method: "POST",
    path: "/contacts/{id}/restore",
    permission: "crm.manage",
    tag: "Contacts",
    summary: "Restore a deleted contact",
    description: "409 if a live contact took the email meanwhile.",
    response: Contact,
    async handler({ db, orgId, params }) {
      await trashRow(db, "public.contacts", params.id, true)
      const { data } = await db.from("contacts").select(CONTACT_COLS).eq("id", params.id).eq("org_id", orgId).single()
      return data
    },
  }),
  endpoint({
    method: "GET",
    path: "/contacts/{id}/notes",
    permission: "crm.view",
    tag: "Contacts",
    summary: "Notes on a contact",
    description: "Newest first.",
    query: page,
    response: list(Note),
    async handler({ db, orgId, params, query }) {
      await liveContact(db, orgId, params.id)
      const { data } = await db
        .from("contact_notes")
        .select("id, body, created_at, updated_at")
        .eq("contact_id", params.id)
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .range(query.offset, query.offset + query.limit)
      return paged(data, query)
    },
  }),
  endpoint({
    method: "POST",
    path: "/contacts/{id}/notes",
    permission: "crm.manage",
    tag: "Contacts",
    summary: "Add a note to a contact",
    body: z.object({ body: z.string().trim().min(1).max(10000) }).strict(),
    response: Note,
    status: 201,
    async handler({ db, orgId, params, body }) {
      await liveContact(db, orgId, params.id)
      const { data, error } = await db.from("contact_notes").insert({ org_id: orgId, contact_id: params.id, body: body.body }).select("id, body, created_at, updated_at").single()
      if (error) throw coreDbError(error)
      return data
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/contacts/{id}/notes/{note_id}",
    permission: "crm.manage",
    tag: "Contacts",
    summary: "Delete a note",
    response: Ok,
    async handler({ db, orgId, params }) {
      const { error, count } = await db.from("contact_notes").delete({ count: "exact" }).eq("id", params.note_id).eq("contact_id", params.id).eq("org_id", orgId)
      if (error) throw coreDbError(error)
      if (!count) throw notFound()
      return { ok: true as const }
    },
  }),
]
