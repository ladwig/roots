import { z } from "zod"
import { fill } from "@/email/render"
import { defaultLocale, messages } from "@/i18n/config"
import { createT } from "@/i18n/translate"
import { cleanHtml, FIELD_TYPES, readFields } from "@/letters/model"
import { fillLetter, letterFileName, letterPdf, loadTemplate, storeLetter, textHtml, type LetterCtx } from "@/letters/server"
import { FILE_PATH, MAX_FILE_BYTES } from "@/lib/files"
import { sendOrgEmail } from "@/lib/org-email"
import { uploadLink } from "../upload-link"
import { ApiError, dbError, endpoint, list, notFound, page, paged, uuid, type Endpoint } from "../core"
import { day, ts, type Db } from "./shared"

const FileMeta = z.object({
  id: uuid,
  name: z.string(),
  mime: z.string(),
  size: z.number().int(),
  entity: z.string().nullable(),
  entity_id: uuid.nullable(),
  folder: z.string().nullable(),
  created_at: ts,
  download_url: z.string().nullable().describe("Signed link, valid 10 minutes"),
})
const FILE_COLS = "id, name, mime, size, entity, entity_id, folder, created_at, path"
// Employee documents are HR data (hr.manage only in the App); the files API never shows or changes them.
const NOT_HR = "entity.is.null,entity.neq.employees"
type FileRow = { path: string } & Record<string, unknown>
async function withLinks<R extends FileRow>(db: Db, rows: R[]) {
  const { data: signed } = rows.length ? await db.storage.from("files").createSignedUrls(rows.map((f) => f.path), 600) : { data: [] }
  return rows.map(({ path, ...f }) => ({ ...f, download_url: signed?.find((x) => x.path === path)?.signedUrl ?? null }))
}
async function getFile(db: Db, orgId: string, id: string, deleted = false) {
  let q = db.from("files").select(FILE_COLS).eq("id", id).eq("org_id", orgId).or(NOT_HR)
  q = deleted ? q.not("deleted_at", "is", null) : q.is("deleted_at", null)
  const { data } = await q.maybeSingle()
  if (!data) throw notFound()
  return (await withLinks(db, [data]))[0]
}

// Records files can be attached to (`entity` = table). The record must belong to the org.
const ENTITIES = ["contacts", "memberships", "events", "documents"] as const
const Entity = z.enum(ENTITIES).describe("Table of the record: contacts, memberships, events or documents (invoices)")
async function checkEntity(db: Db, orgId: string, entity: (typeof ENTITIES)[number], id: string) {
  const { data } = await db.from(entity).select("id").eq("id", id).eq("org_id", orgId).maybeSingle()
  if (!data) throw new ApiError(422, "invalid_reference", `entity_id is not a record in ${entity} of this organisation.`)
}
const folderText = z.string().trim().max(200)

// Letters --------------------------------------------------------------------------------------------------------
// Rendered in the org's document language (German for now).
const docT = () => createT(defaultLocale, messages[defaultLocale])
const Field = z.object({ key: z.string(), label: z.string(), type: z.enum(FIELD_TYPES) })
const Template = z.object({
  id: uuid,
  name: z.string(),
  title: z.string().describe("Letter heading, may contain {placeholders}"),
  body: z.string().describe("Rich text (HTML) with {placeholders}"),
  fields: z.array(Field).describe("Own fields filled in per letter: {key} placeholders"),
  letterhead: z.boolean().describe("Logo, sender line and footer from the invoice settings"),
  default: z.boolean().describe("roots' default template (read-only; copy it to adapt)"),
  updated_at: ts,
})
const TEMPLATE_COLS = "id, org_id, name, title, body, fields, letterhead, updated_at"
const templateOut = ({ org_id, fields, ...t }: { org_id: string | null; fields: unknown } & Record<string, unknown>) => ({ ...t, fields: readFields(fields), default: org_id === null })
const TemplateBody = z.object({
  name: z.string().trim().min(1).max(120),
  title: z.string().trim().max(200),
  body: z.string().max(100000).describe("HTML; cleaned like in the App"),
  fields: z.array(z.object({ key: z.string().max(40), label: z.string().max(100), type: z.enum(FIELD_TYPES) }).strict()).max(50),
  letterhead: z.boolean(),
})
const LetterInput = z
  .object({
    contact_id: uuid.optional().describe("Fills the contact's placeholders and the address (needs crm.view)"),
    date: day.optional().describe("Letter date, default today"),
    fields: z.record(z.string().max(40), z.string().max(10000)).optional().describe("Values of the template's own fields: { key: value }"),
  })
  .strict()
