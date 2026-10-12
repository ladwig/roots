import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { Submission } from "./elements"

type Db = SupabaseClient<Database>

/**
 * The submitter as a contact: an existing live contact with the same email gets its empty fields filled and the
 * tags added (never overwritten); otherwise a new contact. Returns the contact id.
 */
export async function upsertContact(db: Db, orgId: string, s: Submission, tags: string[]) {
  const email = s.contact.email
  const { data: existing } = email
    ? await db.from("contacts").select("*").eq("org_id", orgId).eq("email", email).is("deleted_at", null).maybeSingle()
    : { data: null }
  if (existing) {
    const fill = Object.fromEntries(Object.entries(s.contact).filter(([k, v]) => v != null && existing[k as keyof typeof existing] == null))
    const custom = { ...s.custom, ...(existing.custom as Record<string, unknown>) }
    const { error } = await db
      .from("contacts")
      .update({ ...fill, custom: custom as never, tags: [...new Set([...existing.tags, ...tags])] })
      .eq("id", existing.id)
    if (error) throw error
    return existing.id
  }
  const { data, error } = await db.from("contacts").insert({ org_id: orgId, ...s.contact, custom: s.custom as never, tags }).select("id").single()
  if (error) throw error
  return data.id
}

/** Accepted membership application → contact + membership (+ entry fee). Returns the membership id. */
export async function membershipFromSubmission(db: Db, orgId: string, s: Submission, submittedAt: string, tags: string[], entryFeeText: (type: string) => string) {
  if (!s.membership) throw new Error("errors.invalid_input")
  const contactId = await upsertContact(db, orgId, s, tags)
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  const m = s.membership
  const startsOn = m.starts_on && m.starts_on > today ? m.starts_on : today
  const { data, error } = await db
    .from("memberships")
    .insert({
      org_id: orgId,
      contact_id: contactId,
      type_id: m.type_id,
      starts_on: startsOn,
      account_holder: m.account_holder,
      iban: m.iban,
      bic: m.bic,
      mandate_signed_on: m.iban ? submittedAt.slice(0, 10) : null,
    })
    .select("id, types:membership_types(name, entry_fee_cents)")
    .single()
  if (error) throw error
  if (data.types && data.types.entry_fee_cents > 0)
    await db.from("member_dues").insert({
      org_id: orgId,
      membership_id: data.id,
      kind: "entry",
      description: entryFeeText(data.types.name).slice(0, 140),
      amount_cents: data.types.entry_fee_cents,
      due_on: startsOn,
    })
  return { contactId, membershipId: data.id }
}
