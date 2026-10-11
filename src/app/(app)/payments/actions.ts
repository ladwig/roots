"use server"

import { redirect } from "next/navigation"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { getContext, requirePerm } from "@/lib/context"
import { back } from "@/lib/url"
import { createOrder, refundOrder, startCheckout } from "@/payments/server"

const PATH = "/payments"
const errorText = (t: T, e: unknown) => {
  const key = e instanceof Error ? e.message : ""
  if (!t.has(key)) console.error(e)
  return t.has(key) ? t.dynamic(key) : t("errors.generic")
}
const euros = (v: FormDataEntryValue | null) => Math.round(Number(String(v ?? "").replace(",", ".")) * 100)

export async function refund(orderId: string, formData: FormData) {
  const ctx = await requirePerm("payments.refund")
  const t = await getT()
  // Make sure the order belongs to the active org (RLS on the scoped client), the service itself runs as service role.
  const { data: order } = await ctx.supabase.from("pay_orders").select("id").eq("id", orderId).eq("org_id", ctx.org.id).maybeSingle()
  if (!order || !ctx.modules.has("payments")) back(PATH, { error: t("errors.not_allowed") })
  const raw = String(formData.get("amount") ?? "").trim()
  let status: string
  try {
    status = await refundOrder(orderId, raw ? euros(raw) : undefined, String(formData.get("reason") ?? ""))
  } catch (e) {
    back(`${PATH}?edit=${orderId}`, { error: errorText(t, e) })
  }
  back(`${PATH}?edit=${orderId}`, { ok: status === "succeeded" ? t("payments.refunded") : t("payments.refundPending") })
}

// Platform admins only: a real payment of any amount through the org's Stripe account, to test the whole chain.
export async function createTestPayment(formData: FormData) {
  const ctx = await getContext()
  const t = await getT()
  if (!ctx.isPlatformAdmin) back(PATH, { error: t("errors.not_allowed") })
  const amount = euros(formData.get("amount"))
  let url: string
  try {
    const orderId = await createOrder({
      orgId: ctx.org.id,
      sourceModule: "test",
      customerEmail: String(formData.get("email") ?? "") || undefined,
      items: [{ description: t("payments.testPayment"), quantity: 1, unitAmount: amount }],
    })
    url = await startCheckout(orderId)
  } catch (e) {
    back(`${PATH}?new=test`, { error: errorText(t, e) })
  }
  redirect(url)
}
