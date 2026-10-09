import { randomBytes } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { stripeAccountReady } from "@/integrations/stripe"
import type { PaymentProvider } from "../provider"

async function accountId(orgId: string) {
  const { data } = await createAdminClient()
    .from("org_integrations")
    .select("config")
    .eq("org_id", orgId)
    .eq("provider", "stripe")
    .maybeSingle()
  const id = (data?.config as Record<string, string> | undefined)?.accountId
  if (!id) throw new Error("payments.notConnected")
  return id
}

const letters = () => Array.from(randomBytes(8), (b) => String.fromCharCode(97 + (b % 26))).join("")

// Direct charges on the org's connected account via Stripe Checkout (hosted page).
export const stripeProvider: PaymentProvider = {
  key: "stripe",
  async ready(orgId) {
    try {
      return await stripeAccountReady(await accountId(orgId))
    } catch {
      return false
    }
  },
  async createCheckout(o) {
    const session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        line_items: o.items.map((i) => ({
          quantity: i.quantity,
          price_data: { currency: o.currency, unit_amount: i.unitAmount, product_data: { name: i.description } },
        })),
        payment_intent_data: { application_fee_amount: o.applicationFee || undefined, metadata: { order_id: o.orderId } },
        customer_email: o.customerEmail ?? undefined,
        client_reference_id: o.orderId,
        metadata: { order_id: o.orderId, org_id: o.orgId },
        success_url: o.successUrl,
        cancel_url: o.cancelUrl,
        expires_at: Math.floor(o.expiresAt.getTime() / 1000),
        integration_identifier: `roots_checkout_${letters()}`,
      },
      { stripeAccount: await accountId(o.orgId), idempotencyKey: `checkout_${o.orderId}` }
    )
    return { url: session.url!, providerRef: session.id }
  },
  async refund({ orgId, providerPaymentRef, amount, idempotencyKey }) {
    const refund = await stripe().refunds.create(
      { payment_intent: providerPaymentRef, amount, refund_application_fee: true },
      { stripeAccount: await accountId(orgId), idempotencyKey }
    )
    return {
      providerRef: refund.id,
      status: refund.status === "succeeded" ? "succeeded" : refund.status === "failed" ? "failed" : "pending",
    }
  },
}