const Pdf = z.object({ filename: z.string(), content_type: z.literal("application/pdf"), data: z.string().describe("The PDF, base64-encoded") })

async function letterCtx(db: Db, orgId: string): Promise<LetterCtx> {
  const { data: org } = await db.from("orgs").select("id, name, logo_path").eq("id", orgId).single()
  if (!org) throw notFound()
  return { supabase: db, org }
}
// The filled letter for the API: template must be the org's or a default; a contact needs crm.view and must be the org's.
async function apiLetter(db: Db, orgId: string, templateId: string, input: z.infer<typeof LetterInput>) {
  const ctx = await letterCtx(db, orgId)
  const template = await loadTemplate(ctx, templateId)
  if (!template) throw notFound()
  if (input.contact_id) {
    const { data: can } = await db.rpc("has_perm", { p_org: orgId, p_perm: "crm.view" })
    if (!can) throw new ApiError(403, "forbidden", 'Filling in a contact needs the permission "crm.view".')
  }
  const letter = await fillLetter(ctx, docT(), template, { contactId: input.contact_id, date: input.date, values: input.fields ?? {} })
  if (input.contact_id && !letter.contactId) throw new ApiError(422, "invalid_reference", "contact_id does not belong to this organisation.")
  return { ctx, letter, bytes: await letterPdf(letter) }
}
async function ownTemplate(db: Db, orgId: string, id: string, deleted = false) {
  let q = db.from("letter_templates").select("id").eq("id", id).eq("org_id", orgId)
  q = deleted ? q.not("deleted_at", "is", null) : q.is("deleted_at", null)
  const { data } = await q.maybeSingle()
  if (!data) throw notFound()
}
const getTemplate = async (db: Db, id: string) => {
  const { data } = await db.from("letter_templates").select(TEMPLATE_COLS).eq("id", id).single()
  return templateOut(data!)
}

