import { createAdminClient } from "@/lib/supabase/admin"
import { sumup, sumupWebhookUrl, type SumUpCheckout } from "@/integrations/sumup"
import type { PaymentProvider } from "../provider"

async function config(orgId: string) {
  const { data } = await createAdminClient()
    .from("org_integrations")
    .select("config, status")
    .eq("org_id", orgId)
    .eq("provider", "sumup")
    .maybeSingle()
  return data?.status === "connected" ? ((data.config ?? {}) as { merchant_code?: string; can_take_payments?: boolean }) : null
}

// SumUp Hosted Checkout on the org's own SumUp account.
// ponytail: SumUp has no platform fee mechanism; roots' fee isn't collected on SumUp payments (bill it separately).
export const sumupProvider: PaymentProvider = {
  key: "sumup",
  async ready(orgId) {
    const c = await config(orgId)
    return !!(c?.merchant_code && c.can_take_payments)
  },
  async createCheckout(o) {
    const c = await config(o.orgId)
    if (!c?.merchant_code) throw new Error("payments.notConnected")
    const amount = o.items.reduce((sum, i) => sum + i.quantity * i.unitAmount, 0)
    const checkout = await sumup<SumUpCheckout>(o.orgId, "/v0.1/checkouts", {
      method: "POST",
      body: {
        checkout_reference: o.orderId,
        amount: amount / 100,
        currency: o.currency.toUpperCase(),
        merchant_code: c.merchant_code,
        description: o.items.map((i) => `${i.quantity}× ${i.description}`).join(", ").slice(0, 250),
        redirect_url: o.successUrl,
        return_url: sumupWebhookUrl(o.orgId), // status-change webhook
        hosted_checkout: { enabled: true },
      },
    })
    if (!checkout.hosted_checkout_url) throw new Error("payments.notReady")
    return { url: checkout.hosted_checkout_url, providerRef: checkout.id }
  },
  async refund({ orgId, providerPaymentRef, amount }) {
    await sumup(orgId, `/v0.1/me/refund/${encodeURIComponent(providerPaymentRef)}`, { method: "POST", body: { amount: amount / 100 } })
    return { providerRef: `sumup_refund_${providerPaymentRef}_${Date.now()}`, status: "succeeded" }
  },
}
