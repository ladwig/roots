"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

// Consent for an AI connector (Claude via MCP): the person picks the org and access level; we store that as their
// connection, then let Supabase Auth issue the code. Client id/name are re-read from Supabase, not from the form.
export async function decide(fd: FormData) {
  const supabase = await createClient()
  const id = String(fd.get("authorization_id") ?? "")
  const back = `/oauth/consent?authorization_id=${encodeURIComponent(id)}`
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims) redirect(`/login?next=${encodeURIComponent(back)}`)
  if (fd.get("decision") !== "approve") {
    const { data } = await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true })
    redirect(data?.redirect_url ?? "/")
  }
  const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(id)
  if (error || !details) redirect(`${back}&error=1`)
  if ("authorization_id" in details) {
    const org = String(fd.get("org_id") ?? "")
    const access = fd.get("access") === "read" ? "read" : "me"
    // RLS: only for oneself and only in orgs one belongs to.
    const { error: saveError } = await supabase
      .from("mcp_connections")
      .upsert({ user_id: claims.claims.sub, org_id: org, client_id: details.client.id, client_name: details.client.name.slice(0, 200), access }, { onConflict: "user_id,client_id" })
    if (saveError) redirect(`${back}&error=1`)
  }
  const { data } = await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
  redirect(data?.redirect_url ?? `${back}&error=1`)
}
