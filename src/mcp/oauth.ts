// MCP sign-in via Supabase Auth's OAuth 2.1 server: Claude gets a normal Supabase access token (JWT with client_id).
// We accept it only for a connection the person approved on /oauth/consent (mcp_connections: org + access level);
// rights = the person's current role in that org ('read' keeps only *.view). Deleting the row cuts it off at once.
import { ApiError, type Auth } from "@/api/core"
import { modules as MODULES } from "@/modules/registry"
import { createAdminClient } from "@/lib/supabase/admin"

const VIEW_PERMS = MODULES.flatMap((m) => m.permissions).filter((p) => p.endsWith(".view"))
const claimsOf = (jwt: string) => {
  try {
    return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()) as { sub?: string; client_id?: string }
  } catch {
    return {}
  }
}

export async function authenticateOAuth(token: string): Promise<Auth> {
  const db = createAdminClient()
  // getUser verifies the token with Supabase Auth (signature, expiry, not signed out).
  const { data: user } = await db.auth.getUser(token)
  const claims = claimsOf(token)
  if (!user.user || claims.sub !== user.user.id || !claims.client_id) throw new ApiError(401, "unauthorized", "Sign in again (expired or not an OAuth token).")
  const { data: conn } = await db.from("mcp_connections").select("id, org_id, access, user_id").eq("user_id", user.user.id).eq("client_id", claims.client_id).maybeSingle()
  if (!conn) throw new ApiError(401, "unauthorized", "This connection was removed. Connect roots again.")
  return { ...(await connectionAuth(conn)), token }
}

/** Live rights of an approved connection (also used by upload links, which carry no token). */
export async function connectionAuth(conn: { id: string; org_id: string; access: string; user_id: string }): Promise<Auth> {
  const db = createAdminClient()
  const [{ data: member }, { data: mods }, { data: org }] = await Promise.all([
    db.from("org_members").select("roles(is_owner, permissions)").eq("org_id", conn.org_id).eq("user_id", conn.user_id).maybeSingle(),
    db.from("org_modules").select("module_key").eq("org_id", conn.org_id),
    db.from("orgs").select("allow_ai").eq("id", conn.org_id).maybeSingle(),
    db.from("mcp_connections").update({ last_used_at: new Date().toISOString() }).eq("id", conn.id),
  ])
  if (!member?.roles) throw new ApiError(403, "forbidden", "You're no longer a member of this organisation.")
  if (org?.allow_ai === false) throw new ApiError(403, "ai_disabled", "This organisation has switched off AI connections (Settings → API).")
  const all = member.roles.is_owner ? ["*"] : member.roles.permissions
  const permissions = conn.access === "read" ? (all.includes("*") ? VIEW_PERMS : all.map((p) => p.replace(/\.\*$/, ".view")).filter((p) => p.endsWith(".view"))) : all
  return { key_id: `oauth:${conn.id}`, org_id: conn.org_id, permissions, modules: (mods ?? []).map((m) => m.module_key) }
}
