// Guest lists, server side. Lists linked to a ticket type give every entry a real (free) ticket: renaming the entry
// renames the ticket (same code), removing the entry voids it. Service role: callers check permissions first.
import { randomBytes } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"

const db = () => createAdminClient()
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const ticketCode = () => Array.from(randomBytes(10), (b) => ALPHABET[b % 32]).join("")
export const linkToken = () => Array.from(randomBytes(24), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("")

/** Bring the entries' tickets in line with the list (create missing, rename changed). Idempotent. */
export async function syncTickets(listId: string) {
  const { data: list } = await db().from("guest_lists").select("id, org_id, event_id, ticket_type_id, name, deleted_at").eq("id", listId).maybeSingle()
  if (!list?.ticket_type_id || !list.event_id || list.deleted_at) return
  const { data: entries } = await db().from("guest_entries").select("id, name, email, ticket_id, tickets(holder_name, status)").eq("list_id", listId)
  for (const e of entries ?? []) {
    if (e.ticket_id && e.tickets && e.tickets.status !== "void") {
      if (e.tickets.holder_name !== e.name) await db().from("tickets").update({ holder_name: e.name }).eq("id", e.ticket_id)
      continue
    }
    // One free, paid order per entry keeps tickets ↔ orders consistent (refunds, buyer page, API).
    const { data: order, error } = await db()
      .from("pay_orders")
      .insert({
        org_id: list.org_id,
        source_module: "guestlists",
        source_id: list.id,
        amount_total: 0,
        status: "paid",
        paid_at: new Date().toISOString(),
        fulfilled_at: new Date().toISOString(),
        customer_name: e.name,
        customer_email: e.email,
        metadata: { guest_entry: e.id, list: list.name },
      })
      .select("id")
      .single()
    if (error) throw error
    let ticket
    for (let attempt = 0; attempt < 3 && !ticket; attempt++) {
      const { data, error: tErr } = await db()
        .from("tickets")
        .insert({ org_id: list.org_id, event_id: list.event_id, type_id: list.ticket_type_id, order_id: order.id, code: ticketCode(), holder_name: e.name, status: "valid", price: 0 })
        .select("id")
        .single()
      if (tErr && tErr.code !== "23505") throw tErr
      ticket = data
    }
    if (ticket) await db().from("guest_entries").update({ ticket_id: ticket.id }).eq("id", e.id)
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
