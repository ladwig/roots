import { z } from "zod"
import { TAX_RATES, UNITS } from "@/documents/calc"
import { copyDocument, createDraft, issueDraft, validRangeFormat, VAT_ID, writeDraft, type DraftHeader, type DraftItem } from "@/documents/drafts"
import { loadDocView, pdfLogo } from "@/documents/load"
import { renderPdf } from "@/documents/pdf"
import { TEMPLATES } from "@/documents/templates"
import { fill } from "@/email/render"
import { deliverSoon } from "@/events/worker"
import { defaultLocale, messages } from "@/i18n/config"
import { createT } from "@/i18n/translate"
import { textHtml } from "@/letters/server"
import { sendOrgEmail } from "@/lib/org-email"
import { refreshPublicFromApi } from "@/lib/public-cache"
import { ApiError, dbError, endpoint, list, notFound, page, paged, uuid, type Endpoint } from "../core"
import { day, ts, type Db } from "./shared"
import { bicValid, ibanValid } from "@/lib/inputs"

// Documents are rendered in the org's document language (German for now), like the App's print view for German users.
const docT = () => createT(defaultLocale, messages[defaultLocale])

const Invoice = z.object({
  id: uuid,
  kind: z.string().describe("invoice, quote or cancellation"),
  status: z.string(),
  number: z.string().nullable(),
  contact_id: uuid.nullable(),
  recipient_name: z.string().nullable(),
  issue_date: day.nullable(),
  due_date: day.nullable(),
  currency: z.string(),
  net_total: z.number().int(),
  tax_total: z.number().int(),
  gross_total: z.number().int(),
  paid_at: ts.nullable(),
  updated_at: ts,
})
const INVOICE_COLS = "id, kind, status, number, contact_id, recipient_name, issue_date, due_date, currency, net_total, tax_total, gross_total, paid_at, updated_at"

const Item = z.object({
  position: z.number().int(),
  title: z.string(),
  description: z.string().nullable(),
  quantity: z.number(),
  unit: z.string().describe(`One of: ${UNITS.join(", ")}`),
  unit_price: z.number().int().describe("Net cents per unit"),
  tax_rate: z.number(),
})
const InvoiceDetail = Invoice.extend({
  title: z.string().nullable(),
  recipient_address: z.string().nullable(),
  recipient_email: z.string().nullable(),
  recipient_vat_id: z.string().nullable(),
  service_from: day.nullable(),
  service_to: day.nullable(),
  valid_until: day.nullable().describe("Quotes: valid until"),
  intro: z.string().nullable(),
  outro: z.string().nullable(),
  notes: z.string().nullable().describe("Internal notes, not printed"),
  tax_mode: z.enum(["standard", "small_business"]).describe("small_business = no VAT (§ 19 UStG)"),
  source_id: uuid.nullable().describe("The quote/invoice this was created from (cancellation: the cancelled invoice)"),
  issued_at: ts.nullable(),
  cancelled_at: ts.nullable(),
  created_at: ts,
  items: z.array(Item),
})
const DETAIL_COLS = `${INVOICE_COLS}, title, recipient_address, recipient_email, recipient_vat_id, service_from, service_to, valid_until, intro, outro, notes, tax_mode, source_id, issued_at, cancelled_at, created_at, document_items(position, title, description, quantity, unit, unit_price, tax_rate)`

async function detail(db: Db, orgId: string, id: string) {
  const { data } = await db.from("documents").select(DETAIL_COLS).eq("id", id).eq("org_id", orgId).maybeSingle()
  if (!data) throw notFound()
  const { document_items, ...doc } = data
  const items = document_items.sort((a, b) => a.position - b.position).map((i) => ({ ...i, quantity: Number(i.quantity), tax_rate: Number(i.tax_rate) }))
  return { ...doc, items }
}
// Shared draft logic → API errors (not_found = not this org's document).
const draftError = (e: { code?: string; message: string }) => (e.message === "not_found" ? notFound() : dbError(e))

const ItemInput = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().max(5000).nullable().optional(),
    quantity: z.number().positive().max(1e8).describe("Up to 3 decimals"),
    unit: z.enum(UNITS).default("piece"),
    unit_price: z.number().int().min(0).max(99_999_999).describe("Net cents per unit"),
    tax_rate: z.literal([...TAX_RATES]).default(19).describe("VAT in % (19, 7 or 0)"),
  })
  .strict()
