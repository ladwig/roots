import Stripe from "stripe"

// Platform Stripe client (server-only). Prefer a restricted key (rk_…) with only the permissions we use.
let client: Stripe | undefined
export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set")
  client ??= new Stripe(key, { apiVersion: "2026-08-26.dahlia" })
  return client
}
