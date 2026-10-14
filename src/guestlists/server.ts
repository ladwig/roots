// Guest lists, server side. Lists linked to a ticket type give every entry a real (free) ticket: renaming the entry
// renames the ticket (same code), removing the entry voids it. Service role: callers check permissions first.
import { randomBytes } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"

const db = () => createAdminClient()
export const linkToken = () => Array.from(randomBytes(24), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("")

/**
 * Bring the entries' tickets in line with the list (create missing, rename changed). Idempotent and safe to run
 * concurrently: guest_sync_tickets() locks the list and issues per entry (tested in supabase/tests/isolation.sql).
 */
export async function syncTickets(listId: string) {
  const { error } = await db().rpc("guest_sync_tickets", { p_list: listId })
  if (error) throw error
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