const text = (max: number) => z.string().trim().max(max).nullable()
const Header = z
  .object({
    title: text(200),
    contact_id: uuid.nullable().describe("Contact of this org; the recipient fields are not changed by it"),
    recipient_name: text(200),
    recipient_address: text(500).describe("Lines separated by \\n"),
    recipient_email: z.email().max(320).nullable(),
    recipient_vat_id: text(20),
    issue_date: day.nullable().describe("Default on issue: today"),
    service_from: day.nullable(),
    service_to: day.nullable(),
    due_date: day.nullable().describe("Invoices: default on issue = issue date + payment terms"),
    valid_until: day.nullable(),
    intro: text(5000),
    outro: text(5000),
    notes: text(5000),
    tax_mode: z.enum(["standard", "small_business"]),
    items: z.array(ItemInput).max(200).describe("Replaces all items"),
  })
  .partial()
type HeaderIn = z.infer<typeof Header>
const toDraft = ({ items, recipient_vat_id, ...h }: HeaderIn): [DraftHeader, DraftItem[] | undefined] => [
  { ...h, ...(recipient_vat_id !== undefined ? { recipient_vat_id: recipient_vat_id?.toUpperCase().replace(/\s/g, "") || null } : {}) },
  items?.map((i) => ({ ...i, description: i.description?.trim() || null, quantity: Math.round(i.quantity * 1000) / 1000 })),
]
const hasHeader = (b: HeaderIn) => Object.values(b).some((v) => v !== undefined)

const Pdf = z.object({ filename: z.string(), content_type: z.literal("application/pdf"), data: z.string().describe("The PDF, base64-encoded") })

