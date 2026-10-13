"use server"

import { requirePerm } from "@/lib/context"
import { uniqueError } from "@/contacts/server"
import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { loadFields } from "@/lib/custom-fields"
import { contactName, readContact } from "./fields"

/** Contact search for pickers (server-side, any number of contacts). */
export async function searchContacts(q: string) {
  const ctx = await requirePerm("crm.view")
  const term = String(q ?? "").replace(/[%,()*]/g, "").trim().slice(0, 100)
  let query = ctx.supabase.from("contacts").select("id, first_name, last_name, company, email").eq("org_id", ctx.org.id).is("deleted_at", null).order("last_name").limit(20)
  if (term) query = query.or(["first_name", "last_name", "company", "email"].map((c) => `${c}.ilike.%${term}%`).join(","))
  const { data } = await query
  return (data ?? []).map((c) => ({ id: c.id, label: contactName(c), detail: c.email ?? "" }))
}

/** Quick add from a picker ("+ Neuen Kontakt anlegen"): same validation as the contact form, returns the picker option. */
export async function quickCreateContact(input: Record<string, string>): Promise<{ option: { id: string; label: string; detail: string } } | { error: string }> {
  const ctx = await requirePerm("crm.manage")
  const t = await getT()
  const r = readContact((k) => String(input[k] ?? ""), await loadFields(ctx.supabase, ctx.org.id, "contacts"))
  if ("error" in r) return { error: (r.field ? `${r.field}: ` : "") + t.dynamic(r.error) }
  if (!r.row.first_name && !r.row.last_name && !r.row.company && !r.row.email) return { error: t("contacts.quickNeedsName") }
  const { data, error } = await ctx.supabase.from("contacts").insert({ ...r.row, org_id: ctx.org.id }).select("id, first_name, last_name, company, email").single()
  if (error) return { error: uniqueError(t, error) }
  deliverSoon()
  return { option: { id: data.id, label: contactName(data), detail: data.email ?? "" } }
}
