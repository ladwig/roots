import { randomBytes } from "node:crypto"
import { NextResponse } from "next/server"
import { getContext } from "@/lib/context"
import { APP_URL } from "@/lib/url"
import { getIntegration } from "@/integrations/registry"

// Start of the shared OAuth flow: remember state + org in a short-lived cookie, then go to the provider.
export async function GET(_: Request, { params }: RouteContext<"/api/integrations/[provider]/connect">) {
  const { provider } = await params
  const integration = getIntegration(provider)
  const ctx = await getContext()
  if (!integration?.oauth || !ctx.can("org.integrations.manage")) return new NextResponse("Not found", { status: 404 })

  const state = randomBytes(24).toString("base64url")
  const res = NextResponse.redirect(
    integration.oauth.authorizeUrl(state, `${APP_URL}/api/integrations/${provider}/callback`)
  )
  res.cookies.set("oauth_state", `${state}:${provider}:${ctx.org.id}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: APP_URL.startsWith("https"),
    maxAge: 600,
    path: "/api/integrations",
  })
  return res
}