async function documentPdf(db: Db, orgId: string, id: string) {
  const { data: org } = await db.from("orgs").select("id, name, logo_path").eq("id", orgId).single()
  const loaded = org && (await loadDocView({ supabase: db, org }, id, docT()))
  if (!loaded) throw notFound()
  const { view, doc } = loaded
  const bytes = await renderPdf(view, await pdfLogo(view.logoUrl))
  const name = `${view.title} ${doc.number ?? ""}`.trim().replace(/[\\/:*?"<>|]+/g, "")
  return { doc, org, title: `${view.title} ${doc.number ?? ""}`.trim(), filename: `${name}.pdf`, bytes }
}

const Billing = z.object({
  legal_name: z.string().nullable(),
  street: z.string().nullable(),
  postal_code: z.string().nullable(),
  city: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  tax_number: z.string().nullable(),
  vat_id: z.string().nullable(),
  tax_mode: z.enum(["standard", "small_business"]),
  register: z.string().nullable(),
  representatives: z.string().nullable(),
  bank_name: z.string().nullable(),
  iban: z.string().nullable(),
  bic: z.string().nullable(),
  payment_days: z.number().int().describe("Payment terms in days"),
  quote_days: z.number().int().describe("Quotes valid for days"),
  invoice_intro: z.string().nullable(),
  invoice_outro: z.string().nullable(),
  quote_intro: z.string().nullable(),
  quote_outro: z.string().nullable(),
  template: z.enum(TEMPLATES),
})
const BILLING_COLS = "legal_name, street, postal_code, city, email, phone, website, tax_number, vat_id, tax_mode, register, representatives, bank_name, iban, bic, payment_days, quote_days, invoice_intro, invoice_outro, quote_intro, quote_outro, template"
const BILLING_DEFAULTS = {
  ...Object.fromEntries(BILLING_COLS.split(", ").map((k) => [k, null])),
  tax_mode: "standard",
  payment_days: 14,
  quote_days: 30,
  template: "classic",
}
const NumberRange = z.object({
  kind: z.enum(["invoice", "quote", "cancellation"]),
  format: z.string().describe("e.g. RE-{YYYY}-{NNNN}: {YYYY} {YY} {MM} and {N…} (counter, zero-padded to the number of N)"),
  next_number: z.number().int(),
  yearly_reset: z.boolean(),
})

export const endpoints: Endpoint[] = [
  endpoint({
    method: "GET",
    path: "/invoices",
    permission: "invoices.view",
    tag: "Invoices",
    summary: "List invoices, quotes and cancellations",
    description: "Amounts in cents. Drafts have no number yet.",
    query: page.extend({
      kind: z.enum(["invoice", "quote", "cancellation"]).optional(),
      status: z.string().max(20).optional(),
      contact_id: uuid.optional(),
      updated_since: z.iso.datetime({ offset: true }).optional(),
    }),
    response: list(Invoice),
    async handler({ db, orgId, query }) {
      let q = db.from("documents").select(INVOICE_COLS).eq("org_id", orgId).order("created_at").range(query.offset, query.offset + query.limit)
      if (query.kind) q = q.eq("kind", query.kind)
      if (query.status) q = q.eq("status", query.status)
      if (query.contact_id) q = q.eq("contact_id", query.contact_id)
      if (query.updated_since) q = q.gte("updated_at", query.updated_since)
      const { data } = await q
      return paged(data, query)
    },
  }),
  endpoint({
    method: "GET",
    path: "/invoices/{id}",
    permission: "invoices.view",
    tag: "Invoices",
    summary: "Get an invoice, quote or cancellation with its items",
    response: InvoiceDetail,
    handler: ({ db, orgId, params }) => detail(db, orgId, params.id),
  }),
  endpoint({
    method: "POST",
    path: "/invoices",
    permission: "invoices.manage",
    tag: "Invoices",
    summary: "Create a draft invoice or quote",
    description:
      "Starts with the org's defaults (texts, tax mode, service date / validity from the invoice settings). With `contact_id` the recipient is taken from the contact; any field given here overrides it. Issue it with POST /invoices/{id}/issue.",
    body: Header.extend({ kind: z.enum(["invoice", "quote"]).default("invoice") }).strict(),
    response: InvoiceDetail,
    status: 201,
    async handler({ db, orgId, body }) {
      const { kind, contact_id, ...rest } = body
      if (contact_id) {
        const { data: c } = await db.from("contacts").select("id").eq("id", contact_id).eq("org_id", orgId).maybeSingle()
        if (!c) throw new ApiError(422, "invalid_reference", "contact_id does not belong to this organisation.")
      }
      const created = await createDraft(db, orgId, kind, contact_id)
      if (created.error) throw dbError(created.error)
      if (hasHeader(rest)) {
        const [header, items] = toDraft(rest)
        const error = await writeDraft(db, orgId, created.id, header, items)
        if (error) {
          await db.from("documents").delete().eq("id", created.id).eq("org_id", orgId).eq("status", "draft")
          throw draftError(error)
        }
      }
      return detail(db, orgId, created.id)
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/invoices/{id}",
    permission: "invoices.manage",
    tag: "Invoices",
    summary: "Change a draft",
    description: "Only drafts can be changed (issued documents are frozen: 422 document_locked). `items` replaces all items; totals are recomputed.",
    body: Header.strict(),
    response: InvoiceDetail,
    async handler({ db, orgId, params, body }) {
      const [header, items] = toDraft(body)
      const error = await writeDraft(db, orgId, params.id, header, items)
      if (error) throw draftError(error)
      return detail(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/invoices/{id}",
    permission: "invoices.manage",
    tag: "Invoices",
    summary: "Delete a draft",
    description: "Only drafts. Issued documents are never deleted: cancel an invoice instead (POST /invoices/{id}/cancel).",
    response: z.object({ deleted: z.literal(true) }),
    async handler({ db, orgId, params }) {
      const { data: doc } = await db.from("documents").select("status").eq("id", params.id).eq("org_id", orgId).maybeSingle()
      if (!doc) throw notFound()
      if (doc.status !== "draft") throw new ApiError(422, "document_locked", "Issued documents can't be deleted.")
      const { error } = await db.from("documents").delete().eq("id", params.id).eq("org_id", orgId).eq("status", "draft")
      if (error) throw dbError(error)
      return { deleted: true as const }
    },
  }),
  endpoint({
    method: "POST",
    path: "/invoices/{id}/issue",
    permission: "invoices.manage",
    tag: "Invoices",
    summary: "Issue a draft",
    description: "Assigns the next number of the number range (gap-free) and freezes the document; status becomes `sent`. Invoices without due date get issue date + payment terms.",
    response: InvoiceDetail,
    async handler({ db, orgId, params }) {
      const { error } = await issueDraft(db, orgId, params.id)
      if (error) throw draftError(error)
      deliverSoon()
      return detail(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/invoices/{id}/status",
    permission: "invoices.manage",
    tag: "Invoices",
    summary: "Mark paid / unpaid, quote accepted / declined",
    description: "Allowed changes: invoice sent ↔ paid; quote sent → accepted / declined (and back to sent). Others: 422 invalid_status. Cancel invoices with POST /invoices/{id}/cancel.",
    body: z.object({ status: z.enum(["sent", "paid", "accepted", "declined"]) }).strict(),
    response: InvoiceDetail,
    async handler({ db, orgId, params, body }) {
      const { data, error } = await db.from("documents").update({ status: body.status }).eq("id", params.id).eq("org_id", orgId).select("id").maybeSingle()
      if (error) throw dbError(error)
      if (!data) throw notFound()
      deliverSoon()
      return detail(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/invoices/{id}/cancel",
    permission: "invoices.manage",
    tag: "Invoices",
    summary: "Cancel an issued invoice",
    description: "Creates and issues the cancellation invoice (own number, negative amounts) and marks the invoice cancelled. Returns the cancellation.",
    response: InvoiceDetail,
    async handler({ db, orgId, params }) {
      const { data: doc } = await db.from("documents").select("id").eq("id", params.id).eq("org_id", orgId).maybeSingle()
      if (!doc) throw notFound()
      const { data: stornoId, error } = await db.rpc("cancel_invoice", { p_id: params.id })
      if (error) throw dbError(error)
      deliverSoon()
      return detail(db, orgId, stornoId)
    },
  }),
  endpoint({
    method: "POST",
    path: "/invoices/{id}/copy",
    permission: "invoices.manage",
    tag: "Invoices",
    summary: "Copy into a new draft (quote → invoice)",
    description: "`as: \"invoice\"` turns a quote into an invoice draft (a sent quote is marked accepted); without it the document is duplicated as a draft of the same kind.",
    body: z.object({ as: z.literal("invoice").optional() }).strict(),
    response: InvoiceDetail,
    status: 201,
    async handler({ db, orgId, params, body }) {
      const { data: src } = await db.from("documents").select("kind").eq("id", params.id).eq("org_id", orgId).maybeSingle()
      if (!src) throw notFound()
      if (src.kind === "cancellation") throw new ApiError(422, "invalid_input", "Cancellations can't be copied.")
      const copy = await copyDocument(db, orgId, params.id, body.as ?? null)
      if (copy.error) throw draftError(copy.error)
      return detail(db, orgId, copy.id)
    },
  }),
  endpoint({
    method: "GET",
    path: "/invoices/{id}/pdf",
    permission: "invoices.view",
    tag: "Invoices",
    summary: "Download as PDF",
    description: "The same PDF as in the App (DIN 5008), base64-encoded in JSON. Drafts carry a draft stamp.",
    response: Pdf,
    async handler({ db, orgId, params }) {
      const { filename, bytes } = await documentPdf(db, orgId, params.id)
      return { filename, content_type: "application/pdf" as const, data: Buffer.from(bytes).toString("base64") }
    },
  }),
  endpoint({
    method: "POST",
    path: "/invoices/{id}/send",
    permission: "invoices.manage",
    tag: "Invoices",
    summary: "Send by email with the PDF attached",
    description:
      "Issued documents only. Goes to `to` or the document's recipient email, through the org's email integration (or roots' fallback). `message` replaces the default text. 422 no_email_provider if no email sending is set up.",
    body: z.object({ to: z.email().max(320).optional(), subject: z.string().trim().min(1).max(200).optional(), message: z.string().trim().min(1).max(10000).optional() }).strict(),
    response: z.object({ sent: z.literal(true), to: z.string() }),
    async handler({ db, orgId, params, body }) {
      const { data: doc } = await db.from("documents").select("status, recipient_email, recipient_name").eq("id", params.id).eq("org_id", orgId).maybeSingle()
      if (!doc) throw notFound()
      if (doc.status === "draft") throw new ApiError(422, "not_issued", "Issue the document first.")
      const to = body.to ?? doc.recipient_email
      if (!to) throw new ApiError(422, "no_email", "The document has no recipient email; pass `to`.")
      const { org, title, filename, bytes } = await documentPdf(db, orgId, params.id)
      const message = body.message ?? fill(docT()("letters.mailText"), { name: doc.recipient_name ?? "", document: title, org: org.name })
      const sent = await sendOrgEmail(orgId, { to, subject: body.subject ?? title, text: message, html: textHtml(message), attachments: [{ filename, content: bytes }] }).catch((e) => {
        throw new ApiError(502, "email_failed", e instanceof Error ? e.message : "Sending failed.")
      })
      if (!sent) throw new ApiError(422, "no_email_provider", "No email sending is set up for this organisation.")
      return { sent: true as const, to }
    },
  }),
  endpoint({
    method: "GET",
    path: "/invoice-settings",
    permission: "invoices.view",
    tag: "Invoices",
    summary: "Get the invoice settings",
    description: "Seller data, bank details, defaults and the print template.",
    response: Billing,
    async handler({ db, orgId }) {
      const { data } = await db.from("org_billing").select(BILLING_COLS).eq("org_id", orgId).maybeSingle()
      return data ?? BILLING_DEFAULTS
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/invoice-settings",
    permission: "invoices.manage",
    tag: "Invoices",
    summary: "Change the invoice settings",
    description: "Only the fields given. Issued documents keep the seller data they were issued with.",
    body: z
      .object({
        legal_name: text(200),
        street: text(200),
        postal_code: text(20),
        city: text(100),
        email: z.email().max(320).nullable(),
        phone: text(50),
        website: text(200),
        tax_number: text(50),
        vat_id: text(20),
        tax_mode: z.enum(["standard", "small_business"]),
        register: text(200),
        representatives: text(300),
        bank_name: text(100),
        iban: text(40),
        bic: text(11),
        payment_days: z.number().int().min(0).max(365),
        quote_days: z.number().int().min(1).max(365),
        invoice_intro: text(5000),
        invoice_outro: text(5000),
        quote_intro: text(5000),
        quote_outro: text(5000),
        template: z.enum(TEMPLATES),
      })
      .partial()
      .strict(),
    response: Billing,
    async handler({ db, orgId, body }) {
      const upper = (v: string | null | undefined) => (v === undefined ? undefined : v?.toUpperCase().replace(/\s/g, "") || null)
      const patch = { ...body, vat_id: upper(body.vat_id), iban: upper(body.iban), bic: upper(body.bic) }
      const blank = (v: unknown) => (typeof v === "string" && !v ? null : v)
      for (const k of Object.keys(patch) as (keyof typeof patch)[]) if (patch[k] === undefined) delete patch[k]
      if (patch.vat_id && !VAT_ID.test(patch.vat_id)) throw new ApiError(422, "invalid_vat_id", "The VAT ID is invalid.")
      if (patch.iban && !ibanValid(patch.iban)) throw new ApiError(422, "invalid_iban", "The IBAN is invalid.")
      if (patch.bic && !bicValid(patch.bic)) throw new ApiError(422, "invalid_bic", "The BIC is invalid.")
      const row = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, blank(v)])) as typeof patch
      const { data: existing } = await db.from("org_billing").select("org_id").eq("org_id", orgId).maybeSingle()
      const { data, error } = existing
        ? await db.from("org_billing").update(row).eq("org_id", orgId).select(BILLING_COLS).single()
        : await db.from("org_billing").insert({ ...row, org_id: orgId }).select(BILLING_COLS).single()
      if (error) throw dbError(error)
      refreshPublicFromApi(orgId) // public pages show this
      return data
    },
  }),
  endpoint({
    method: "GET",
    path: "/invoice-settings/number-ranges",
    permission: "invoices.view",
    tag: "Invoices",
    summary: "List the number ranges",
    description: "Kinds without a row use the default format.",
    response: z.object({ data: z.array(NumberRange) }),
    async handler({ db, orgId }) {
      const { data } = await db.from("number_ranges").select("kind, format, next_number, yearly_reset").eq("org_id", orgId).order("kind")
      return { data: (data ?? []) as z.infer<typeof NumberRange>[] }
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/invoice-settings/number-ranges/{kind}",
    permission: "invoices.manage",
    tag: "Invoices",
    summary: "Set a number range",
    description: "`kind`: invoice or quote. Format placeholders: {N…} running number (N count = digits) or {RANDn} random characters (one of them required), {YYYY} {YY} {MM} issue date; otherwise only A–Z, 0–9 and - _ / . #",
    body: z.object({ format: z.string().trim().min(1).max(60), next_number: z.number().int().min(1).max(999_999_999), yearly_reset: z.boolean().default(false) }).strict(),
    response: NumberRange,
    async handler({ db, orgId, params, body }) {
      const kind = params.kind
      if (kind !== "invoice" && kind !== "quote") throw notFound()
      if (!validRangeFormat(body.format)) throw new ApiError(422, "invalid_format", "Invalid format: needs {N…} or {RANDn}; allowed are {YYYY} {YY} {MM}, A–Z, 0–9 and - _ / . #")
      const { data, error } = await db
        .from("number_ranges")
        .upsert({ org_id: orgId, kind, format: body.format, next_number: body.next_number, yearly_reset: body.yearly_reset }, { onConflict: "org_id,kind" })
        .select("kind, format, next_number, yearly_reset")
        .single()
      if (error) throw dbError(error)
      return data as z.infer<typeof NumberRange>
    },
  }),
]
