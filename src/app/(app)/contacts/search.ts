"use server"

import { requirePerm } from "@/lib/context"
import { contactName } from "./fields"

/** Contact search for pickers (server-side, any number of contacts). */
export async function searchContacts(q: string) {
  const ctx = await requirePerm("crm.view")
  const term = String(q ?? "").replace(/[%,()*]/g, "").trim().slice(0, 100)
  let query = ctx.supabase.from("contacts").select("id, first_name, last_name, company, email").eq("org_id", ctx.org.id).is("deleted_at", null).order("last_name").limit(20)
  if (term) query = query.or(["first_name", "last_name", "company", "email"].map((c) => `${c}.ilike.%${term}%`).join(","))
  const { data } = await query
  return (data ?? []).map((c) => ({ id: c.id, label: contactName(c), detail: c.email ?? "" }))
}
