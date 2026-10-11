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
  createCheckout(input: CheckoutInput): Promise<{ url: string; providerRef: string }>
  /** Asks the provider whether a checkout was paid (backup when a webhook is late or lost). Optional. */
  checkoutStatus?(input: { orgId: string; providerRef: string }): Promise<{ paid: boolean; providerPaymentRef?: string }>
  /** Refunds (part of) a payment; `providerPaymentRef` is what the provider needs to refund. */
  refund(input: { orgId: string; providerPaymentRef: string; amount: number; idempotencyKey: string }): Promise<{
    providerRef: string
    status: "pending" | "succeeded" | "failed"
  }>
}