export const endpoints: Endpoint[] = [
  endpoint({
    method: "GET",
    path: "/files",
    permission: "org.files.view",
    tag: "Files",
    summary: "List files",
    description: "Optionally of one record (`entity` + `entity_id`, e.g. contacts + id) or one folder. Each file has a download link valid for 10 minutes.",
    query: page.extend({ entity: z.string().max(40).optional(), entity_id: uuid.optional(), folder: z.string().max(200).optional() }),
    response: list(FileMeta),
    async handler({ db, orgId, query }) {
      let q = db.from("files").select(FILE_COLS).eq("org_id", orgId).or(NOT_HR).is("deleted_at", null).order("created_at", { ascending: false }).range(query.offset, query.offset + query.limit)
      if (query.entity) q = q.eq("entity", query.entity)
      if (query.entity_id) q = q.eq("entity_id", query.entity_id)
      if (query.folder) q = q.eq("folder", query.folder)
      const { data } = await q
      return paged(await withLinks(db, data ?? []), query)
    },
  }),
  endpoint({
    method: "GET",
    path: "/files/trash",
    permission: "org.files.manage",
    tag: "Files",
    summary: "List deleted files",
    description: "Deleted files stay restorable for 30 days, then they are purged.",
    query: page,
    response: list(FileMeta.extend({ deleted_at: ts })),
    async handler({ db, orgId, query }) {
      const { data } = await db
        .from("files")
        .select(`${FILE_COLS}, deleted_at`)
        .eq("org_id", orgId)
        .or(NOT_HR)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .range(query.offset, query.offset + query.limit)
      return paged(await withLinks(db, data ?? []), query)
    },
  }),
  endpoint({
    method: "GET",
    path: "/files/{id}",
    permission: "org.files.view",
    tag: "Files",
    summary: "Get a file",
    description: "With a download link valid for 10 minutes.",
    response: FileMeta,
    handler: ({ db, orgId, params }) => getFile(db, orgId, params.id),
  }),
  endpoint({
    method: "POST",
    path: "/files/uploads",
    permission: "org.files.manage",
    tag: "Files",
    summary: "Start an upload",
    description: `Step 1 of 2. Returns a signed upload URL (valid 2 hours): \`PUT\` the file bytes to \`upload_url\` with its Content-Type, then register it with POST /files and the returned \`path\`. Max. ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
    body: z.object({ name: z.string().trim().min(1).max(255).describe("File name; its extension is kept") }).strict(),
    response: z.object({ path: z.string(), upload_url: z.string(), token: z.string() }),
    status: 201,
    async handler({ db, orgId, body }) {
      const ext = (body.name.includes(".") ? body.name.split(".").pop()! : "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) || "bin"
      const { data, error } = await db.storage.from("files").createSignedUploadUrl(`orgs/${orgId}/${crypto.randomUUID()}.${ext}`)
      if (error) throw new ApiError(500, "internal", "Storage error.")
      return { path: data.path, upload_url: data.signedUrl, token: data.token }
    },
  }),
  endpoint({
    method: "POST",
    path: "/files/upload-link",
    permission: "org.files.manage",
    tag: "Files",
    summary: "Get an upload link for a person",
    description:
      "For clients that can't send the file themselves (e.g. an AI chat where the person pasted a document): returns a link (valid 10 minutes) to a page where the person drops one or more files; they are attached to the record (`entity` + `entity_id`) or put in `folder`. A client with a shell can also `PUT` the bytes to `<upload_url with /upload/ replaced by /api/upload/>` with `X-File-Name` (max. 4 MB). Afterwards list the files (GET /files?entity=…) to see them.",
    body: z.object({ entity: Entity.optional(), entity_id: uuid.optional(), folder: folderText.optional(), label: z.string().max(200).optional().describe("Shown on the page, e.g. the record's name") }).strict(),
    response: z.object({ upload_url: z.string(), expires_at: ts }),
    status: 201,
    async handler({ db, orgId, keyId, body }) {
      if (!body.entity !== !body.entity_id) throw new ApiError(422, "invalid_input", "Send entity and entity_id together.")
      if (body.entity) await checkEntity(db, orgId, body.entity, body.entity_id!)
      return uploadLink({ org_id: orgId, key_id: keyId }, { kind: "file", entity: body.entity, entity_id: body.entity_id, folder: body.entity ? undefined : body.folder || undefined, label: body.label })
    },
  }),
  endpoint({
    method: "POST",
    path: "/files",
    permission: "org.files.manage",
    tag: "Files",
    summary: "Register an uploaded file",
    description: "Step 2 of 2 (after POST /files/uploads + PUT). Attach it to a record (`entity` + `entity_id`) or put it in a `folder`. Size and type are read from the stored object.",
    body: z
      .object({
        path: z.string().max(200),
        name: z.string().trim().min(1).max(255),
        entity: Entity.optional(),
        entity_id: uuid.optional(),
        folder: folderText.optional(),
      })
      .strict(),
    response: FileMeta,
    status: 201,
    async handler({ db, orgId, body }) {
      if (!FILE_PATH.test(body.path) || !body.path.startsWith(`orgs/${orgId}/`)) throw new ApiError(422, "invalid_path", "Use the path returned by POST /files/uploads.")
      if (!body.entity !== !body.entity_id) throw new ApiError(422, "invalid_input", "Send entity and entity_id together.")
      if (body.entity) await checkEntity(db, orgId, body.entity, body.entity_id!)
      const { data: info } = await db.storage.from("files").info(body.path)
      if (!info) throw new ApiError(422, "not_uploaded", "Nothing was uploaded to this path yet.")
      if ((info.size ?? 0) > MAX_FILE_BYTES) {
        await db.storage.from("files").remove([body.path])
        throw new ApiError(422, "too_large", `Files may have at most ${MAX_FILE_BYTES / 1024 / 1024} MB.`)
      }
      const { data, error } = await db
        .from("files")
        .insert({
          org_id: orgId,
          name: body.name,
          path: body.path,
          mime: (info.contentType || "application/octet-stream").slice(0, 200),
          size: info.size ?? 0,
          entity: body.entity ?? null,
          entity_id: body.entity ? body.entity_id! : null,
          folder: body.entity ? null : body.folder || null,
        })
        .select("id")
        .single()
      if (error) throw dbError(error)
      return getFile(db, orgId, data.id)
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/files/{id}",
    permission: "org.files.manage",
    tag: "Files",
    summary: "Rename, move or attach a file",
    description: "`folder` moves it into a folder (and detaches it from a record); `entity` + `entity_id` attach it to a record.",
    body: z
      .object({ name: z.string().trim().min(1).max(255), folder: folderText.nullable(), entity: Entity, entity_id: uuid })
      .partial()
      .strict(),
    response: FileMeta,
    async handler({ db, orgId, params, body }) {
      if (!body.entity !== !body.entity_id) throw new ApiError(422, "invalid_input", "Send entity and entity_id together.")
      if (body.entity && body.folder) throw new ApiError(422, "invalid_input", "A file is either in a folder or attached to a record.")
      if (body.entity) await checkEntity(db, orgId, body.entity, body.entity_id!)
      const patch = {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.folder !== undefined ? { folder: body.folder || null, entity: null, entity_id: null } : {}),
        ...(body.entity ? { entity: body.entity, entity_id: body.entity_id, folder: null } : {}),
      }
      const { data, error } = await db.from("files").update(patch).eq("id", params.id).eq("org_id", orgId).or(NOT_HR).is("deleted_at", null).select("id").maybeSingle()
      if (error) throw dbError(error)
      if (!data) throw notFound()
      return getFile(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/files/{id}",
    permission: "org.files.manage",
    tag: "Files",
    summary: "Delete a file",
    description: "Moves it to the trash (restorable for 30 days).",
    response: z.object({ deleted: z.literal(true) }),
    async handler({ db, orgId, params }) {
      await getFile(db, orgId, params.id)
      const { error } = await db.rpc("soft_delete", { p_table: "public.files", p_id: params.id })
      if (error) throw dbError(error)
      return { deleted: true as const }
    },
  }),
  endpoint({
    method: "POST",
    path: "/files/{id}/restore",
    permission: "org.files.manage",
    tag: "Files",
    summary: "Restore a deleted file",
    response: FileMeta,
    async handler({ db, orgId, params }) {
      await getFile(db, orgId, params.id, true)
      const { error } = await db.rpc("restore_deleted", { p_table: "public.files", p_id: params.id })
      if (error) throw dbError(error)
      return getFile(db, orgId, params.id)
    },
  }),

  endpoint({
    method: "GET",
    path: "/letter-templates",
    permission: "org.files.view",
    tag: "Letters",
    summary: "List letter templates",
    description: "The org's own templates first, then roots' defaults (`default: true`).",
    response: z.object({ data: z.array(Template) }),
    async handler({ db, orgId }) {
      const { data } = await db.from("letter_templates").select(TEMPLATE_COLS).or(`org_id.is.null,org_id.eq.${orgId}`).is("deleted_at", null).order("name")
      const rows = (data ?? []).sort((a, b) => Number(a.org_id === null) - Number(b.org_id === null))
      return { data: rows.map(templateOut) }
    },
  }),
  endpoint({
    method: "GET",
    path: "/letter-templates/{id}",
    permission: "org.files.view",
    tag: "Letters",
    summary: "Get a letter template",
    response: Template,
    async handler({ db, orgId, params }) {
      if (!(await loadTemplate(await letterCtx(db, orgId), params.id))) throw notFound()
      return getTemplate(db, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/letter-templates",
    permission: "org.files.manage",
    tag: "Letters",
    summary: "Create a letter template",
    body: TemplateBody.partial({ title: true, body: true, fields: true, letterhead: true }).strict(),
    response: Template,
    status: 201,
    async handler({ db, orgId, body }) {
      const { data, error } = await db
        .from("letter_templates")
        .insert({
          org_id: orgId,
          name: body.name,
          title: body.title ?? body.name,
          ...(body.body !== undefined ? { body: cleanHtml(body.body).slice(0, 100000) } : {}),
          ...(body.fields ? { fields: readFields(body.fields) } : {}),
          ...(body.letterhead !== undefined ? { letterhead: body.letterhead } : {}),
        })
        .select("id")
        .single()
      if (error) throw dbError(error)
      return getTemplate(db, data.id)
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/letter-templates/{id}",
    permission: "org.files.manage",
    tag: "Letters",
    summary: "Change a letter template",
    description: "Only the org's own templates; copy a default first (POST /letter-templates/{id}/copy).",
    body: TemplateBody.partial().strict(),
    response: Template,
    async handler({ db, orgId, params, body }) {
      await ownTemplate(db, orgId, params.id)
      const { fields, body: html, ...rest } = body
      const { error } = await db
        .from("letter_templates")
        .update({ ...rest, ...(html !== undefined ? { body: cleanHtml(html).slice(0, 100000) } : {}), ...(fields ? { fields: readFields(fields) } : {}) })
        .eq("id", params.id)
        .eq("org_id", orgId)
      if (error) throw dbError(error)
      return getTemplate(db, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/letter-templates/{id}/copy",
    permission: "org.files.manage",
    tag: "Letters",
    summary: "Copy a template",
    description: "A default or own template as a new own one, to adapt.",
    response: Template,
    status: 201,
    async handler({ db, orgId, params }) {
      const src = await loadTemplate(await letterCtx(db, orgId), params.id)
      if (!src) throw notFound()
      const { data, error } = await db
        .from("letter_templates")
        .insert({
          org_id: orgId,
          name: src.org_id ? `${src.name} ${docT()("letters.copySuffix")}`.slice(0, 120) : src.name,
          title: src.title,
          body: src.body,
          fields: readFields(src.fields),
          letterhead: src.letterhead,
        })
        .select("id")
        .single()
      if (error) throw dbError(error)
      return getTemplate(db, data.id)
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/letter-templates/{id}",
    permission: "org.files.manage",
    tag: "Letters",
    summary: "Delete a letter template",
    description: "Own templates only; moves it to the trash (restorable for 30 days).",
    response: z.object({ deleted: z.literal(true) }),
    async handler({ db, orgId, params }) {
      await ownTemplate(db, orgId, params.id)
      const { error } = await db.rpc("soft_delete", { p_table: "public.letter_templates", p_id: params.id })
      if (error) throw dbError(error)
      return { deleted: true as const }
    },
  }),
  endpoint({
    method: "POST",
    path: "/letter-templates/{id}/restore",
    permission: "org.files.manage",
    tag: "Letters",
    summary: "Restore a deleted letter template",
    response: Template,
    async handler({ db, orgId, params }) {
      await ownTemplate(db, orgId, params.id, true)
      const { error } = await db.rpc("restore_deleted", { p_table: "public.letter_templates", p_id: params.id })
      if (error) throw dbError(error)
      return getTemplate(db, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/letter-templates/{id}/pdf",
    permission: "org.files.view",
    tag: "Letters",
    summary: "Render a filled letter as PDF",
    description: "Placeholders are filled from the contact, the org and `fields`. Returns the PDF base64-encoded; nothing is stored.",
    body: LetterInput,
    response: Pdf,
    async handler({ db, orgId, params, body }) {
      const { letter, bytes } = await apiLetter(db, orgId, params.id, body)
      return { filename: letterFileName(letter.title, letter.vars.name ?? ""), content_type: "application/pdf" as const, data: Buffer.from(bytes).toString("base64") }
    },
  }),
  endpoint({
    method: "POST",
    path: "/letter-templates/{id}/file",
    permission: "org.files.manage",
    tag: "Letters",
    summary: "Store a filled letter in Files",
    description: "The PDF is attached to the contact, or without contact put in the folder \"Briefe\".",
    body: LetterInput,
    response: FileMeta,
    status: 201,
    async handler({ db, orgId, params, body }) {
      const { ctx, letter, bytes } = await apiLetter(db, orgId, params.id, body)
      const stored = await storeLetter(ctx, letter, bytes, docT()("letters.folder"))
      if (stored.error) throw "code" in stored.error ? dbError(stored.error) : new ApiError(500, "internal", "Storage error.")
      return getFile(db, orgId, stored.id!)
    },
  }),
  endpoint({
    method: "POST",
    path: "/letter-templates/{id}/send",
    permission: "org.files.manage",
    tag: "Letters",
    summary: "Send a filled letter by email",
    description: "As PDF attachment to the contact's email address (`contact_id` required), through the org's email integration or roots' fallback.",
    body: LetterInput.required({ contact_id: true }),
    response: z.object({ sent: z.literal(true), to: z.string() }),
    async handler({ db, orgId, params, body }) {
      const { ctx, letter, bytes } = await apiLetter(db, orgId, params.id, body)
      if (!letter.email) throw new ApiError(422, "no_email", "The contact has no email address.")
      const message = fill(docT()("letters.mailText"), { name: letter.vars.name || "", document: letter.title, org: ctx.org.name })
      const sent = await sendOrgEmail(orgId, {
        to: letter.email,
        subject: letter.title,
        text: message,
        html: textHtml(message),
        attachments: [{ filename: letterFileName(letter.title, letter.vars.name ?? ""), content: bytes }],
      }).catch((e) => {
        throw new ApiError(502, "email_failed", e instanceof Error ? e.message : "Sending failed.")
      })
      if (!sent) throw new ApiError(422, "no_email_provider", "No email sending is set up for this organisation.")
      return { sent: true as const, to: letter.email }
    },
  }),
]
