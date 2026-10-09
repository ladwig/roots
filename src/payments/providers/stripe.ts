import { randomBytes } from "node:crypto"
import { stripeAccountReady, stripeFor } from "@/integrations/stripe"
import type { PaymentProvider } from "../provider"

const letters = () => Array.from(randomBytes(8), (b) => String.fromCharCode(97 + (b % 26))).join("")

// Stripe Checkout (hosted page): direct charges on the org's connected account (roots takes an application fee),
// or with the org's own key (no Connect → no application fee).
export const stripeProvider: PaymentProvider = {
  key: "stripe",
  async ready(orgId) {
    try {
      const s = await stripeFor(orgId)
      if (s.direct) return !!(await s.client.accounts.retrieveCurrent()).charges_enabled
      return await stripeAccountReady(String(s.options.stripeAccount))
    } catch {
      return false
    }
  },
  async createCheckout(o) {
    const s = await stripeFor(o.orgId)
    const session = await s.client.checkout.sessions.create(
      {
        mode: "payment",
        line_items: o.items.map((i) => ({
          quantity: i.quantity,
          price_data: { currency: o.currency, unit_amount: i.unitAmount, product_data: { name: i.description } },
        })),
        payment_intent_data: { application_fee_amount: (!s.direct && o.applicationFee) || undefined, metadata: { order_id: o.orderId } },
        customer_email: o.customerEmail ?? undefined,
        client_reference_id: o.orderId,
        metadata: { order_id: o.orderId, org_id: o.orgId },
        success_url: o.successUrl,
        cancel_url: o.cancelUrl,
        expires_at: Math.floor(o.expiresAt.getTime() / 1000),
        integration_identifier: `roots_checkout_${letters()}`,
      },
      { ...s.options, idempotencyKey: `checkout_${o.orderId}` }
    )
    return { url: session.url!, providerRef: session.id }
  },
  async refund({ orgId, providerPaymentRef, amount, idempotencyKey }) {
    const s = await stripeFor(orgId)
    const refund = await s.client.refunds.create(
      { payment_intent: providerPaymentRef, amount, ...(s.direct ? {} : { refund_application_fee: true }) },
      { ...s.options, idempotencyKey }
    )
    return {
      providerRef: refund.id,
      status: refund.status === "succeeded" ? "succeeded" : refund.status === "failed" ? "failed" : "pending",
    }
  },
}
