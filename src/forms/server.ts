import type { SupabaseClient } from "@supabase/supabase-js"
import { slugify } from "@/app/(app)/events/slug"
import type { T } from "@/i18n/translate"
import type { Database } from "@/lib/supabase/types"
import { template, type Purpose, type Submission } from "./elements"

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

/** New form from the purpose's template with a free slug (App + API). Returns the insert result. */
export async function insertForm(db: Db, org: { id: string; name: string }, title: string, purpose: Purpose, t: T) {
  const base = slugify(title) || "form"
  const { data: taken } = await db.from("forms").select("slug").eq("org_id", org.id).like("slug", `${base}%`)
  let slug = base
  for (let i = 2; taken?.some((x) => x.slug === slug); i++) slug = `${base}-${i}`
  return db
    .from("forms")
    .insert({
      org_id: org.id,
      title,
      slug,
      purpose,
      elements: template(purpose, { privacy: t("forms.defaultPrivacy", { org: org.name }), statutes: t("forms.defaultStatutes") }) as never,
      success_text: t(purpose === "membership" ? "forms.defaultSuccessMembership" : "forms.defaultSuccess"),
    })
    .select("id")
    .single()
}

/**
 * Accept a new submission (App + API): membership application → contact + membership (+ entry fee), contact form →
 * contact. "not_allowed" when it isn't new/of this org or a membership needs members.manage the caller lacks.
 * Database errors are thrown. The caller runs deliverSoon().
 */
export async function acceptSubmission(db: Db, orgId: string, id: string, opts: { canMembers: () => boolean | Promise<boolean>; t: T }) {
  const { data: sub } = await db.from("form_submissions").select("id, data, status, created_at, forms(purpose, settings)").eq("id", id).eq("org_id", orgId).maybeSingle()
  if (!sub || sub.status !== "new") return "not_allowed" as const
  const tags = ((sub.forms?.settings as { tags?: string[] })?.tags ?? []).slice(0, 20)
  const data = sub.data as unknown as Submission
  if (sub.forms?.purpose === "membership") {
    if (!(await opts.canMembers())) return "not_allowed" as const
    const r = await membershipFromSubmission(db, orgId, data, sub.created_at, tags, (type) => opts.t("membership.entryFeeText", { type }))
    const { error } = await db.from("form_submissions").update({ status: "accepted", contact_id: r.contactId, membership_id: r.membershipId }).eq("id", id).eq("org_id", orgId)
    if (error) throw error
    return r
  }
  const contactId = await upsertContact(db, orgId, data, tags)
  const { error } = await db.from("form_submissions").update({ status: "accepted", contact_id: contactId }).eq("id", id).eq("org_id", orgId)
  if (error) throw error
  return { contactId, membershipId: null }
}
