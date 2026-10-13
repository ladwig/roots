"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { refreshPublic } from "@/lib/public-cache"
import { back } from "@/lib/url"
import { TAX_RATES, UNITS } from "@/documents/calc"
import { BIC, copyDocument as copyDraft, createDraft, IBAN, issueDraft, validRangeFormat, VAT_ID, writeDraft } from "@/documents/drafts"
import { TEMPLATES } from "@/documents/templates"
import { parsePrice } from "@/tickets/price"

const PATH = "/invoices"
const text = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max) || null
const date = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "")
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

async function manager() {
  const ctx = await requirePerm("invoices.manage")
  const t = await getT()
  if (!ctx.modules.has("invoices")) back(PATH, { error: t("errors.not_allowed") })
  return { ctx, t }
}
type Ctx = Awaited<ReturnType<typeof manager>>["ctx"]
type T = Awaited<ReturnType<typeof getT>>
// Shared draft logic reports "not_found" for documents of other orgs; the App says "not allowed" there.
const draftError = (t: T, e: { code?: string; message: string }) => (e.message === "not_found" ? t("errors.not_allowed") : dbError(t, e))

export async function createDocument(fd: FormData) {
  const { ctx, t } = await manager()
  const kind = fd.get("kind") === "quote" ? "quote" : "invoice"
  const contactId = String(fd.get("contact") ?? "")
  const { id, error } = await createDraft(ctx.supabase, ctx.org.id, kind, /^[0-9a-f-]{36}$/.test(contactId) ? contactId : null)
  if (error) back(PATH, { error: dbError(t, error) })
  redirect(`${PATH}/${id}`)
}

const ItemInput = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(5000).optional().default(""),
  quantity: z.string().max(20),
  unit: z.enum(UNITS),
  unit_price: z.string().max(20),
  tax_rate: z.coerce.number().refine((v) => (TAX_RATES as readonly number[]).includes(v)),
})

// Saves header + items of a draft (items are replaced as a whole). Returns the id or redirects with an error.
async function save(ctx: Ctx, t: T, fd: FormData) {
  const id = String(fd.get("id") ?? "")
  const here = `${PATH}/${id}`
  let raw: unknown
  try {
    raw = JSON.parse(String(fd.get("items") ?? "[]"))
  } catch {
    back(here, { error: t("errors.invalid_input") })
  }
  const parsed = z.array(ItemInput).max(200).safeParse(raw)
  if (!parsed.success) back(here, { error: t("invoices.itemsInvalid") })
  const items = parsed.data.map((i) => {
    const quantity = Number(i.quantity.replace(/\./g, "").replace(",", ".")) || Number(i.quantity)
    const unit_price = parsePrice(i.unit_price)
    return { title: i.title, description: i.description.trim() || null, quantity, unit: i.unit, unit_price, tax_rate: i.tax_rate }
  })
  if (items.some((i) => !(i.quantity > 0) || i.quantity > 1e8 || i.unit_price === null)) back(here, { error: t("invoices.itemsInvalid") })
  const contact = String(fd.get("contact_id") ?? "")
  const error = await writeDraft(
    ctx.supabase,
    ctx.org.id,
    id,
    {
      title: text(fd, "title", 200),
      contact_id: /^[0-9a-f-]{36}$/.test(contact) ? contact : null,
      recipient_name: text(fd, "recipient_name", 200),
      recipient_address: text(fd, "recipient_address", 500),
      recipient_email: text(fd, "recipient_email", 320),
      recipient_vat_id: text(fd, "recipient_vat_id", 20)?.toUpperCase().replace(/\s/g, "") ?? null,
      issue_date: date(fd, "issue_date"),
      service_from: date(fd, "service_from"),
      service_to: date(fd, "service_to"),
      due_date: date(fd, "due_date"),
      valid_until: date(fd, "valid_until"),
      intro: text(fd, "intro", 5000),
      outro: text(fd, "outro", 5000),
      notes: text(fd, "notes", 5000),
      tax_mode: fd.get("tax_mode") === "small_business" ? "small_business" : "standard",
    },
    items.map((i) => ({ ...i, unit_price: i.unit_price! })),
  )
  if (error) back(error.message === "not_found" ? PATH : here, { error: draftError(t, error) })
  return id
}

export async function saveDocument(fd: FormData) {
  const { ctx, t } = await manager()
  const id = await save(ctx, t, fd)
  back(`${PATH}/${id}`, { ok: t("invoices.saved") })
}

// Save, then issue: number assigned, data frozen. Due date defaults to issue date + payment terms.
export async function issueDocument(fd: FormData) {
  const { ctx, t } = await manager()
  const id = await save(ctx, t, fd)
  const here = `${PATH}/${id}`
  const { number, error } = await issueDraft(ctx.supabase, ctx.org.id, id)
  if (error) back(here, { error: draftError(t, error) })
  deliverSoon()
  back(here, { ok: t("invoices.issued", { number: String(number) }) })
}

