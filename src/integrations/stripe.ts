import type Stripe from "stripe"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { markExpired, markFailed, markPaid, markRefunded } from "@/payments/server"
import type { Integration } from "./registry"

// Stripe Connect, SaaS setup (Stripe's recommendation for platforms like ours):
// Accounts v2 with the full Stripe Dashboard, Stripe-hosted onboarding, direct charges.
// The org is merchant of record and pays Stripe's fees; roots takes an application fee.
const ACCOUNT = {
  dashboard: "full",
  defaults: { responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
  configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
} as const

export async function stripeAccountReady(accountId: string) {
  const account = await stripe().v2.core.accounts.retrieve(accountId, { include: ["configuration.merchant"] })
  return account.configuration?.merchant?.capabilities?.card_payments?.status === "active"
}

export const stripeIntegration: Integration = {
  key: "stripe",
  name: "Stripe",
  connect: {
    async start({ orgName, email, callbackUrl, existing }) {
      let accountId = existing?.accountId
      if (!accountId) {
        const account = await stripe().v2.core.accounts.create({
          ...ACCOUNT,
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
            refresh_url: callbackUrl.replace(/\/callback\?.*$/, "/connect"),
            return_url: callbackUrl,
          },
        },
      })
      return { url: link.url, connection: { config: { accountId }, status: "pending" } }
    },
    async finish({ existing }) {
      const accountId = existing?.accountId
      if (!accountId) throw new Error("integrations.connectFailed")
      return { config: { accountId }, status: (await stripeAccountReady(accountId)) ? "connected" : "pending" }
    },
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
      }
      // ponytail: onboarding status is re-checked on return from Stripe and before every checkout;
      // add v2 account capability events (event destinations) if orgs need live status updates.
    },
  },
}
