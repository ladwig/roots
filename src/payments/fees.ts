// Passing payment costs on to buyers (pure, tested). In Germany a surcharge *for a payment method* is not allowed
// (§ 270a BGB), so this is a service fee on every paid online order, shown before buying – whatever method is used.
// The org sets it on its payment integration (Settings → Integrations); providers don't tell the fee in advance, so
// it's their usual rate, editable. ponytail: typical EU-card rates as defaults; premium/non-EU cards cost more.
export type PassOn = { percent: number; fixedCents: number }

export const DEFAULT_COSTS: Record<string, PassOn> = {
  stripe: { percent: 1.5, fixedCents: 25 },
  sumup: { percent: 2.5, fixedCents: 0 },
}

/** The pass-on setting from an integration's config, or null when the org doesn't pass costs on. */
export function readPassOn(provider: string, config: Record<string, unknown> | null | undefined): PassOn | null {
  if (!config?.pass_fees) return null
  const d = DEFAULT_COSTS[provider] ?? { percent: 0, fixedCents: 0 }
  const percent = Number(config.fee_percent ?? d.percent)
  const fixedCents = Number(config.fee_fixed_cents ?? d.fixedCents)
  if (!(percent >= 0 && percent < 50 && fixedCents >= 0 && fixedCents <= 10000)) return null
  return { percent, fixedCents }
}

/**
 * The service fee for an order total so the org keeps the full ticket price after the provider took its cut on the
 * whole amount (fee included): total = (subtotal + fixed) / (1 − percent), rounded up to the cent.
 */
export function serviceFee(subtotalCents: number, c: PassOn | null) {
  if (!c || subtotalCents <= 0 || (c.percent <= 0 && c.fixedCents <= 0)) return 0
  const total = Math.ceil((subtotalCents + c.fixedCents) / (1 - c.percent / 100) - 1e-9)
  return total - subtotalCents
}
