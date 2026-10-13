// Cash book, server side: book, reverse, close a month. Shared by the App's actions and the API (callers check the
// permission; the DB checks it again through RLS / the key, numbers entries and keeps them frozen).
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { EntryRow } from "./fields"

type Db = SupabaseClient<Database>
export type CashFail = { error: string; db?: { code?: string; message: string } }
const dbFail = (e: { code?: string; message: string }): CashFail => ({ error: "db", db: e })

/** Book an entry. With an invoice (income only): the invoice must be open and is marked paid. */
export async function bookEntry(db: Db, orgId: string, accountId: string, row: EntryRow, links: { contactId?: string | null; documentId?: string | null } = {}): Promise<CashFail | { id: string; number: string }> {
  if (links.documentId) {
    const { data: doc } = await db.from("documents").select("id, status, kind").eq("id", links.documentId).eq("org_id", orgId).maybeSingle()
    if (!doc || doc.kind !== "invoice" || doc.status !== "sent" || row.amount_cents < 0) return { error: "cashbook.invoiceNotOpen" }
  }
  if (links.contactId) {
    const { data: c } = await db.from("contacts").select("id").eq("id", links.contactId).eq("org_id", orgId).maybeSingle()
    if (!c) return { error: "errors.not_allowed" }
  }
  const { data, error } = await db
    .from("cash_entries")
    .insert({ org_id: orgId, account_id: accountId, ...row, contact_id: links.contactId ?? null, document_id: links.documentId ?? null })
    .select("id, number")
    .single()
  if (error || !data) return dbFail(error ?? { message: "insert failed" })
  if (links.documentId) await db.from("documents").update({ status: "paid" }).eq("id", links.documentId).eq("org_id", orgId).eq("status", "sent")
  return { id: data.id, number: data.number ?? "" }
}

/** Correct a booked entry: a reversal entry today with the opposite amount (each entry once, never a reversal). */
export async function reverseEntry(db: Db, orgId: string, id: string, today: string): Promise<CashFail | { id: string; number: string }> {
  const { data: e } = await db.from("cash_entries").select("*").eq("id", id).eq("org_id", orgId).maybeSingle()
  if (!e) return { error: "errors.not_allowed" }
  if (e.reverses_id) return { error: "cashbook.cantReverseReversal" }
  const { data: done } = await db.from("cash_entries").select("id").eq("reverses_id", id).maybeSingle()
  if (done) return { error: "cashbook.alreadyReversed" }
  const { data, error } = await db
    .from("cash_entries")
    .insert({
      org_id: orgId,
      account_id: e.account_id,
      booked_on: today,
      amount_cents: -e.amount_cents,
      description: `Storno ${e.number}: ${e.description}`.slice(0, 300),
      category: e.category,
      sphere: e.sphere,
      counterparty: e.counterparty,
      contact_id: e.contact_id,
      reverses_id: e.id,
    })
    .select("id, number")
    .single()
  if (error || !data) return dbFail(error ?? { message: "insert failed" })
  return { id: data.id, number: data.number ?? "" }
}

/** Close a month of an account (the DB computes the balance; only after the month ended; then frozen). */
export async function closeMonth(db: Db, orgId: string, accountId: string, month: string, countedCents: number | null, note: string | null): Promise<CashFail | { balance: number }> {
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "errors.invalid_input" }
  const { data, error } = await db
    .from("cash_closings")
    .insert({ org_id: orgId, account_id: accountId, month: `${month}-01`, balance_cents: 0, counted_cents: countedCents, note })
    .select("balance_cents")
    .single()
  if (error || !data) return dbFail(error ?? { message: "insert failed" })
  return { balance: data.balance_cents }
}
