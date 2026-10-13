import { z } from "zod"
import { slugify } from "@/app/(app)/events/slug"
import { parseTags } from "@/app/(app)/contacts/fields"
import { deliverSoon } from "@/events/worker"
import { checkElements, type Element } from "@/forms/elements"
import { acceptSubmission, insertForm } from "@/forms/server"
import { defaultLocale, messages } from "@/i18n/config"
import { createT } from "@/i18n/translate"
import { loadFields } from "@/lib/custom-fields"
import { refreshPublicFromApi } from "@/lib/public-cache"
import type { Database } from "@/lib/supabase/types"
import { ApiError, dbError, endpoint, list, notFound, page, paged, uuid, type Endpoint } from "../core"
import { ts, type Db } from "./shared"

// Default texts (form templates, entry fee description) in the org's language: German for now.
const t = createT(defaultLocale, messages[defaultLocale])

const Status = z.enum(["draft", "published", "closed"])
const Form = z.object({ id: uuid, title: z.string(), slug: z.string(), purpose: z.enum(["contact", "membership"]), status: Status, created_at: ts, updated_at: ts })
const FORM_COLS = "id, title, slug, purpose, status, created_at, updated_at"

// Elements: what the public form shows, in order. Fields are platform fields ("first_name", "email", …,
// "membership.type", "membership.starts_on" on membership forms) or the org's custom contact fields ("custom.<key>").
const elementId = z.string().regex(/^[A-Za-z0-9_-]{1,20}$/)
const elementSchemas = (id: z.ZodType<string | undefined>) =>
  z.discriminatedUnion("kind", [
    z.object({ id, kind: z.literal("field"), field: z.string().max(80), label: z.string().max(200).optional(), help: z.string().max(500).optional(), required: z.boolean().default(false) }).strict(),
    z.object({ id, kind: z.literal("text"), body: z.string().max(5000) }).strict(),
    z.object({ id, kind: z.literal("consent"), label: z.string().min(1).max(1000), required: z.boolean().default(true) }).strict(),
    z.object({ id, kind: z.literal("mandate").describe("SEPA direct debit mandate (membership forms only, once)") }).strict(),
  ])
const ElementOut = elementSchemas(elementId)
const ElementIn = elementSchemas(elementId.optional().describe("Keep existing ids; omit for new elements"))

const FormDetail = Form.extend({
  intro: z.string().nullable(),
  success_text: z.string().nullable(),
  tags: z.array(z.string()).describe("Tags added to contacts created from submissions"),
  elements: z.array(ElementOut),
  deleted_at: ts.nullable(),
})
const DETAIL_COLS = "id, title, slug, purpose, status, created_at, updated_at, intro, success_text, settings, elements, deleted_at"
type FormRow = { settings: unknown; elements: unknown } & Record<string, unknown>
const formOut = ({ settings, elements, ...f }: FormRow) => ({ ...f, tags: (settings as { tags?: string[] })?.tags ?? [], elements: elements as Element[] })

const Submission = z.object({
  id: uuid,
  form_id: uuid,
  status: z.enum(["new", "accepted", "rejected"]),
  email: z.string().nullable(),
  data: z.record(z.string(), z.unknown()).describe("{ contact, custom, membership, consents } as submitted (IBAN masked)"),
  contact_id: uuid.nullable(),
  membership_id: uuid.nullable(),
  created_at: ts,
})
const SUB_COLS = "id, form_id, status, email, data, contact_id, membership_id, created_at"
const maskIban = (d: unknown) => {
  const m = (d as { membership?: { iban?: string | null } })?.membership
  return m?.iban ? { ...(d as object), membership: { ...m, iban: `${m.iban.slice(0, 4)}…${m.iban.slice(-4)}` } } : d
}
const subOut = <S extends { data: unknown }>(s: S) => ({ ...s, data: maskIban(s.data) })

async function getForm(db: Db, orgId: string, id: string, deleted = false) {
  let q = db.from("forms").select(DETAIL_COLS).eq("id", id).eq("org_id", orgId)
  q = deleted ? q.not("deleted_at", "is", null) : q.is("deleted_at", null)
  const { data } = await q.maybeSingle()
  if (!data) throw notFound()
  return data
}
async function getSubmission(db: Db, orgId: string, id: string) {
  const { data } = await db.from("form_submissions").select(SUB_COLS).eq("id", id).eq("org_id", orgId).maybeSingle()
  if (!data) throw notFound()
  return data
}
const slugTaken = (e: { code?: string; message: string }) => (e.code === "23505" ? new ApiError(409, "slug_taken", "Another form already uses this slug.") : dbError(e))

