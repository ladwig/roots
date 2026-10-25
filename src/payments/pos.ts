// In-person payments (door, later a till for food/drinks): any module creates an order with createOrder() and
// collects it here – in cash (paid at once), by QR code (the org's online checkout on the buyer's phone) or on a
// card terminal (a provider with `terminal`, SumUp Solo today). The webhook / reconcileOrder() confirm card payments.
import { createAdminClient } from "@/lib/supabase/admin"
import { markPaid, providerFor, providerByKey, reconcileOrder, startCheckout } from "./server"

export const POS_METHODS = ["cash", "qr", "terminal"] as const
export type PosMethod = (typeof POS_METHODS)[number]
export type Collect = { status: "paid" } | { status: "pending"; url?: string }

const db = () => createAdminClient()

/** What the org can take in person right now (cash always; QR = an online provider; terminal = a provider with readers). */
export async function posMethods(orgId: string) {
  const p = await providerFor(orgId) // one payment provider per org
  return { cash: true, qr: !!p, terminal: !!p?.terminal }
}

/** The org's card readers (empty without a terminal-capable provider). */
export async function posReaders(orgId: string) {
  const p = await providerFor(orgId)
  return p?.terminal ? p.terminal.readers(orgId) : []
}

/**
 * Collect an open order. A failed/expired try may be collected again (other method); a running card/QR payment
 * is cancelled first, so the buyer can't pay twice.
 */
export async function collect(orderId: string, method: PosMethod, o: { readerId?: string; successUrl?: string } = {}): Promise<Collect> {
  const { data: order } = await db().from("pay_orders").select("id, org_id, status, amount_total, application_fee, currency, metadata, pay_order_items(description, quantity)").eq("id", orderId).single()
  if (!order || !["open", "failed", "expired"].includes(order.status)) throw new Error("payments.notOpen")
  await cancelCollect(orderId, false)
  await db().from("pay_orders").update({ status: "open" }).eq("id", orderId)
  const meta = { ...((order.metadata ?? {}) as Record<string, unknown>), pos_method: method }

  if (method === "cash" || order.amount_total === 0) {
    await db().from("pay_orders").update({ provider: "cash", metadata: meta as never }).eq("id", orderId)
    await db().from("pay_payments").upsert(
      { org_id: order.org_id, order_id: orderId, provider: "cash", provider_ref: orderId, amount: order.amount_total, application_fee: order.application_fee },
      { onConflict: "provider,provider_ref", ignoreDuplicates: true }
    )
    await markPaid("cash", orderId, orderId)
    return { status: "paid" }
  }

  if (method === "qr") {
    await db().from("pay_orders").update({ metadata: meta as never }).eq("id", orderId)
    return { status: "pending", url: await startCheckout(orderId, { successUrl: o.successUrl }) }
  }

  const p = await providerFor(order.org_id)
  if (!p?.terminal || !o.readerId) throw new Error("payments.noTerminal")
  const description = order.pay_order_items.map((i) => `${i.quantity}× ${i.description}`).join(", ")
  const { providerRef } = await p.terminal.charge({ orgId: order.org_id, readerId: o.readerId, orderId, amount: order.amount_total, currency: order.currency, description })
  await db().from("pay_payments").insert({ org_id: order.org_id, order_id: orderId, provider: p.key, provider_ref: providerRef, amount: order.amount_total, application_fee: order.application_fee })
  await db().from("pay_orders").update({ provider: p.key, metadata: { ...meta, reader_id: o.readerId } as never }).eq("id", orderId)
  return { status: "pending" }
}

/** Where a collected order stands (asks the provider while pending). */
export async function posStatus(orderId: string) {
  await reconcileOrder(orderId).catch(() => null)
  const { data } = await db().from("pay_orders").select("status").eq("id", orderId).single()
  return data?.status ?? "cancelled"
}

/** Stop running card/QR payments of an order; `close` also cancels the order (and voids its reserved tickets). */
export async function cancelCollect(orderId: string, close = true) {
  const { data: pays } = await db().from("pay_payments").select("org_id, provider, provider_ref, pay_orders!inner(metadata)").eq("order_id", orderId).eq("status", "pending")
  for (const pay of pays ?? []) {
    const readerId = (pay.pay_orders?.metadata as Record<string, unknown> | null)?.reader_id
    await providerByKey(pay.provider)?.cancelCheckout?.({ orgId: pay.org_id, providerRef: pay.provider_ref, readerId: typeof readerId === "string" ? readerId : undefined })
    await db().from("pay_payments").update({ status: "failed" }).eq("provider", pay.provider).eq("provider_ref", pay.provider_ref).eq("status", "pending")
  }
  if (!close) return
  await db().from("pay_orders").update({ status: "cancelled" }).eq("id", orderId).in("status", ["open", "failed", "expired"])
  await db().from("tickets").update({ status: "void" }).eq("order_id", orderId).eq("status", "reserved")
}
