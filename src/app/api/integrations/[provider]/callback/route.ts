import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { getSession } from "@/lib/context"
import { createClient } from "@/lib/supabase/server"
import { APP_URL } from "@/lib/url"
import { getIntegration } from "@/integrations/registry"

// The provider sends the user back here. Check state (CSRF), let the provider finish, store the result
// (save_integration checks the user's permission in the database).
export async function GET(request: Request, { params }: RouteContext<"/api/integrations/[provider]/callback">) {
  const { provider } = await params
  const url = new URL(request.url)
  const t = await getT()
  const done = (result: Record<string, string>) =>
    NextResponse.redirect(`${APP_URL}/settings/integrations?${new URLSearchParams(result)}`)

  const jar = await cookies()
  const [state, cookieProvider, orgId] = (jar.get("connect_state")?.value ?? "").split(":")
  const integration = getIntegration(provider)
  const session = await getSession()
  if (!integration?.connect || !session || !state || state !== url.searchParams.get("state") || cookieProvider !== provider)
    return done({ error: t("integrations.connectFailed") })
  jar.delete({ name: "connect_state", path: "/api/integrations" })

  const db = await createClient(orgId)
  const { data: row } = await db.from("org_integrations").select("config").eq("org_id", orgId).eq("provider", provider).maybeSingle()
  try {
    const conn = await integration.connect.finish({
      params: url.searchParams,
      callbackUrl: `${APP_URL}/api/integrations/${provider}/callback`,
      existing: row?.config as Record<string, unknown> | undefined,
    })
    const { error } = await db.rpc("save_integration", {
      p_org: orgId,
      p_provider: provider,
      p_config: conn.config as never,
      p_secret: conn.secret ? JSON.stringify(conn.secret) : undefined,
      p_expires_at: conn.expiresAt,
      p_status: conn.status ?? "connected",
    })
    if (error) return done({ error: dbError(t, error) })
    return conn.status === "pending"
      ? done({ error: t("integrations.pendingHint", { name: integration.name }) })
      : done({ ok: t("integrations.connected", { name: integration.name }) })
  } catch (e) {
    console.error(e)
    const key = e instanceof Error ? e.message : ""
    return done({ error: t.has(key) ? t.dynamic(key) : t("integrations.connectFailed") })
  }
}
