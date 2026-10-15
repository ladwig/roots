// Org setup shared by the App's settings actions and the API (team invites, custom field definitions). Callers check
// the permission; RLS checks again (invites: org.members.manage, owner invites only by owners; fields: org.settings.manage).
import { createHash, randomBytes } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { T } from "@/i18n/translate"
import { CUSTOM_ENTITIES, FIELD_TYPES, fieldKey, type CustomEntity } from "@/lib/custom-fields"
import { sendPlatformEmail } from "@/lib/org-email"
import type { Database } from "@/lib/supabase/types"
import { APP_URL } from "@/lib/url"

type Db = SupabaseClient<Database>
export type SetupFail = { error: string; db?: { code?: string; message: string } }

// Only the hash is stored, so a link can't be shown again, only replaced by a fresh one.
export function newInviteToken() {
  const token = randomBytes(32).toString("base64url")
  return { link: `${APP_URL}/invite/${token}`, token_hash: createHash("sha256").update(token).digest("hex") }
}

/** Invite someone by email with a role: one open invite per email (a new one replaces the link), mailed if possible. */
export async function inviteMember(db: Db, org: { id: string; name: string }, input: { email: string; roleId: string }, t: T): Promise<SetupFail | { link: string; email: string; mailFailed: boolean }> {
  const email = input.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "members.invalidEmail" }
  const { link, token_hash } = newInviteToken()
  await db.from("invites").delete().eq("org_id", org.id).eq("email", email).is("accepted_at", null)
  const { error } = await db.from("invites").insert({ org_id: org.id, email, role_id: input.roleId, token_hash })
  if (error) return error.code === "42501" ? { error: "members.cantInviteRole" } : { error: "db", db: error }
  const text = [t("invite.mailIntro", { org: org.name }), "", link, "", t("invite.mailNote")].join("\n")
  const sent = await sendPlatformEmail({ to: email, subject: t("invite.mailSubject", { org: org.name }), text, html: text.split("\n").map((l) => (l === link ? `<p><a href="${link}">${link}</a></p>` : `<p>${l.replace(/[<>&]/g, "")}</p>`)).join("") }).catch(() => false)
  return { link, email, mailFailed: !sent }
}

export type FieldInput = { label: string; options?: string[]; required?: boolean }
const clean = (f: FieldInput) => ({
  label: f.label.trim().slice(0, 100),
  options: [...new Set((f.options ?? []).map((o) => o.trim().slice(0, 100)).filter(Boolean))].slice(0, 100),
  required: !!f.required,
})

/** New custom field at the end of its entity's list; key derived from the label (fixed afterwards). */
export async function createField(db: Db, orgId: string, input: FieldInput & { entity: string; type: string }): Promise<SetupFail | { id: string }> {
  const f = clean(input)
  if (!(input.entity in CUSTOM_ENTITIES) || !FIELD_TYPES.includes(input.type as never) || !f.label) return { error: "errors.invalid_input" }
  if (input.type === "select" && !f.options.length) return { error: "errors.options_required" }
  const { count } = await db.from("custom_fields").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("entity", input.entity)
  const { data, error } = await db
    .from("custom_fields")
    .insert({ org_id: orgId, entity: input.entity as CustomEntity, type: input.type, key: fieldKey(f.label), label: f.label, options: input.type === "select" ? f.options : [], required: f.required, position: count ?? 0 })
    .select("id")
    .single()
  if (error) return error.code === "23505" ? { error: "errors.field_exists" } : { error: "db", db: error }
  return { id: data.id }
}

/** Key and type stay fixed (stored values depend on them); label, options and required can change. */
export async function updateField(db: Db, orgId: string, id: string, input: FieldInput): Promise<SetupFail | { id: string }> {
  const f = clean(input)
  if (!f.label) return { error: "errors.invalid_input" }
  const { data: old } = await db.from("custom_fields").select("type").eq("id", id).eq("org_id", orgId).maybeSingle()
  if (!old) return { error: "errors.not_allowed" }
  if (old.type === "select" && !f.options.length) return { error: "errors.options_required" }
  const { error } = await db.from("custom_fields").update({ label: f.label, required: f.required, ...(old.type === "select" ? { options: f.options } : {}) }).eq("id", id).eq("org_id", orgId)
  return error ? { error: "db", db: error } : { id }
}
