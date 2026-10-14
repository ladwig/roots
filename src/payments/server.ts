// Payments service (server-only, service role). Callers check permissions; this module keeps the money logic.
// Flow: createOrder → startCheckout (hosted page at the org's provider) → webhook → markPaid → module fulfilment.
import { createAdminClient } from "@/lib/supabase/admin"
import { APP_URL } from "@/lib/url"
import { applicationFee, feeConfig } from "./fees"
import { fulfilment, type PaidOrder } from "./fulfilment"
import type { PaymentProvider } from "./provider"
import { stripeProvider } from "./providers/stripe"
import { sumupProvider } from "./providers/sumup"

const providers: PaymentProvider[] = [stripeProvider, sumupProvider] // first ready one wins
const db = () => createAdminClient()
const CHECKOUT_MINUTES = 30 // Stripe allows 30 min – 24 h
const CLAIM_MINUTES = 5 // a fulfilment claim older than this died with its process

/** The org's connected, ready payment provider, or null. */
export async function providerFor(orgId: string) {
  const { data } = await db()
    .from("org_integrations")
    .select("provider")
    .eq("org_id", orgId)
    .in("provider", providers.map((p) => p.key))
  for (const row of data ?? []) {
    const p = providers.find((x) => x.key === row.provider)
    if (p && (await p.ready(orgId))) return p
  }
  return null
}

export type NewOrder = {
  orgId: string
  sourceModule: string
  sourceId?: string
  currency?: string
  customerEmail?: string
  customerName?: string
  metadata?: Record<string, unknown>
  items: { description: string; quantity: number; unitAmount: number; sourceId?: string }[]
}

export async function createOrder(o: NewOrder): Promise<string> {
  const ok =
    o.items.length > 0 &&
    o.items.length <= 100 &&
    o.items.every((i) => i.description.trim() && Number.isInteger(i.quantity) && i.quantity > 0 && Number.isInteger(i.unitAmount) && i.unitAmount >= 0)
  if (!ok) throw new Error("payments.invalidOrder")
  const total = o.items.reduce((sum, i) => sum + i.quantity * i.unitAmount, 0)

  const { data: order, error } = await db()
    .from("pay_orders")
    .insert({
      org_id: o.orgId,
      source_module: o.sourceModule,
      source_id: o.sourceId,
      currency: o.currency ?? "eur",
      amount_total: total,
      application_fee: applicationFee(total, feeConfig()),
      customer_email: o.customerEmail?.trim().toLowerCase() || null,
      customer_name: o.customerName?.trim() || null,
      metadata: (o.metadata ?? {}) as never,
    })
    .select("id")
    .single()
  if (error) throw error
  const { error: itemsError } = await db()
    .from("pay_order_items")
    .insert(o.items.map((i) => ({ org_id: o.orgId, order_id: order.id, description: i.description.trim(), quantity: i.quantity, unit_amount: i.unitAmount, source_id: i.sourceId })))
  if (itemsError) throw itemsError
  return order.id
}

/** Starts payment for an open order and returns the URL to send the buyer to. Free orders are paid right away. */
export async function startCheckout(orderId: string, urls?: { successUrl?: string; cancelUrl?: string }) {
  const { data: order } = await db().from("pay_orders").select("*, pay_order_items(*)").eq("id", orderId).single()
  if (!order || order.status !== "open") throw new Error("payments.notOpen")
  const successUrl = urls?.successUrl ?? `${APP_URL}/checkout/return?order=${order.id}`
  const cancelUrl = urls?.cancelUrl ?? `${APP_URL}/checkout/return?order=${order.id}&cancelled=1`

  if (order.amount_total === 0) {
    await db().from("pay_orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", order.id)
    await fulfil(order.id)
    return successUrl
  }

  const provider = await providerFor(order.org_id)
  if (!provider) throw new Error("payments.notReady")
  const expiresAt = new Date(Date.now() + CHECKOUT_MINUTES * 60_000)
  const checkout = await provider.createCheckout({
    orgId: order.org_id,
    orderId: order.id,
    currency: order.currency,
    items: order.pay_order_items.map((i) => ({ description: i.description, quantity: i.quantity, unitAmount: i.unit_amount })),
    applicationFee: order.application_fee,
    customerEmail: order.customer_email,
    successUrl,
    cancelUrl,
    expiresAt,
  })
  await db()
    .from("pay_payments")
    .upsert(
      { org_id: order.org_id, order_id: order.id, provider: provider.key, provider_ref: checkout.providerRef, amount: order.amount_total, application_fee: order.application_fee },
      { onConflict: "provider,provider_ref", ignoreDuplicates: true }
    )
  await db().from("pay_orders").update({ provider: provider.key, expires_at: expiresAt.toISOString() }).eq("id", order.id)
  return checkout.url
}

