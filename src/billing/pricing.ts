// What roots charges an org (pure, tested). A price (org_prices row) applies from its month until the next one; the
// bill for a month = base + modules + users and members above the free allowance, minus the discount, plus roots'
// sales fees the provider didn't take already (SumUp, Stripe with the org's own key).
export type Price = {
  starts_on: string
  base_cents: number
  module_cents: Record<string, number>
  user_cents: number
  included_users: number
  member_cents: number
  included_members: number
  sales_percent: number
  sales_fixed_cents: number
  discount_percent: number
}
export type Usage = { users: number; members: number; modules: string[]; fees_open_cents: number }

export const FREE: Price = { starts_on: "2000-01-01", base_cents: 0, module_cents: {}, user_cents: 0, included_users: 0, member_cents: 0, included_members: 0, sales_percent: 0, sales_fixed_cents: 0, discount_percent: 0 }

/** "2026-10" → first day of that month and of the next ("2026-10-01", "2026-11-01"). */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number)
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`
  return { from: `${month}-01`, to: `${next}-01` }
}

/** The price for a month: the org's own (latest that started by then), else the default's, else free. */
export function priceFor<P extends { starts_on: string }>(own: P[], defaults: P[], monthStart: string): P | null {
  const pick = (list: P[]) => list.filter((p) => p.starts_on <= monthStart).sort((a, b) => b.starts_on.localeCompare(a.starts_on))[0]
  return pick(own) ?? pick(defaults) ?? null
}

/** roots' fee on one sale, in cents: % of the total + fixed, never more than the sale. */
export function salesFee(amountCents: number, p: Pick<Price, "sales_percent" | "sales_fixed_cents">) {
  if (amountCents <= 0) return 0
  const fee = Math.round((amountCents * Number(p.sales_percent)) / 100) + p.sales_fixed_cents
  return Math.min(Math.max(fee, 0), amountCents)
}

export function monthlyBill(p: Price, u: Usage) {
  const modules = u.modules.reduce((sum, m) => sum + (p.module_cents[m] ?? 0), 0)
  const users = Math.max(0, u.users - p.included_users) * p.user_cents
  const members = Math.max(0, u.members - p.included_members) * p.member_cents
  const subscription = p.base_cents + modules + users + members
  const gross = subscription + u.fees_open_cents
  const discount = Math.round((gross * p.discount_percent) / 100)
  return { base: p.base_cents, modules, users, members, subscription, feesOpen: u.fees_open_cents, discount, total: gross - discount }
}
