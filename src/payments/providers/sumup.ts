import { createAdminClient } from "@/lib/supabase/admin"
import { sumup, sumupWebhookUrl, type SumUpCheckout } from "@/integrations/sumup"
import type { PaymentProvider, Reader } from "../provider"

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
        checkout_reference: `${o.orderId}-${Date.now().toString(36)}`, // unique per try (a door sale may be collected again)
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
  // Backup for a lost notification: reconcileOrder() asks SumUp directly while the order is pending.
  // Terminal payments ("reader:<client transaction id>") are looked up in the transactions (404 until the card is used).
  async checkoutStatus({ orgId, providerRef }) {
    if (providerRef.startsWith("reader:")) {
      const tx = await readerTransaction(orgId, providerRef.slice(7))
      return { paid: tx?.status === "SUCCESSFUL", failed: tx?.status === "FAILED" || tx?.status === "CANCELLED", providerPaymentRef: tx?.id }
    }
    const c = await sumup<SumUpCheckout>(orgId, `/v0.1/checkouts/${encodeURIComponent(providerRef)}`)
    return { paid: c.status === "PAID", failed: c.status === "FAILED", providerPaymentRef: c.transaction_id }
  },
  async cancelCheckout({ orgId, providerRef, readerId }) {
    if (!providerRef.startsWith("reader:")) return void (await sumup(orgId, `/v0.1/checkouts/${encodeURIComponent(providerRef)}`, { method: "DELETE" }).catch(() => null))
    const c = await config(orgId)
    // Only works while the reader waits for the card; SumUp then reports the transaction as failed.
    if (c?.merchant_code && readerId) await sumup(orgId, `/v0.1/merchants/${c.merchant_code}/readers/${encodeURIComponent(readerId)}/terminate`, { method: "POST" }).catch(() => null)
  },
  // Solo readers via SumUp's Cloud API: pair with the code the reader shows (Connections → API → Connect).
  terminal: {
    async readers(orgId) {
      const c = await config(orgId)
      if (!c?.merchant_code) return []
      const r = await sumup<{ items?: SumUpReader[] }>(orgId, `/v0.1/merchants/${c.merchant_code}/readers`)
      return (r.items ?? []).map(reader)
    },
    async pair(orgId, code, name) {
      const c = await config(orgId)
      if (!c?.merchant_code) throw new Error("payments.notConnected")
      return reader(await sumup<SumUpReader>(orgId, `/v0.1/merchants/${c.merchant_code}/readers`, { method: "POST", body: { pairing_code: code, name } }))
    },
    async remove(orgId, readerId) {
      const c = await config(orgId)
      if (c?.merchant_code) await sumup(orgId, `/v0.1/merchants/${c.merchant_code}/readers/${encodeURIComponent(readerId)}`, { method: "DELETE" })
    },
    async charge(o) {
      const c = await config(o.orgId)
      if (!c?.merchant_code) throw new Error("payments.notConnected")
      const r = await sumup<{ data: { client_transaction_id: string } }>(o.orgId, `/v0.1/merchants/${c.merchant_code}/readers/${encodeURIComponent(o.readerId)}/checkout`, {
        method: "POST",
        body: {
          total_amount: { currency: o.currency.toUpperCase(), minor_unit: 2, value: o.amount },
          description: o.description.slice(0, 250),
          return_url: sumupWebhookUrl(o.orgId),
        },
      })
      return { providerRef: `reader:${r.data.client_transaction_id}` }
    },
  },
  async refund({ orgId, providerPaymentRef, amount }) {
    await sumup(orgId, `/v0.1/me/refund/${encodeURIComponent(providerPaymentRef)}`, { method: "POST", body: { amount: amount / 100 } })
    return { providerRef: `sumup_refund_${providerPaymentRef}_${Date.now()}`, status: "succeeded" }
  },
}

type SumUpReader = { id: string; name: string; status: string; device?: { model?: string } }
const reader = (r: SumUpReader): Reader => ({ id: r.id, name: r.name, model: r.device?.model ?? null, status: r.status })

/** A terminal payment by its client transaction id (null while there is none yet). */
export async function readerTransaction(orgId: string, clientTransactionId: string) {
  const c = await config(orgId)
  if (!c?.merchant_code) return null
  return sumup<{ id: string; status: "SUCCESSFUL" | "CANCELLED" | "FAILED" | "PENDING" | "REFUNDED" }>(
    orgId,
    `/v2.1/merchants/${c.merchant_code}/transactions?client_transaction_id=${encodeURIComponent(clientTransactionId)}`
  ).catch(() => null)
}
