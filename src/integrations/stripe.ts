import Stripe from "stripe"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe, STRIPE_API_VERSION } from "@/lib/stripe"
import { APP_URL } from "@/lib/url"
import { markExpired, markFailed, markPaid, markRefunded } from "@/payments/server"
import type { Integration } from "./registry"
import { getSecret } from "./server"

// Stripe Connect. Two ways for an org to link Stripe:
// - "existing": Connect OAuth. The org signs in to its own Stripe account and authorises roots (keeps its
//   account, history and payouts). Needs STRIPE_CLIENT_ID and the callback URL registered under Connect → OAuth.
// - "new": Accounts v2 with Stripe-hosted onboarding (full Stripe Dashboard, Stripe's recommended path).
// Both end as a connected account we charge on directly (org = merchant of record, roots takes an application fee).
// Third way, "key" (bring your own key): the org pastes a restricted/secret key of its own Stripe account. We call
// Stripe with that key (no Connect, so no application fee) and register a webhook endpoint on their account.
const NEW_ACCOUNT = {
  dashboard: "full",
  defaults: { responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
  configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
} as const

/** Can this connected account take card payments right now? */
export async function stripeAccountReady(accountId: string) {
  try {
    const account = await stripe().v2.core.accounts.retrieve(accountId, { include: ["configuration.merchant"] })
    return account.configuration?.merchant?.capabilities?.card_payments?.status === "active"
  } catch {
    // Accounts linked via OAuth may not be readable through v2: fall back to the v1 capability.
    const account = await stripe().accounts.retrieve(accountId)
    return account.capabilities?.card_payments === "active"
  }
}

const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
]
const keyClient = (key: string) => new Stripe(key, { apiVersion: STRIPE_API_VERSION })

/** How to talk to Stripe for an org: its own key ("key") or the platform key on its connected account. */
export async function stripeFor(orgId: string) {
  const { data } = await createAdminClient().from("org_integrations").select("config").eq("org_id", orgId).eq("provider", "stripe").maybeSingle()
  const config = (data?.config ?? {}) as Record<string, string>
  if (config.via === "key") {
    const key = (await getSecret(orgId, "stripe"))?.secretKey
    if (!key) throw new Error("payments.notConnected")
    return { client: keyClient(key), options: {} as Stripe.RequestOptions, direct: true, test: key.includes("_test_") }
  }
  if (!config.accountId) throw new Error("payments.notConnected")
  return { client: stripe(), options: { stripeAccount: config.accountId } as Stripe.RequestOptions, direct: false, test: false }
}

