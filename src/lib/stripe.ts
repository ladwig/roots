import Stripe from "stripe"

// Platform Stripe client (server-only). Prefer a restricted key (rk_…) with only the permissions we use.
export const STRIPE_API_VERSION = "2026-08-26.dahlia" as const
let client: Stripe | undefined
export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set")
  client ??= new Stripe(key, { apiVersion: STRIPE_API_VERSION })
  return client
}
