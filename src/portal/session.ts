// Customer portal sessions: magic link → one-time login token → session cookie for one org (30 days).
// Tokens are stored as SHA-256 hashes in portal_tokens (service role only). Every portal read/write must go
// through getPortalContact() and filter by the contact it returns.
import { createHash, randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"

const SESSION_DAYS = 30
const LOGIN_MINUTES = 30
const hash = (token: string) => createHash("sha256").update(token).digest("hex")
const newToken = () => randomBytes(32).toString("base64url")
const cookieName = (orgId: string) => `rp_${orgId.replace(/-/g, "").slice(0, 16)}`

/** Login link token for the live contact with this email, or null (the caller answers the same either way). */
export async function createLoginToken(orgId: string, email: string) {
  const db = createAdminClient()
  const { data: contact } = await db.from("contacts").select("id, first_name").eq("org_id", orgId).eq("email", email.trim().toLowerCase()).is("deleted_at", null).maybeSingle()
  if (!contact) return null
  const token = newToken()
  const { error } = await db.from("portal_tokens").insert({
    org_id: orgId,
    contact_id: contact.id,
    token_hash: hash(token),
    kind: "login",
    expires_at: new Date(Date.now() + LOGIN_MINUTES * 60_000).toISOString(),
  })
  if (error) throw error
  return { token, firstName: contact.first_name }
}

/** Trade a login token for a session cookie. False if the link is unknown, used or expired. */
export async function signIn(orgId: string, token: string) {
  const db = createAdminClient()
  const { data: login } = await db
    .from("portal_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", hash(token))
    .eq("org_id", orgId)
    .eq("kind", "login")
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("contact_id")
    .maybeSingle()
  if (!login) return false
  const session = newToken()
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000)
  await db.from("portal_tokens").insert({ org_id: orgId, contact_id: login.contact_id, token_hash: hash(session), kind: "session", expires_at: expires.toISOString() })
  ;(await cookies()).set(cookieName(orgId), session, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires })
  return true
}

/** The signed-in contact of this org's portal, or null. */
export async function getPortalContact(orgId: string) {
  const token = (await cookies()).get(cookieName(orgId))?.value
  if (!token) return null
  const db = createAdminClient()
  const { data } = await db
    .from("portal_tokens")
    .select("id, contact_id, last_seen_at, contacts(id, first_name, last_name, company, email, phone, street, postal_code, city, deleted_at)")
    .eq("token_hash", hash(token))
    .eq("org_id", orgId)
    .eq("kind", "session")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()
  if (!data?.contacts || data.contacts.deleted_at) return null
  if (!data.last_seen_at || Date.now() - new Date(data.last_seen_at).getTime() > 3_600_000)
    await db.from("portal_tokens").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id)
  return { sessionId: data.id, contact: data.contacts }
}

export async function signOut(orgId: string) {
  const jar = await cookies()
  const token = jar.get(cookieName(orgId))?.value
  if (token) await createAdminClient().from("portal_tokens").delete().eq("token_hash", hash(token)).eq("org_id", orgId)
  jar.delete(cookieName(orgId))
}