export const stripeIntegration: Integration = {
  key: "stripe",
  name: "Stripe",
  // Bring your own key (shown next to the connect buttons).
  fields: [{ key: "secretKey", secret: true, placeholder: "rk_live_…" }],
  async test(secret) {
    const key = secret.secretKey ?? ""
    if (!/^(rk|sk)_(live|test)_[A-Za-z0-9]+$/.test(key)) throw new Error("integrations.stripe.invalidKey")
    // Check exactly what we use (Checkout Sessions, Refunds, Webhook Endpoints). Account details are optional
    // (restricted keys often lack "Accounts read"); without them we just don't show the account name.
    const client = keyClient(key)
    try {
      await Promise.all([client.checkout.sessions.list({ limit: 1 }), client.refunds.list({ limit: 1 }), client.webhookEndpoints.list({ limit: 1 })])
    } catch {
      throw new Error("integrations.stripe.keyNoAccess")
    }
    const account = await client.accounts.retrieveCurrent().catch(() => null)
    return { via: "key", accountId: account?.id ?? null, livemode: key.includes("_live_"), name: account?.settings?.dashboard?.display_name ?? null }
  },
  // Register (or replace) our webhook endpoint on the org's account and keep its signing secret with the key.
  // Locally (no https) Stripe can't reach us: use `stripe listen --forward-to localhost:3000/api/webhooks/stripe?org=<id>`.
  async onConnected({ orgId, config, secret }) {
    if (!APP_URL.startsWith("https://")) return
    const client = keyClient(secret.secretKey)
    if (config.webhookEndpointId) await client.webhookEndpoints.del(String(config.webhookEndpointId)).catch(() => {})
    const endpoint = await client.webhookEndpoints.create({
      url: `${APP_URL}/api/webhooks/stripe?org=${orgId}`,
      enabled_events: WEBHOOK_EVENTS,
      description: "roots",
    })
    const { error } = await createAdminClient().rpc("save_integration", {
      p_org: orgId,
      p_provider: "stripe",
      p_config: { ...config, webhookEndpointId: endpoint.id } as never,
      p_secret: JSON.stringify({ secretKey: secret.secretKey, webhookSecret: endpoint.secret }),
    })
    if (error) throw error
  },
  connect: {
    modes: ["existing", "new"],
    async start({ mode, state, orgName, email, callbackUrl, existing }) {
      if (mode === "existing") {
        const clientId = process.env.STRIPE_CLIENT_ID
        if (!clientId) throw new Error("integrations.stripe.oauthNotConfigured")
        const url = stripe().oauth.authorizeUrl({
          response_type: "code",
          client_id: clientId,
          scope: "read_write",
          redirect_uri: callbackUrl,
          state,
          stripe_user: { email, business_name: orgName, country: "DE" },
        })
        return { url }
      }

      // "new" (also used to continue an unfinished onboarding)
      let accountId = existing?.via === "onboarding" ? (existing.accountId as string) : undefined
      if (!accountId) {
        const account = await stripe().v2.core.accounts.create({
          ...NEW_ACCOUNT,
          display_name: orgName,
          contact_email: email,
          identity: { country: "de" },
        })
        accountId = account.id
      }
      // An expired link sends the org to refresh_url: our connect route, which makes a fresh link.
      const link = await stripe().v2.core.accountLinks.create({
        account: accountId,
        use_case: {
          type: "account_onboarding",
          account_onboarding: {
            configurations: ["merchant"],
            refresh_url: callbackUrl.replace(/\/callback$/, "/connect?mode=new"),
            return_url: `${callbackUrl}?state=${state}`,
          },
        },
      })
      return { url: link.url, connection: { config: { accountId, via: "onboarding" }, status: "pending" } }
    },

    async finish({ params, existing }) {
      if (params.has("error")) throw new Error("integrations.stripe.oauthDenied") // org cancelled at Stripe
      const code = params.get("code")
      if (code) {
        const token = await stripe().oauth.token({ grant_type: "authorization_code", code })
        const accountId = token.stripe_user_id
        if (!accountId) throw new Error("integrations.connectFailed")
        return { config: { accountId, via: "oauth" }, status: (await stripeAccountReady(accountId)) ? "connected" : "pending" }
      }
      const accountId = existing?.accountId as string | undefined
      if (!accountId) throw new Error("integrations.connectFailed")
      return { config: { accountId, via: existing?.via ?? "onboarding" }, status: (await stripeAccountReady(accountId)) ? "connected" : "pending" }
    },
  },

  // Linked via OAuth: revoke roots' access at Stripe. Own key: remove our webhook endpoint.
  // Accounts created via onboarding stay with the org.
  async disconnect({ config, secret }) {
    if (config.via === "key" && config.webhookEndpointId && secret?.secretKey)
      await keyClient(secret.secretKey).webhookEndpoints.del(String(config.webhookEndpointId))
    if (config.via === "oauth" && config.accountId && process.env.STRIPE_CLIENT_ID)
      await stripe().oauth.deauthorize({ client_id: process.env.STRIPE_CLIENT_ID, stripe_user_id: String(config.accountId) })
  },

  webhook: {
    // Connect: one endpoint for all connected accounts, signed with STRIPE_WEBHOOK_SECRET.
    // Own key: one endpoint per org (?org=<id>), signed with that endpoint's secret (or the platform one when
    // forwarded locally by `stripe listen`).
    async verify(req, body) {
      const sig = req.headers.get("stripe-signature") ?? ""
      const org = new URL(req.url).searchParams.get("org")
      if (org) {
        if (!/^[0-9a-f-]{36}$/.test(org)) throw new Error("invalid org")
        const own = (await getSecret(org, "stripe"))?.webhookSecret
        let event: Stripe.Event | undefined
        for (const secret of [own, process.env.STRIPE_WEBHOOK_SECRET].filter((s): s is string => !!s)) {
          try {
            event = stripe().webhooks.constructEvent(body, sig, secret)
            break
          } catch {}
        }
        if (!event) throw new Error("invalid signature")
        return { externalId: `${org}:${event.id}`, type: event.type, orgId: org, payload: event }
      }
      const event = stripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET ?? "")
      let orgId: string | undefined
      if (event.account) {
        const { data } = await createAdminClient()
          .from("org_integrations")
          .select("org_id")
          .eq("provider", "stripe")
          .eq("config->>accountId", event.account)
          .maybeSingle()
        orgId = data?.org_id
      }
      return { externalId: event.id, type: event.type, orgId, payload: event }
    },
    async handle({ payload }) {
      const event = payload as Stripe.Event
      switch (event.type) {
        // Fulfil only when money is actually in: async methods (SEPA, …) complete as "unpaid" first.
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded": {
          const session = event.data.object
          if (session.payment_status !== "unpaid")
            await markPaid("stripe", session.id, typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id)
          return
        }
        case "checkout.session.async_payment_failed":
          return markFailed("stripe", event.data.object.id)
        case "checkout.session.expired":
          return markExpired("stripe", event.data.object.id)
        case "charge.refunded": {
          // Covers refunds made in the Stripe Dashboard as well as ours.
          const charge = event.data.object
          const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id
          if (pi) await markRefunded("stripe", pi, charge.amount_refunded)
          return
        }
        case "account.application.deauthorized": {
          // The org removed roots in its Stripe Dashboard.
          if (event.account)
            await createAdminClient()
              .from("org_integrations")
              .update({ status: "revoked", last_error: null })
              .eq("provider", "stripe")
              .eq("config->>accountId", event.account)
          return
        }
      }
      // ponytail: onboarding status is re-checked on return from Stripe and before every checkout;
      // add v2 account capability events (event destinations) if orgs need live status updates.
    },
  },
}
