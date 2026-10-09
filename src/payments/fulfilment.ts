// What happens when an order is paid or refunded, per selling module (pay_orders.source_module).
// Handlers must be idempotent: a webhook can be delivered more than once.
export type PaidOrder = {
  id: string
  org_id: string
  source_module: string
  source_id: string | null
  customer_email: string | null
  metadata: unknown
}

type Handlers = { onPaid?(order: PaidOrder): Promise<void>; onRefunded?(order: PaidOrder): Promise<void> }

export const fulfilment: Record<string, Handlers> = {
  test: {}, // test payments from /payments: nothing to deliver
  // tickets: { onPaid: issueTickets, onRefunded: voidTickets },  ← Ticketing registers here
}