/**
 * Still open? Ask the provider directly (the webhook may be late or lost) and mark it paid if so. Safe to call often:
 * the provider's answer is the source of truth, never the buyer's browser.
 */
export async function reconcileOrder(orderId: string) {
  const { data: pay } = await db()
    .from("pay_payments")
    .select("org_id, provider, provider_ref, status, pay_orders!inner(status)")
    .eq("order_id", orderId)
    .eq("status", "pending")
    .eq("pay_orders.status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const provider = pay && providers.find((p) => p.key === pay.provider)
  if (!pay || !provider?.checkoutStatus) return
  const r = await provider.checkoutStatus({ orgId: pay.org_id, providerRef: pay.provider_ref })
  if (r.paid) await markPaid(pay.provider, pay.provider_ref, r.providerPaymentRef)
}

/** Payment confirmed by the provider (webhook). Safe to call repeatedly. */
export async function markPaid(provider: string, providerRef: string, providerPaymentRef?: string) {
  const { data: payment } = await db()
    .from("pay_payments")
    .update({ status: "succeeded", provider_payment_ref: providerPaymentRef })
    .eq("provider", provider)
    .eq("provider_ref", providerRef)
    .select("order_id")
    .maybeSingle()
  if (!payment) return // not ours (e.g. a payment made outside roots on the same account)
  await db()
    .from("pay_orders")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", payment.order_id)
    .in("status", ["open", "failed", "expired"])
  await fulfil(payment.order_id)
}

// Runs the selling module's onPaid until it succeeded once (fulfilled_at). Only the caller holding the claim runs it
// (webhook vs. reconcileOrder vs. worker race); a claim older than CLAIM_MINUTES died with its process and is taken over.
// onPaid is idempotent, so taking over a slow run costs nothing (issueTickets mails only on reserved → valid).
async function fulfil(orderId: string) {
  const now = new Date()
  const stale = new Date(now.getTime() - CLAIM_MINUTES * 60_000).toISOString()
  const { data: order } = await db()
    .from("pay_orders")
    .update({ fulfil_claimed_at: now.toISOString() })
    .eq("id", orderId)
    .is("fulfilled_at", null)
    .or(`fulfil_claimed_at.is.null,fulfil_claimed_at.lt.${stale}`)
    .select("id, org_id, source_module, source_id, customer_email, metadata")
    .maybeSingle()
  if (!order) return
  try {
    await fulfilment[order.source_module]?.onPaid?.(order as PaidOrder)
  } catch (e) {
    await db().from("pay_orders").update({ fulfil_claimed_at: null }).eq("id", orderId) // provider or worker retries
    throw e
  }
  await db().from("pay_orders").update({ fulfilled_at: new Date().toISOString() }).eq("id", orderId)
}

/** Minute worker: paid orders whose fulfilment failed or crashed (no live claim) get another run. */
export async function fulfilPending() {
  const stale = new Date(Date.now() - CLAIM_MINUTES * 60_000).toISOString()
  const { data } = await db()
    .from("pay_orders")
    .select("id")
    .eq("status", "paid")
    .is("fulfilled_at", null)
    .gt("paid_at", new Date(Date.now() - 2 * 86_400_000).toISOString()) // give up after 2 days
    .lt("paid_at", stale) // fresh ones are still in their webhook
    .or(`fulfil_claimed_at.is.null,fulfil_claimed_at.lt.${stale}`)
    .limit(50)
  let n = 0
  for (const o of data ?? []) await fulfil(o.id).then(() => n++, (e) => console.error("fulfil", o.id, e))
  return n
}

async function closePayment(provider: string, providerRef: string, status: "failed" | "expired") {
  const { data: payment } = await db()
    .from("pay_payments")
    .update({ status })
    .eq("provider", provider)
    .eq("provider_ref", providerRef)
    .eq("status", "pending")
    .select("order_id")
    .maybeSingle()
  if (payment) await db().from("pay_orders").update({ status }).eq("id", payment.order_id).eq("status", "open")
}
export const markFailed = (provider: string, providerRef: string) => closePayment(provider, providerRef, "failed")
export const markExpired = (provider: string, providerRef: string) => closePayment(provider, providerRef, "expired")

/** Provider reports the total refunded so far on a payment (ours or from its dashboard). */
export async function markRefunded(provider: string, providerPaymentRef: string, amountRefunded: number) {
  const { data: payment } = await db()
    .from("pay_payments")
    .select("order_id, amount")
    .eq("provider", provider)
    .eq("provider_payment_ref", providerPaymentRef)
    .maybeSingle()
  if (!payment) return
  const full = amountRefunded >= payment.amount
  const { data: changed } = await db()
    .from("pay_orders")
    .update({ status: full ? "refunded" : "partially_refunded" })
    .eq("id", payment.order_id)
    .neq("status", "refunded")
    .select("id, org_id, source_module, source_id, customer_email, metadata")
    .maybeSingle()
  await db().from("pay_refunds").update({ status: "succeeded" }).eq("status", "pending").in(
    "payment_id",
    (await db().from("pay_payments").select("id").eq("provider_payment_ref", providerPaymentRef)).data?.map((p) => p.id) ?? []
  )
  if (full && changed) await fulfilment[changed.source_module]?.onRefunded?.(changed as PaidOrder)
}

/** Refunds (part of) a paid order. Caller checks payments.refund. Amount defaults to what's left. */
export async function refundOrder(orderId: string, amount?: number, reason?: string) {
  const { data: payment } = await db()
    .from("pay_payments")
    .select("id, org_id, provider, provider_payment_ref, amount, pay_refunds(amount, status)")
    .eq("order_id", orderId)
    .eq("status", "succeeded")
    .maybeSingle()
  if (!payment?.provider_payment_ref) throw new Error("payments.notRefundable")
  const refunded = payment.pay_refunds.filter((r) => r.status !== "failed").reduce((s, r) => s + r.amount, 0)
  const left = payment.amount - refunded
  const value = amount ?? left
  if (!Number.isInteger(value) || value <= 0 || value > left) throw new Error("payments.invalidRefund")

  const provider = providers.find((p) => p.key === payment.provider)!
  const result = await provider.refund({
    orgId: payment.org_id,
    providerPaymentRef: payment.provider_payment_ref,
    amount: value,
    idempotencyKey: `refund_${payment.id}_${refunded}_${value}`,
  })
  await db().from("pay_refunds").insert({
    org_id: payment.org_id,
    payment_id: payment.id,
    amount: value,
    reason: reason?.trim() || null,
    provider_ref: result.providerRef,
    status: result.status,
  })
  // Providers without refund webhooks (SumUp) confirm synchronously; Stripe confirms again via charge.refunded.
  if (result.status === "succeeded") await markRefunded(payment.provider, payment.provider_payment_ref, refunded + value)
  return result.status
}

/** What a buyer may see about their order on the return page (no personal data). */
export async function publicOrderStatus(orderId: string) {
  if (!/^[0-9a-f-]{36}$/.test(orderId)) return null
  const { data } = await db().from("pay_orders").select("status, amount_total, currency, orgs(name)").eq("id", orderId).maybeSingle()
  return data
}
