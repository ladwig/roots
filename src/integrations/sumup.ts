import { createAdminClient } from "@/lib/supabase/admin"
import { APP_URL } from "@/lib/url"
import { markExpired, markFailed, markPaid } from "@/payments/server"
import type { Integration } from "./registry"
import { getSecret } from "./server"

// SumUp via OAuth (authorization code). Register an OAuth app at SumUp with the redirect URI
// <APP_URL>/api/integrations/sumup/callback and put its client id/secret in SUMUP_CLIENT_ID / SUMUP_CLIENT_SECRET.
// Taking payments needs the `payments` scope, which SumUp grants after a manual check of the app.
const API = "https://api.sumup.com"
const SCOPES = ["user.profile_readonly", "transactions.history", "payments"]

type Tokens = { access_token: string; refresh_token: string; expires_at: string }

async function tokenRequest(params: Record<string, string>): Promise<Tokens & { scope?: string }> {
  const res = await fetch(`${API}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, client_id: process.env.SUMUP_CLIENT_ID ?? "", client_secret: process.env.SUMUP_CLIENT_SECRET ?? "" }),
    signal: AbortSignal.timeout(10_000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.access_token) throw new Error(json.error === "invalid_grant" ? "integrations.sumup.reconnect" : "integrations.connectFailed")
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? params.refresh_token,
    expires_at: new Date(Date.now() + (Number(json.expires_in) || 3600) * 1000).toISOString(),
    scope: json.scope,
  }
}

/** A valid access token for the org's SumUp account; refreshes and stores it when it's about to expire. */
export async function sumupToken(orgId: string) {
  const secret = (await getSecret(orgId, "sumup")) as Tokens | null
  if (!secret?.refresh_token) throw new Error("payments.notConnected")
  if (new Date(secret.expires_at).getTime() > Date.now() + 60_000) return secret.access_token
  const fresh = await tokenRequest({ grant_type: "refresh_token", refresh_token: secret.refresh_token })
  const db = createAdminClient()
  const { data: row } = await db.from("org_integrations").select("config").eq("org_id", orgId).eq("provider", "sumup").single()
  await db.rpc("save_integration", {
    p_org: orgId,
    p_provider: "sumup",
    p_config: row?.config ?? {},
    p_secret: JSON.stringify({ access_token: fresh.access_token, refresh_token: fresh.refresh_token, expires_at: fresh.expires_at }),
  })
  return fresh.access_token
}

export async function sumup<T = unknown>(orgId: string, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: { authorization: `Bearer ${await sumupToken(orgId)}`, "content-type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`SumUp ${path}: HTTP ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300))
  return (res.status === 204 ? null : await res.json()) as T
}

export type SumUpCheckout = { id: string; status: "PENDING" | "PAID" | "FAILED" | "EXPIRED"; transaction_id?: string; hosted_checkout_url?: string }

export const sumupIntegration: Integration = {
  key: "sumup",
  name: "SumUp",
  connect: {
    async start({ state, callbackUrl }) {
      if (!process.env.SUMUP_CLIENT_ID || !process.env.SUMUP_CLIENT_SECRET) throw new Error("integrations.sumup.notConfigured")
      const url = new URL(`${API}/authorize`)
      url.search = new URLSearchParams({ response_type: "code", client_id: process.env.SUMUP_CLIENT_ID, redirect_uri: callbackUrl, scope: SCOPES.join(" "), state }).toString()
      return { url: url.toString() }
    },
    async finish({ params, callbackUrl }) {
      if (params.has("error")) throw new Error("integrations.sumup.denied")
      const tokens = await tokenRequest({ grant_type: "authorization_code", code: params.get("code") ?? "", redirect_uri: callbackUrl })
      // ponytail: /v0.1/me is SumUp's long-standing "who am I" endpoint; the newer /v1/merchants/{code} needs the code first.
      const me = await fetch(`${API}/v0.1/me`, { headers: { authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(10_000) })
        .then((r) => r.json())
        .catch(() => ({}))
      const profile = me?.merchant_profile ?? {}
      const scopes = (tokens.scope ?? "").split(/\s+/).filter(Boolean)
      return {
        config: {
          merchant_code: profile.merchant_code ?? "",
          merchant_name: profile.company_name ?? profile.doing_business_as?.business_name ?? "",
          scopes,
          can_take_payments: scopes.includes("payments"),
        },
        secret: { access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at: tokens.expires_at },
      }
    },
  },
  // SumUp webhooks are unsigned: we only take the checkout id from them and ask SumUp for the real status.
  webhook: {
    async verify(req, body) {
      const orgId = new URL(req.url).searchParams.get("org") ?? ""
      const event = JSON.parse(body) as { event_type?: string; id?: string }
      if (!/^[0-9a-f-]{36}$/.test(orgId) || event.event_type !== "CHECKOUT_STATUS_CHANGED" || !event.id) throw new Error("ignored")
      const checkout = await sumup<SumUpCheckout>(orgId, `/v0.1/checkouts/${encodeURIComponent(event.id)}`)
      return { externalId: `${checkout.id}:${checkout.status}`, type: checkout.status, orgId, payload: checkout }
    },
    async handle({ payload }) {
      const c = payload as SumUpCheckout
      if (c.status === "PAID") return markPaid("sumup", c.id, c.transaction_id)
      if (c.status === "FAILED") return markFailed("sumup", c.id)
      if (c.status === "EXPIRED") return markExpired("sumup", c.id)
    },
  },
}

export const sumupWebhookUrl = (orgId: string) => `${APP_URL}/api/webhooks/sumup?org=${orgId}`
