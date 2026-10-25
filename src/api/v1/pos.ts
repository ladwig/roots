// POS (point of sale): selling in person – today at an event's door (tickets at any price + custom amounts), paid in
// cash, by QR code (the org's online checkout on the buyer's phone) or on a card terminal. Same logic as the door
// screen (src/tickets/door.ts → src/payments/pos.ts).
import { z } from "zod"
import { cancelDoorSale, doorOffer, doorSaleStatus, doorSummary, payAtDoor, sellAtDoor } from "@/tickets/door"
import { DOOR_METHODS, readLines } from "@/tickets/door-fields"
import { ApiError, endpoint, notFound, uuid, type Endpoint } from "../core"
import { eventOf } from "./events"

const Method = z.enum(DOOR_METHODS).describe("cash = paid at once; qr = `pay_url` for the buyer's phone (show it as a QR code); terminal = sent to the event's card reader")
const Line = z.object({
  type_id: uuid.nullable().optional().describe("A ticket type of the event (one ticket per quantity); omit for a custom amount"),
  label: z.string().max(100).optional().describe("Text for a custom amount (e.g. 'Drink'); optional note on a ticket line"),
  price: z.number().int().min(0).max(10_000_000).describe("Cents per piece (the door may charge any price)"),
  quantity: z.number().int().min(1).max(100),
})
const Pay = z.object({
  order_id: uuid,
  status: z.enum(["paid", "pending"]).describe("pending = waiting for the card/QR payment: poll GET /pos/sales/{id}"),
  pay_url: z.string().nullable().describe("QR: the checkout page for the buyer's phone"),
})
const Status = z.enum(["open", "paid", "failed", "expired", "cancelled", "refunded", "partially_refunded"])

const fail = (e: unknown) => {
  const key = (e as { message?: string })?.message ?? ""
  if (key === "tickets.notOnSale") return new ApiError(422, "not_on_sale", "A ticket type isn't sold at this event.")
  if (key === "payments.notReady" || key === "payments.noTerminal") return new ApiError(422, "method_unavailable", "This payment method isn't set up for the event (events.door, integrations).")
  if (key === "payments.notOpen") return new ApiError(409, "not_open", "The sale is already paid or cancelled.")
  if (key === "errors.invalid_input") return new ApiError(422, "invalid_input", "Invalid input.")
  return e instanceof Error ? e : new ApiError(500, "internal", "Payment failed.")
}

export const endpoints: Endpoint[] = [
  endpoint({
    method: "GET",
    path: "/events/{id}/pos",
    permission: "tickets.scan",
    tag: "POS",
    summary: "What the door can sell at an event",
    description: "Ticket types (hidden ones too) at today's price, seats left (null = no event capacity; the door may overbook), and the payment methods ready for this event (event setting `door` ∩ what the org has connected).",
    response: z.object({
      types: z.array(z.object({ id: uuid, name: z.string(), price: z.number().int(), currency: z.string() })),
      left: z.number().int().nullable(),
      methods: z.array(z.enum(DOOR_METHODS)),
    }),
    async handler({ db, orgId, params }) {
      await eventOf(db, orgId, params.id)
      const o = await doorOffer(orgId, params.id)
      if (!o) throw notFound()
      return { types: o.types, left: o.left, methods: o.methods }
    },
  }),
  endpoint({
    method: "POST",
    path: "/pos/sales",
    permission: "tickets.scan",
    tag: "POS",
    summary: "Sell at the door and collect the money",
    description:
      "Creates an order (tickets + custom amounts) and collects it. Cash: paid at once, tickets let in (used), booked into the event's cash book account if set. QR / terminal: `pending` until the provider confirms; then the tickets are let in. With `email` the buyer gets the tickets and becomes a contact. Money: moves real payments.",
    body: z.object({
      event_id: uuid,
      lines: z.array(Line).min(1).max(50),
      method: Method,
      name: z.string().max(200).optional(),
      email: z.email().optional(),
    }).strict(),
    response: Pay,
    status: 201,
    async handler({ db, orgId, body }) {
      await eventOf(db, orgId, body.event_id)
      const lines = readLines(body.lines.map((l) => ({ typeId: l.type_id ?? null, label: l.label ?? "", price: l.price, quantity: l.quantity })))
      if (!lines) throw new ApiError(422, "invalid_input", "Each line needs type_id or label; at most 200 tickets.")
      try {
        const { orderId } = await sellAtDoor({ orgId, eventId: body.event_id, lines, name: body.name, email: body.email, soldBy: null })
        const r = await payAtDoor(orgId, orderId, body.method)
        return { order_id: orderId, status: r.status, pay_url: r.status === "pending" ? (r.url ?? null) : null }
      } catch (e) {
        throw fail(e)
      }
    },
  }),
  endpoint({
    method: "GET",
    path: "/pos/sales/{id}",
    permission: "tickets.scan",
    tag: "POS",
    summary: "State of a door sale",
    description: "Asks the payment provider while a card/QR payment runs (poll every few seconds). `failed`/`expired`: collect again with POST /pos/sales/{id}/pay or cancel.",
    response: z.object({ status: Status }),
    async handler({ orgId, params }) {
      const s = await doorSaleStatus(orgId, params.id)
      if (!s) throw notFound()
      return { status: s as z.infer<typeof Status> }
    },
  }),
  endpoint({
    method: "POST",
    path: "/pos/sales/{id}/pay",
    permission: "tickets.scan",
    tag: "POS",
    summary: "Collect a door sale again (other method)",
    description: "For a sale whose card/QR payment failed, or to switch method: a running card/QR payment is stopped first, so the buyer can't pay twice. Money.",
    body: z.object({ method: Method }).strict(),
    response: Pay,
    async handler({ orgId, params, body }) {
      try {
        const r = await payAtDoor(orgId, params.id, body.method)
        return { order_id: params.id, status: r.status, pay_url: r.status === "pending" ? (r.url ?? null) : null }
      } catch (e) {
        throw fail(e)
      }
    },
  }),
  endpoint({
    method: "POST",
    path: "/pos/sales/{id}/cancel",
    permission: "tickets.scan",
    tag: "POS",
    summary: "Cancel an unpaid door sale",
    description: "Stops a running card/QR payment, cancels the order and frees its reserved tickets. Paid sales are refunded via POST /orders/{id}/refund instead.",
    response: z.object({ ok: z.literal(true) }),
    async handler({ orgId, params }) {
      try {
        await cancelDoorSale(orgId, params.id)
      } catch {
        throw notFound()
      }
      return { ok: true as const }
    },
  }),
  endpoint({
    method: "GET",
    path: "/events/{id}/pos/summary",
    permission: "tickets.scan",
    tag: "POS",
    summary: "Door sales of an event (for counting the till)",
    description: "Paid door sales: number of sales and tickets, total and per payment method (cents).",
    response: z.object({
      sales: z.number().int(),
      tickets: z.number().int(),
      total: z.number().int(),
      by_method: z.record(z.string(), z.object({ count: z.number().int(), total: z.number().int() })),
    }),
    async handler({ db, orgId, params }) {
      await eventOf(db, orgId, params.id)
      const s = await doorSummary(orgId, params.id)
      return { sales: s.sales, tickets: s.tickets, total: s.total, by_method: s.byMethod }
    },
  }),
]
