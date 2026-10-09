import type Stripe from "stripe"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { markExpired, markFailed, markPaid, markRefunded } from "@/payments/server"
import type { Integration } from "./registry"

// Stripe Connect. Two ways for an org to link Stripe:
// - "existing": Connect OAuth. The org signs in to its own Stripe account and authorises roots (keeps its
//   account, history and payouts). Needs STRIPE_CLIENT_ID and the callback URL registered under Connect → OAuth.
// - "new": Accounts v2 with Stripe-hosted onboarding (full Stripe Dashboard, Stripe's recommended path).
// Both end as a connected account we charge on directly (org = merchant of record, roots takes an application fee).
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

export const stripeIntegration: Integration = {
  key: "stripe",
  name: "Stripe",
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
      let accountId = existing?.via === "onboarding" ? existing.accountId : undefined
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
      const accountId = existing?.accountId
      if (!accountId) throw new Error("integrations.connectFailed")
      return { config: { accountId, via: existing.via ?? "onboarding" }, status: (await stripeAccountReady(accountId)) ? "connected" : "pending" }
    },
  },

  // Linked via OAuth: revoke roots' access at Stripe. Accounts created via onboarding stay with the org.
  async disconnect(config) {
    if (config.via === "oauth" && config.accountId && process.env.STRIPE_CLIENT_ID)
      await stripe().oauth.deauthorize({ client_id: process.env.STRIPE_CLIENT_ID, stripe_user_id: config.accountId })
  },

  webhook: {
    // One Connect webhook endpoint (events on connected accounts), signed with STRIPE_WEBHOOK_SECRET.
    async verify(req, body) {
      const event = stripe().webhooks.constructEvent(body, req.headers.get("stripe-signature") ?? "", process.env.STRIPE_WEBHOOK_SECRET ?? "")
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