const STATUS = ["sent", "paid", "accepted", "declined"] as const
export async function setDocumentStatus(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const status = STATUS.find((s) => s === fd.get("status"))
  const here = `${PATH}/${id}`
  if (!status) back(here, { error: t("errors.invalid_input") })
  const { error, count } = await ctx.supabase.from("documents").update({ status }, { count: "exact" }).eq("id", id).eq("org_id", ctx.org.id)
  if (error || !count) back(here, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  deliverSoon()
  back(here, { ok: t.dynamic(`invoices.statusDone.${status}`) })
}

// Copy a document into a new draft: quote → invoice (marks the quote accepted), or duplicate.
export async function copyDocument(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const copy = await copyDraft(ctx.supabase, ctx.org.id, id, fd.get("as") === "invoice" ? "invoice" : null)
  if (copy.error) back(copy.error.message === "not_found" ? PATH : `${PATH}/${id}`, { error: draftError(t, copy.error) })
  redirect(`${PATH}/${copy.id}`)
}

// Storno: creates the Stornorechnung (own number, negative amounts) and marks the invoice cancelled.
export async function cancelInvoice(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const { data: stornoId, error } = await ctx.supabase.rpc("cancel_invoice", { p_id: id })
  if (error) back(`${PATH}/${id}`, { error: dbError(t, error) })
  deliverSoon()
  back(`${PATH}/${stornoId}`, { ok: t("invoices.cancelled") })
}

export async function deleteDraft(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const { error, count } = await ctx.supabase.from("documents").delete({ count: "exact" }).eq("id", id).eq("org_id", ctx.org.id).eq("status", "draft")
  if (error || !count) back(`${PATH}/${id}`, { error: error ? dbError(t, error) : t("errors.document_locked") })
  back(PATH, { ok: t("invoices.deleted") })
}

// Settings: seller data, defaults, template, number ranges.
export async function saveBilling(fd: FormData) {
  const { ctx, t } = await manager()
  const here = `${PATH}/settings`
  const upper = (k: string, max: number) => text(fd, k, max)?.toUpperCase().replace(/\s/g, "") ?? null
  const vat = upper("vat_id", 20)
  const iban = upper("iban", 34)
  const bic = upper("bic", 11)
  if (vat && !VAT_ID.test(vat)) back(here, { error: t("invoices.vatInvalid") })
  if (iban && !IBAN.test(iban)) back(here, { error: t("invoices.ibanInvalid") })
  if (bic && !BIC.test(bic)) back(here, { error: t("invoices.bicInvalid") })
  const template = TEMPLATES.find((x) => x === fd.get("template")) ?? "classic"
  const days = (k: string, d: number) => Math.min(365, Math.max(0, Math.floor(Number(fd.get(k)) || d)))
  const { error } = await ctx.supabase.from("org_billing").upsert({
    org_id: ctx.org.id,
    legal_name: text(fd, "legal_name", 200),
    street: text(fd, "street", 200),
    postal_code: text(fd, "postal_code", 20),
    city: text(fd, "city", 100),
    email: text(fd, "email", 320),
    phone: text(fd, "phone", 50),
    website: text(fd, "website", 200),
    tax_number: text(fd, "tax_number", 50),
    vat_id: vat,
    tax_mode: fd.get("tax_mode") === "small_business" ? "small_business" : "standard",
    register: text(fd, "register", 200),
    representatives: text(fd, "representatives", 300),
    bank_name: text(fd, "bank_name", 100),
    iban,
    bic,
    payment_days: days("payment_days", 14),
    quote_days: Math.max(1, days("quote_days", 30)),
    invoice_intro: text(fd, "invoice_intro", 5000),
    invoice_outro: text(fd, "invoice_outro", 5000),
    quote_intro: text(fd, "quote_intro", 5000),
    quote_outro: text(fd, "quote_outro", 5000),
    template,
  })
  if (error) back(here, { error: dbError(t, error) })
  refreshPublic(ctx.org.id) // public pages show this
  back(here, { ok: t("invoices.saved") })
}

export async function saveNumberRange(fd: FormData) {
  const { ctx, t } = await manager()
  const here = `${PATH}/settings#numbers`
  const kind = fd.get("kind") === "quote" ? "quote" : "invoice"
  const format = String(fd.get("format") ?? "").trim().slice(0, 60)
  const next = Math.floor(Number(fd.get("next_number")))
  if (!validRangeFormat(format)) back(here, { error: t("invoices.formatInvalid") })
  if (!(next >= 1 && next < 1e9)) back(here, { error: t("errors.invalid_input") })
  const { error } = await ctx.supabase
    .from("number_ranges")
    .upsert({ org_id: ctx.org.id, kind, format, next_number: next, yearly_reset: fd.get("yearly_reset") === "1" }, { onConflict: "org_id,kind" })
  if (error) back(here, { error: dbError(t, error) })
  back(here, { ok: t("invoices.saved") })
}
