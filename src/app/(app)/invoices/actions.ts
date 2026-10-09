"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { back } from "@/lib/url"
import { TAX_RATES, totals, UNITS } from "@/documents/calc"
import { TEMPLATES } from "@/documents/templates"
import { parsePrice } from "@/tickets/price"

const PATH = "/invoices"
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }) // YYYY-MM-DD
const addDays = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10)
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

async function billing(ctx: Ctx) {
  const { data } = await ctx.supabase.from("org_billing").select("*").eq("org_id", ctx.org.id).maybeSingle()
  return data
}

export async function createDocument(fd: FormData) {
  const { ctx, t } = await manager()
  const kind = fd.get("kind") === "quote" ? "quote" : "invoice"
  const b = await billing(ctx)
  const contactId = String(fd.get("contact") ?? "")
  let recipient: { recipient_name?: string | null; recipient_address?: string | null; recipient_email?: string | null; contact_id?: string } = {}
  if (/^[0-9a-f-]{36}$/.test(contactId)) {
    const { data: c } = await ctx.supabase.from("contacts").select("id, first_name, last_name, company, email, street, postal_code, city").eq("id", contactId).eq("org_id", ctx.org.id).maybeSingle()
    if (c)
      recipient = {
        contact_id: c.id,
        recipient_name: c.company || [c.first_name, c.last_name].filter(Boolean).join(" ") || null,
        recipient_address: [c.company ? [c.first_name, c.last_name].filter(Boolean).join(" ") : "", c.street ?? "", [c.postal_code, c.city].filter(Boolean).join(" ")].filter(Boolean).join("\n") || null,
        recipient_email: c.email,
      }
  }
  const d = today()
  const { data, error } = await ctx.supabase
    .from("documents")
    .insert({
      org_id: ctx.org.id,
      kind,
      tax_mode: b?.tax_mode ?? "standard",
      intro: kind === "quote" ? b?.quote_intro : b?.invoice_intro,
      outro: kind === "quote" ? b?.quote_outro : b?.invoice_outro,
      service_from: kind === "invoice" ? d : null,
      valid_until: kind === "quote" ? addDays(d, b?.quote_days ?? 30) : null,
      ...recipient,
    })
    .select("id")
    .single()
  if (error) back(PATH, { error: dbError(t, error) })
  redirect(`${PATH}/${data.id}`)
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
async function save(ctx: Ctx, t: Awaited<ReturnType<typeof getT>>, fd: FormData) {
  const id = String(fd.get("id") ?? "")
  const here = `${PATH}/${id}`
  const { data: doc } = await ctx.supabase.from("documents").select("id, status, tax_mode").eq("id", id).eq("org_id", ctx.org.id).maybeSingle()
  if (!doc) back(PATH, { error: t("errors.not_allowed") })
  if (doc.status !== "draft") back(here, { error: t("errors.document_locked") })
  let raw: unknown
  try {
    raw = JSON.parse(String(fd.get("items") ?? "[]"))
  } catch {
    back(here, { error: t("errors.invalid_input") })
  }
  const parsed = z.array(ItemInput).max(200).safeParse(raw)
  if (!parsed.success) back(here, { error: t("invoices.itemsInvalid") })
  const items = parsed.data.map((i, position) => {
    const quantity = Number(i.quantity.replace(/\./g, "").replace(",", ".")) || Number(i.quantity)
    const unit_price = parsePrice(i.unit_price)
    return { position, title: i.title, description: i.description.trim() || null, quantity, unit: i.unit, unit_price, tax_rate: i.tax_rate }
  })
  if (items.some((i) => !(i.quantity > 0) || i.quantity > 1e8 || i.unit_price === null)) back(here, { error: t("invoices.itemsInvalid") })
  const serviceFrom = date(fd, "service_from")
  const serviceTo = date(fd, "service_to")
  if (serviceFrom && serviceTo && serviceTo < serviceFrom) back(here, { error: t("errors.end_before_start") })
  const small = fd.get("tax_mode") === "small_business"
  const sum = totals(items.map((i) => ({ quantity: i.quantity, unit_price: i.unit_price!, tax_rate: i.tax_rate })), small)
  const contact = String(fd.get("contact_id") ?? "")
  const { error } = await ctx.supabase
    .from("documents")
    .update({
      title: text(fd, "title", 200),
      contact_id: /^[0-9a-f-]{36}$/.test(contact) ? contact : null,
      recipient_name: text(fd, "recipient_name", 200),
      recipient_address: text(fd, "recipient_address", 500),
      recipient_email: text(fd, "recipient_email", 320),
      recipient_vat_id: text(fd, "recipient_vat_id", 20)?.toUpperCase().replace(/\s/g, "") ?? null,
      issue_date: date(fd, "issue_date"),
      service_from: serviceFrom,
      service_to: serviceTo,
      due_date: date(fd, "due_date"),
      valid_until: date(fd, "valid_until"),
      intro: text(fd, "intro", 5000),
      outro: text(fd, "outro", 5000),
      notes: text(fd, "notes", 5000),
      tax_mode: small ? "small_business" : "standard",
      net_total: sum.net,
      tax_total: sum.tax,
      gross_total: sum.gross,
    })
    .eq("id", id)
  if (error) back(here, { error: dbError(t, error) })
  // Replace items (drafts only; RLS refuses items of issued documents).
  const del = await ctx.supabase.from("document_items").delete().eq("document_id", id)
  if (del.error) back(here, { error: dbError(t, del.error) })
  if (items.length) {
    const ins = await ctx.supabase.from("document_items").insert(items.map((i) => ({ ...i, unit_price: i.unit_price!, org_id: ctx.org.id, document_id: id })))
    if (ins.error) back(here, { error: dbError(t, ins.error) })
  }
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
  const { data: doc } = await ctx.supabase.from("documents").select("kind, issue_date, due_date").eq("id", id).single()
  if (doc?.kind === "invoice" && !doc.due_date) {
    const b = await billing(ctx)
    await ctx.supabase.from("documents").update({ due_date: addDays(doc.issue_date ?? today(), b?.payment_days ?? 14) }).eq("id", id)
  }
  const { data: number, error } = await ctx.supabase.rpc("issue_document", { p_id: id })
  if (error) back(here, { error: dbError(t, error) })
  deliverSoon()
  back(here, { ok: t("invoices.issued", { number: String(number) }) })
}

const STATUS = ["sent", "paid", "accepted", "declined", "cancelled"] as const
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
  const as = fd.get("as") === "invoice" ? "invoice" : null
  const { data: src } = await ctx.supabase.from("documents").select("*, document_items(*)").eq("id", id).eq("org_id", ctx.org.id).maybeSingle()
  if (!src) back(PATH, { error: t("errors.not_allowed") })
  const kind = as ?? src.kind
  const b = await billing(ctx)
  const d = today()
  const { data: copy, error } = await ctx.supabase
    .from("documents")
    .insert({
      org_id: ctx.org.id,
      kind,
      source_id: src.id,
      contact_id: src.contact_id,
      title: kind === src.kind ? src.title : null,
      recipient_name: src.recipient_name,
      recipient_address: src.recipient_address,
      recipient_email: src.recipient_email,
      recipient_vat_id: src.recipient_vat_id,
      intro: kind === src.kind ? src.intro : b?.invoice_intro,
      outro: kind === src.kind ? src.outro : b?.invoice_outro,
      tax_mode: src.tax_mode,
      currency: src.currency,
      service_from: kind === "invoice" ? d : null,
      valid_until: kind === "quote" ? addDays(d, b?.quote_days ?? 30) : null,
      net_total: src.net_total,
      tax_total: src.tax_total,
      gross_total: src.gross_total,
    })
    .select("id")
    .single()
  if (error) back(`${PATH}/${id}`, { error: dbError(t, error) })
  const items = src.document_items.map(({ position, title, description, quantity, unit, unit_price, tax_rate }) => ({
    position, title, description, quantity, unit, unit_price, tax_rate, org_id: ctx.org.id, document_id: copy.id,
  }))
  if (items.length) await ctx.supabase.from("document_items").insert(items)
  if (as === "invoice" && src.kind === "quote" && src.status === "sent") await ctx.supabase.from("documents").update({ status: "accepted" }).eq("id", src.id)
  redirect(`${PATH}/${copy.id}`)
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
  if (vat && !/^[A-Z]{2}[A-Z0-9]{2,13}$/.test(vat)) back(here, { error: t("invoices.vatInvalid") })
  if (iban && !/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(iban)) back(here, { error: t("invoices.ibanInvalid") })
  if (bic && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bic)) back(here, { error: t("invoices.bicInvalid") })
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
  back(here, { ok: t("invoices.saved") })
}

export async function saveNumberRange(fd: FormData) {
  const { ctx, t } = await manager()
  const here = `${PATH}/settings#numbers`
  const kind = fd.get("kind") === "quote" ? "quote" : "invoice"
  const format = String(fd.get("format") ?? "").trim().slice(0, 60)
  const next = Math.floor(Number(fd.get("next_number")))
  if (!/\{N+\}/.test(format) || /[^A-Za-z0-9{}\-_/.#]/.test(format.replace(/\{(YYYY|YY|MM|N+)\}/g, ""))) back(here, { error: t("invoices.formatInvalid") })
  if (!(next >= 1 && next < 1e9)) back(here, { error: t("errors.invalid_input") })
  const { error } = await ctx.supabase
    .from("number_ranges")
    .upsert({ org_id: ctx.org.id, kind, format, next_number: next, yearly_reset: fd.get("yearly_reset") === "1" }, { onConflict: "org_id,kind" })
  if (error) back(here, { error: dbError(t, error) })
  back(here, { ok: t("invoices.saved") })
}
