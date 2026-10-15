"use server"

import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { createClient } from "@/lib/supabase/server"
import { back } from "@/lib/url"

/** Disconnect an AI app: delete the connection (RLS: own, or org.integrations.manage) and, for one's own, the grant. */
export async function disconnectApp(fd: FormData) {
  const t = await getT()
  const supabase = await createClient()
  const to = String(fd.get("back") ?? "/settings/profile")
  const path = to.startsWith("/settings/") ? to : "/settings/profile"
  const { data: claims } = await supabase.auth.getClaims()
  const { data: row, error } = await supabase.from("mcp_connections").delete().eq("id", String(fd.get("id") ?? "")).select("user_id, client_id").maybeSingle()
  if (error || !row) back(path, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  // Own connection: also revoke the consent at Supabase Auth, so the app has to ask again (best effort).
  if (row.user_id === claims?.claims?.sub) await supabase.auth.oauth.revokeGrant({ clientId: row.client_id }).catch(() => null)
  back(path, { ok: t("settings.disconnected") })
}
