// Guest lists, server side. Event lists give every entry a real (free) ticket of the list's own hidden type (DB trigger): renaming the entry
// renames the ticket (same code), removing the entry voids it. Service role: callers check permissions first.
import { randomBytes } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { emailTickets } from "@/tickets/server"

const db = () => createAdminClient()
export const linkToken = () => Array.from(randomBytes(24), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("")

/**
 * Bring the entries' tickets in line with the list (create missing, rename changed). Idempotent and safe to run
 * concurrently: guest_sync_tickets() locks the list and issues per entry (tested in supabase/tests/isolation.sql).
 */
export async function syncTickets(listId: string) {
  const { error } = await db().rpc("guest_sync_tickets", { p_list: listId })
  if (error) throw error
  await mailGuestTickets(listId)
}

/** Guests with an email get their ticket (QR, PDF) once, like a shop order; marked in the order's metadata. */
export async function mailGuestTickets(listId: string) {
  const { data: orders } = await db()
    .from("pay_orders")
    .select("id, metadata")
    .eq("source_module", "guestlists")
    .eq("source_id", listId)
    .eq("status", "paid")
    .not("customer_email", "is", null)
    .is("metadata->>mailed_at", null)
    .limit(200)
  for (const o of orders ?? []) {
    const sent = await emailTickets(o.id).catch(() => false)
    if (sent) await db().from("pay_orders").update({ metadata: { ...(o.metadata as object), mailed_at: new Date().toISOString() } }).eq("id", o.id)
  }
}

/** Entry removed (or list unlinked): its ticket can't be used any more. */
export async function voidTicket(ticketId: string | null) {
  if (ticketId) await db().from("tickets").update({ status: "void" }).eq("id", ticketId).in("status", ["valid", "reserved"])
}

/** Public link submission (validated + quota-locked in the DB). Throws message keys. */
export async function addViaLink(token: string, submittedBy: string, names: string[], email: string | null) {
  const { data, error } = await db().rpc("guest_link_add", { p_token: token, p_submitted_by: submittedBy, p_names: names, p_email: email ?? undefined })
  if (error) throw new Error(error.message.includes("list_full") ? "guestlists.full" : error.message.includes("link_closed") ? "guestlists.closed" : "errors.invalid_input")
  const listId = data?.[0]?.list_id
  if (listId) await syncTickets(listId)
  return data?.length ?? 0
}
