// Draft documents (invoices/quotes), shared by the App's Server Actions and the API: create with the org's defaults,
// write header + items (totals recomputed), issue, copy. Callers check permissions and validate input; `db` is
// either the App's org-scoped client or the API's key-scoped service client, so every query filters by org.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { totals } from "./calc"

export type Db = SupabaseClient<Database>
type DbErr = { code?: string; message: string }
// Own failures look like DB errors (P0001 + short code), so both callers report them like the database's own.
const fail = (message: string): DbErr => ({ code: "P0001", message })

export const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }) // YYYY-MM-DD
export const addDays = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10)

export const VAT_ID = /^[A-Z]{2}[A-Z0-9]{2,13}$/
/** Number range format: needs {N…}, otherwise only {YYYY} {YY} {MM} and A-Z 0-9 - _ / . # */
export { validRangeFormat } from "@/lib/number-ranges"

export const billing = async (db: Db, orgId: string) => (await db.from("org_billing").select("*").eq("org_id", orgId).maybeSingle()).data

/** Recipient fields of a document from a contact of the org (null if it isn't one). */
export async function recipientOf(db: Db, orgId: string, contactId: string) {
  const { data: c } = await db.from("contacts").select("id, first_name, last_name, company, email, street, postal_code, city").eq("id", contactId).eq("org_id", orgId).maybeSingle()
  if (!c) return null
  return {
    contact_id: c.id,
    recipient_name: c.company || [c.first_name, c.last_name].filter(Boolean).join(" ") || null,
    recipient_address: [c.company ? [c.first_name, c.last_name].filter(Boolean).join(" ") : "", c.street ?? "", [c.postal_code, c.city].filter(Boolean).join(" ")].filter(Boolean).join("\n") || null,
    recipient_email: c.email,
  }
}

/** A new draft with the org's defaults (texts, tax mode, service date / validity), optionally for a contact. */
export async function createDraft(db: Db, orgId: string, kind: "invoice" | "quote", contactId?: string | null): Promise<{ id: string; error?: never } | { id?: never; error: DbErr }> {
  const [b, recipient] = await Promise.all([billing(db, orgId), contactId ? recipientOf(db, orgId, contactId) : null])
  const d = today()
  const { data, error } = await db
    .from("documents")
    .insert({
      org_id: orgId,
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
  return error ? { error } : { id: data.id }
}

export type DraftItem = { title: string; description: string | null; quantity: number; unit: string; unit_price: number; tax_rate: number }
export type DraftHeader = Partial<{
  title: string | null
  contact_id: string | null
  recipient_name: string | null
  recipient_address: string | null
  recipient_email: string | null
  recipient_vat_id: string | null
  issue_date: string | null
  service_from: string | null
  service_to: string | null
  due_date: string | null
  valid_until: string | null
  intro: string | null
  outro: string | null
  notes: string | null
  tax_mode: "standard" | "small_business"
}>

/**
 * Writes header fields of a draft (only those given) and, if `items` is given, replaces its items. Totals are
 * recomputed from the items. Errors: not_found (not the org's), document_locked (issued), end_before_start, invalid_input.
 */
export async function writeDraft(db: Db, orgId: string, id: string, header: DraftHeader, items?: DraftItem[]): Promise<DbErr | null> {
  const { data: doc } = await db
    .from("documents")
    .select("id, status, tax_mode, service_from, service_to, document_items(quantity, unit_price, tax_rate)")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!doc) return fail("not_found")
  if (doc.status !== "draft") return fail("document_locked")
  const from = header.service_from !== undefined ? header.service_from : doc.service_from
  const to = header.service_to !== undefined ? header.service_to : doc.service_to
  if (from && to && to < from) return fail("end_before_start")
  if (header.contact_id) {
    const { data: c } = await db.from("contacts").select("id").eq("id", header.contact_id).eq("org_id", orgId).maybeSingle()
    if (!c) return fail("invalid_input")
  }
  const lines = items ?? doc.document_items.map((i) => ({ quantity: Number(i.quantity), unit_price: i.unit_price, tax_rate: Number(i.tax_rate) }))
  const sum = totals(lines, (header.tax_mode ?? doc.tax_mode) === "small_business")
  const { error } = await db
    .from("documents")
    .update({ ...header, net_total: sum.net, tax_total: sum.tax, gross_total: sum.gross })
    .eq("id", id)
    .eq("org_id", orgId)
  if (error) return error
  if (!items) return null
  // Replace items (drafts only; RLS / the guard refuse items of issued documents).
  const del = await db.from("document_items").delete().eq("document_id", id).eq("org_id", orgId)
  if (del.error) return del.error
  if (items.length) {
    const ins = await db.from("document_items").insert(items.map((i, position) => ({ ...i, position, org_id: orgId, document_id: id })))
    if (ins.error) return ins.error
  }
  return null
}

/** Issue a draft: number assigned, data frozen. Invoices without due date get issue date + payment terms. */
export async function issueDraft(db: Db, orgId: string, id: string): Promise<{ number: string; error?: never } | { number?: never; error: DbErr }> {
  const { data: doc } = await db.from("documents").select("kind, status, issue_date, due_date").eq("id", id).eq("org_id", orgId).maybeSingle()
  if (!doc) return { error: fail("not_found") }
  if (doc.status === "draft" && doc.kind === "invoice" && !doc.due_date) {
    const b = await billing(db, orgId)
    await db.from("documents").update({ due_date: addDays(doc.issue_date ?? today(), b?.payment_days ?? 14) }).eq("id", id).eq("org_id", orgId)
  }
  const { data: number, error } = await db.rpc("issue_document", { p_id: id })
  return error ? { error } : { number: String(number) }
}

/** Copy a document into a new draft: quote → invoice (marks a sent quote accepted), or a duplicate of the same kind. */
export async function copyDocument(db: Db, orgId: string, id: string, as: "invoice" | null): Promise<{ id: string; error?: never } | { id?: never; error: DbErr }> {
  const { data: src } = await db.from("documents").select("*, document_items(*)").eq("id", id).eq("org_id", orgId).maybeSingle()
  if (!src) return { error: fail("not_found") }
  const kind = as ?? src.kind
  const b = await billing(db, orgId)
  const d = today()
  const { data: copy, error } = await db
    .from("documents")
    .insert({
      org_id: orgId,
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
  if (error) return { error }
  const items = src.document_items.map(({ position, title, description, quantity, unit, unit_price, tax_rate }) => ({
    position, title, description, quantity, unit, unit_price, tax_rate, org_id: orgId, document_id: copy.id,
  }))
  if (items.length) await db.from("document_items").insert(items)
  if (as === "invoice" && src.kind === "quote" && src.status === "sent") await db.from("documents").update({ status: "accepted" }).eq("id", src.id).eq("org_id", orgId)
  return { id: copy.id }
}
