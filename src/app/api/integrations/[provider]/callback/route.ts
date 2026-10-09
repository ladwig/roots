import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { getSession } from "@/lib/context"
import { APP_URL } from "@/lib/url"
import { getIntegration } from "@/integrations/registry"

// Provider redirects back here. Check state, exchange the code, store the tokens (save_integration checks permissions).
export async function GET(request: Request, { params }: RouteContext<"/api/integrations/[provider]/callback">) {
  const { provider } = await params
  const url = new URL(request.url)
  const done = (result: Record<string, string>) =>
    NextResponse.redirect(`${APP_URL}/settings/integrations?${new URLSearchParams(result)}`)

  const jar = await cookies()
  const [state, cookieProvider, orgId] = (jar.get("oauth_state")?.value ?? "").split(":")
  jar.delete({ name: "oauth_state", path: "/api/integrations" })
  const integration = getIntegration(provider)
  const session = await getSession()
  const code = url.searchParams.get("code")

  if (!integration?.oauth || !session || !code || !state || state !== url.searchParams.get("state") || cookieProvider !== provider)
    return done({ error: "The connection could not be completed. Please try again." })

  try {
    const conn = await integration.oauth.exchange(code, `${APP_URL}/api/integrations/${provider}/callback`)
    const { error } = await session.supabase.rpc("save_integration", {
      p_org: orgId,
      p_provider: provider,
      p_config: conn.config,
      p_secret: conn.secret ? JSON.stringify(conn.secret) : undefined,
      p_expires_at: conn.expiresAt,
    })
    if (error) throw error
  } catch (e) {
    return done({ error: e instanceof Error ? e.message : "The connection failed." })
  }
  return done({ ok: `${integration.name} connected.` })
}
