// A payment provider (Stripe today, others later). The payments service picks the provider the org has connected.
export type CheckoutInput = {
  orgId: string
  orderId: string
  currency: string
  items: { description: string; quantity: number; unitAmount: number }[]
  applicationFee: number
  customerEmail?: string | null
  successUrl: string
  cancelUrl: string
  expiresAt: Date
}

export type PaymentProvider = {
  key: string // = integration key in src/integrations
  /** Can this org take payments right now (connected and fully onboarded)? */
  ready(orgId: string): Promise<boolean>
  /** Starts a hosted checkout; returns where to send the buyer and the provider's reference for it. */
  createCheckout(input: CheckoutInput): Promise<{ url: string; providerRef: string; feeCollected?: boolean }> // feeCollected: the provider takes roots' fee itself (else it's invoiced)
  /** Asks the provider whether a checkout was paid (backup when a webhook is late or lost). Optional. */
  checkoutStatus?(input: { orgId: string; providerRef: string }): Promise<{ paid: boolean; failed?: boolean; providerPaymentRef?: string }>
  /** Stops a started checkout so a late payment can't come in (switching to another method). Optional. */
  cancelCheckout?(input: { orgId: string; providerRef: string; readerId?: string }): Promise<void>
  /** Card terminals (in-person payments, src/payments/pos.ts). Optional. */
  terminal?: {
    readers(orgId: string): Promise<Reader[]>
    pair(orgId: string, code: string, name: string): Promise<Reader>
    remove(orgId: string, readerId: string): Promise<void>
    /** Sends the amount to the reader; returns the provider reference (checked via checkoutStatus/webhook). */
    charge(input: { orgId: string; readerId: string; orderId: string; amount: number; currency: string; description: string }): Promise<{ providerRef: string }>
  }
  /** Refunds (part of) a payment; `providerPaymentRef` is what the provider needs to refund. */
  refund(input: { orgId: string; providerPaymentRef: string; amount: number; idempotencyKey: string }): Promise<{
    providerRef: string
    status: "pending" | "succeeded" | "failed"
  }>
}

export type Reader = { id: string; name: string; model: string | null; status: string }