export const endpoints: Endpoint[] = [
  endpoint({
    method: "GET",
    path: "/forms",
    permission: "forms.view",
    tag: "Forms",
    summary: "List forms",
    description: "`deleted=true` lists the trash instead (restorable for 30 days).",
    query: z.object({ deleted: z.stringbool().default(false) }),
    response: z.object({ data: z.array(Form) }),
    async handler({ db, orgId, query }) {
      let q = db.from("forms").select(FORM_COLS).eq("org_id", orgId).order("created_at")
      q = query.deleted ? q.not("deleted_at", "is", null) : q.is("deleted_at", null)
      const { data } = await q
      return { data: data ?? [] }
    },
  }),
  endpoint({
    method: "GET",
    path: "/forms/{id}",
    permission: "forms.view",
    tag: "Forms",
    summary: "Get a form",
    description: "With its settings and elements. The public page is `/f/<slug>` on the org's site (only while `published`).",
    response: FormDetail,
    async handler({ db, orgId, params }) {
      return formOut(await getForm(db, orgId, params.id))
    },
  }),
  endpoint({
    method: "POST",
    path: "/forms",
    permission: "forms.manage",
    tag: "Forms",
    summary: "Create a form",
    description:
      "Starts as a draft from the purpose's template (fields, consents, for membership forms the type, start date and SEPA mandate). The slug is derived from the title. `membership` needs the members module; its submissions become members once accepted.",
    body: z.object({ title: z.string().trim().min(1).max(200), purpose: z.enum(["contact", "membership"]).default("contact") }).strict(),
    response: FormDetail,
    status: 201,
    async handler({ db, orgId, body }) {
      const [{ data: org }, { data: members }] = await Promise.all([
        db.from("orgs").select("id, name").eq("id", orgId).single(),
        body.purpose === "membership" ? db.rpc("module_enabled", { p_org: orgId, p_key: "members" }) : Promise.resolve({ data: true }),
      ])
      if (!org) throw notFound()
      if (!members) throw new ApiError(422, "module_disabled", "Membership forms need the members module.")
      const { data, error } = await insertForm(db, org, body.title, body.purpose, t)
      if (error || !data) throw error ? dbError(error) : notFound()
      refreshPublicFromApi(orgId)
      return formOut(await getForm(db, orgId, data.id))
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/forms/{id}",
    permission: "forms.manage",
    tag: "Forms",
    summary: "Change a form",
    description:
      "Publish (`status: published`), close or move back to draft; change texts, slug, tags; `elements` replaces the whole element list (same rules as the form builder: known fields only, each once, the mandate only on membership forms). Keep the `id` of existing elements.",
    body: z
      .object({
        title: z.string().trim().min(1).max(200),
        slug: z.string().trim().min(1).max(80).describe("Normalised to lowercase letters, digits and dashes"),
        status: Status,
        intro: z.string().max(5000).nullable(),
        success_text: z.string().max(2000).nullable(),
        tags: z.array(z.string().max(40)).max(20),
        elements: z.array(ElementIn).max(100),
      })
      .partial()
      .strict(),
    response: FormDetail,
    async handler({ db, orgId, params, body }) {
      const form = await getForm(db, orgId, params.id)
      const { tags, elements: els, slug, intro, success_text, ...rest } = body
      const patch: Database["public"]["Tables"]["forms"]["Update"] = { ...rest }
      if (slug !== undefined) patch.slug = slugify(slug)
      if (intro !== undefined) patch.intro = intro?.trim() || null
      if (success_text !== undefined) patch.success_text = success_text?.trim() || null
      if (tags) patch.settings = { tags: parseTags(tags.join(",")).slice(0, 20) }
      if (els) {
        const elements = els.map((e) => ({ ...e, id: e.id ?? Math.random().toString(36).slice(2, 10) }) as Element)
        const custom = (await loadFields(db, orgId, "contacts")).map((d) => d.key)
        if (checkElements(elements, form.purpose as "contact" | "membership", custom))
          throw new ApiError(422, "invalid_elements", "Invalid elements: unknown or repeated field, duplicate id, or a mandate outside a membership form.")
        patch.elements = elements as never
      }
      const { error } = await db.from("forms").update(patch).eq("id", params.id).eq("org_id", orgId)
      if (error) throw slugTaken(error)
      refreshPublicFromApi(orgId)
      return formOut(await getForm(db, orgId, params.id))
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/forms/{id}",
    permission: "forms.manage",
    tag: "Forms",
    summary: "Move a form to the trash",
    description: "Its public page goes offline. Restorable for 30 days, then purged with its submissions.",
    response: z.object({ ok: z.literal(true) }),
    async handler({ db, orgId, params }) {
      await getForm(db, orgId, params.id)
      const { error } = await db.rpc("soft_delete", { p_table: "public.forms", p_id: params.id })
      if (error) throw dbError(error)
      refreshPublicFromApi(orgId)
      return { ok: true as const }
    },
  }),
  endpoint({
    method: "POST",
    path: "/forms/{id}/restore",
    permission: "forms.manage",
    tag: "Forms",
    summary: "Restore a form from the trash",
    response: FormDetail,
    async handler({ db, orgId, params }) {
      await getForm(db, orgId, params.id, true)
      const { error } = await db.rpc("restore_deleted", { p_table: "public.forms", p_id: params.id })
      if (error) throw slugTaken(error) // another live form took the slug meanwhile
      refreshPublicFromApi(orgId)
      return formOut(await getForm(db, orgId, params.id))
    },
  }),
  endpoint({
    method: "GET",
    path: "/forms/{id}/submissions",
    permission: "forms.view",
    tag: "Forms",
    summary: "Submissions of a form",
    description: "Newest first. Poll with `since` to pick up new ones.",
    query: page.extend({ status: z.enum(["new", "accepted", "rejected"]).optional(), since: z.iso.datetime({ offset: true }).optional() }),
    response: list(Submission),
    async handler({ db, orgId, params, query }) {
      let q = db
        .from("form_submissions")
        .select(SUB_COLS)
        .eq("org_id", orgId)
        .eq("form_id", params.id)
        .order("created_at", { ascending: false })
        .range(query.offset, query.offset + query.limit)
      if (query.status) q = q.eq("status", query.status)
      if (query.since) q = q.gt("created_at", query.since)
      const { data } = await q
      return paged(data?.map(subOut) ?? [], query)
    },
  }),
  endpoint({
    method: "GET",
    path: "/form-submissions/{id}",
    permission: "forms.view",
    tag: "Forms",
    summary: "Get a submission",
    response: Submission,
    async handler({ db, orgId, params }) {
      return subOut(await getSubmission(db, orgId, params.id))
    },
  }),
  endpoint({
    method: "POST",
    path: "/form-submissions/{id}/accept",
    permission: "forms.manage",
    tag: "Forms",
    summary: "Accept a submission",
    description:
      "Only `new` submissions. The submitter becomes a contact (an existing contact with the same email gets its empty fields filled and the form's tags). Membership applications also create the membership (+ entry fee due); that needs `members.manage` too.",
    response: Submission,
    async handler({ db, orgId, params }) {
      const sub = await getSubmission(db, orgId, params.id)
      if (sub.status !== "new") throw new ApiError(409, "not_new", "This submission was already accepted or rejected.")
      let r: Awaited<ReturnType<typeof acceptSubmission>>
      try {
        r = await acceptSubmission(db, orgId, params.id, {
          canMembers: async () => (await db.rpc("has_perm", { p_org: orgId, p_perm: "members.manage" })).data === true,
          t,
        })
      } catch (e) {
        const err = e as { code?: string; message: string }
        throw err.message === "errors.invalid_input" ? new ApiError(422, "invalid_input", "The submission has no membership data.") : dbError(err)
      }
      if (r === "not_allowed") throw new ApiError(403, "forbidden", 'Accepting a membership application also needs the permission "members.manage".')
      deliverSoon()
      return subOut(await getSubmission(db, orgId, params.id))
    },
  }),
  endpoint({
    method: "POST",
    path: "/form-submissions/{id}/reject",
    permission: "forms.manage",
    tag: "Forms",
    summary: "Reject a submission",
    description: "Only `new` submissions. Nothing is created; the submission stays for the record.",
    response: Submission,
    async handler({ db, orgId, params }) {
      const sub = await getSubmission(db, orgId, params.id)
      if (sub.status !== "new") throw new ApiError(409, "not_new", "This submission was already accepted or rejected.")
      const { data, error } = await db.from("form_submissions").update({ status: "rejected" }).eq("id", params.id).eq("org_id", orgId).eq("status", "new").select(SUB_COLS).maybeSingle()
      if (error) throw dbError(error)
      if (!data) throw new ApiError(409, "not_new", "This submission was already accepted or rejected.")
      return subOut(data)
    },
  }),
]
