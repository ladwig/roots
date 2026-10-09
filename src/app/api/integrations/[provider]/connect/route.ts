import { randomBytes } from "node:crypto"
import { NextResponse } from "next/server"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { APP_URL } from "@/lib/url"
import { getIntegration } from "@/integrations/registry"

// Start of a redirect connection (OAuth / hosted onboarding): remember state + org in a short-lived cookie,
// let the provider prepare (e.g. create the Stripe account), then send the user there.
export async function GET(_: Request, { params }: RouteContext<"/api/integrations/[provider]/connect">) {
  const { provider } = await params
  const integration = getIntegration(provider)
  const ctx = await getContext()
  if (!integration?.connect || !ctx.can("org.integrations.manage")) return new NextResponse("Not found", { status: 404 })
  const t = await getT()

  const state = randomBytes(24).toString("base64url")
  const callbackUrl = `${APP_URL}/api/integrations/${provider}/callback?state=${state}`
  const { data: row } = await ctx.supabase.from("org_integrations").select("config").eq("org_id", ctx.org.id).eq("provider", provider).maybeSingle()
  try {
    const { url, connection } = await integration.connect.start({
      orgName: ctx.org.name,
      email: ctx.email,
      callbackUrl,
      existing: row?.config as Record<string, string> | undefined,
    })
    if (connection) {
      const { error } = await ctx.supabase.rpc("save_integration", {
        p_org: ctx.org.id,
        p_provider: provider,
        p_config: connection.config,
        p_secret: connection.secret ? JSON.stringify(connection.secret) : undefined,
        p_status: connection.status ?? "connected",
      })
      if (error) throw error
    }
    const res = NextResponse.redirect(url)
    res.cookies.set("connect_state", `${state}:${provider}:${ctx.org.id}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: APP_URL.startsWith("https"),
      maxAge: 60 * 60, // onboarding can take a while
      path: "/api/integrations",
    })
    return res
  } catch (e) {
    console.error(e)
    const key = e instanceof Error ? e.message : ""
    const error = t.has(key) ? t.dynamic(key) : t("integrations.connectFailed")
    return NextResponse.redirect(`${APP_URL}/settings/integrations?${new URLSearchParams({ error })}`)
  }
}
