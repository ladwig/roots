import { z } from "zod"
import { refundOrder } from "@/payments/server"
import { ApiError, endpoint, list, notFound, page, paged, uuid, type Endpoint } from "../core"
import { ts, type Db } from "./shared"

const STATUSES = ["open", "paid", "partially_refunded", "refunded", "failed", "expired"] as const
const Order = z.object({
  id: uuid,
  status: z.enum(STATUSES),
  source_module: z.string().describe("What was sold: tickets, …"),
  source_id: uuid.nullable(),
  amount_total: z.number().int().describe("Cents"),
  application_fee: z.number().int().describe("roots' fee in cents"),
  currency: z.string(),
  customer_email: z.string().nullable(),
  customer_name: z.string().nullable(),
  provider: z.string().nullable(),
  paid_at: ts.nullable(),
  created_at: ts,
  updated_at: ts,
})
const ORDER_COLS = "id, status, source_module, source_id, amount_total, application_fee, currency, customer_email, customer_name, provider, paid_at, created_at, updated_at"
const Refund = z.object({ id: uuid, amount: z.number().int(), status: z.string().describe("pending, succeeded or failed"), reason: z.string().nullable(), created_at: ts })
const OrderDetail = Order.extend({
  items: z.array(z.object({ description: z.string(), quantity: z.number().int(), unit_amount: z.number().int(), source_id: uuid.nullable() })),
  payments: z.array(
    z.object({
      id: uuid,
      provider: z.string(),
      status: z.string().describe("pending, succeeded, failed or expired"),
      amount: z.number().int(),
      application_fee: z.number().int(),
      created_at: ts,
      refunds: z.array(Refund),
    }),
  ),
  refundable: z.number().int().describe("Cents that can still be refunded"),
})

async function detail(db: Db, orgId: string, id: string) {
  const { data } = await db
    .from("pay_orders")
    .select(
      `${ORDER_COLS}, pay_order_items(description, quantity, unit_amount, source_id), pay_payments(id, provider, status, amount, application_fee, created_at, pay_refunds(id, amount, status, reason, created_at))`,
    )
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!data) throw notFound()
  const { pay_order_items, pay_payments, ...order } = data
  const payments = pay_payments.map(({ pay_refunds, ...p }) => ({ ...p, refunds: pay_refunds }))
  const paid = payments.find((p) => p.status === "succeeded")
  const refundable = paid ? paid.amount - paid.refunds.filter((r) => r.status !== "failed").reduce((s, r) => s + r.amount, 0) : 0
  return { ...order, items: pay_order_items, payments, refundable }
}

export const endpoints: Endpoint[] = [
  endpoint({
    method: "GET",
    path: "/payments/orders",
    permission: "payments.view",
    tag: "Payments",
    summary: "List orders",
    description: "Everything sold through roots (tickets, …), newest first. `q` searches customer email and name.",
    query: page.extend({
      status: z.enum(STATUSES).optional(),
      source_module: z.string().max(40).optional(),
      q: z.string().max(100).optional(),
      updated_since: z.iso.datetime({ offset: true }).optional(),
    }),
    response: list(Order),
    async handler({ db, orgId, query }) {
      let q = db.from("pay_orders").select(ORDER_COLS).eq("org_id", orgId).order("created_at", { ascending: false }).range(query.offset, query.offset + query.limit)
      const search = query.q?.replace(/[%,()*]/g, "").trim()
      if (search) q = q.or(`customer_email.ilike.%${search}%,customer_name.ilike.%${search}%`)
      if (query.status) q = q.eq("status", query.status)
      if (query.source_module) q = q.eq("source_module", query.source_module)
      if (query.updated_since) q = q.gte("updated_at", query.updated_since)
      const { data } = await q
      return paged(data, query)
    },
  }),
  endpoint({
    method: "GET",
    path: "/payments/orders/{id}",
    permission: "payments.view",
    tag: "Payments",
    summary: "Get an order with items, payments and refunds",
    response: OrderDetail,
    handler: ({ db, orgId, params }) => detail(db, orgId, params.id),
  }),
  endpoint({
    method: "POST",
    path: "/payments/orders/{id}/refund",
    permission: "payments.refund",
    tag: "Payments",
    summary: "Refund a paid order (fully or partly)",
    description:
      "Refunds through the payment provider. `amount` (cents) defaults to everything not yet refunded. Status is `succeeded`, `failed` or `pending` (the provider confirms later; the order then becomes refunded / partially_refunded). The provider request is idempotent for the same order state, and the amount can never exceed what is left (422 invalid_refund).",
    body: z.object({ amount: z.number().int().positive().optional(), reason: z.string().trim().max(500).optional() }).strict(),
    response: z.object({ status: z.enum(["succeeded", "pending", "failed"]), order: OrderDetail }),
    async handler({ db, orgId, params, body }) {
      const { data: order } = await db.from("pay_orders").select("id").eq("id", params.id).eq("org_id", orgId).maybeSingle()
      if (!order) throw notFound()
      let status: string
      try {
        status = await refundOrder(params.id, body.amount, body.reason ?? "")
      } catch (e) {
        const key = e instanceof Error ? e.message : ""
        if (key === "payments.notRefundable") throw new ApiError(422, "not_refundable", "This order has no successful payment to refund.")
        if (key === "payments.invalidRefund") throw new ApiError(422, "invalid_refund", "The amount is more than what is left to refund.")
        console.error("api refund", e)
        throw new ApiError(502, "provider_error", "The payment provider refused the refund.")
      }
      return { status, order: await detail(db, orgId, params.id) }
    },
  }),
]
