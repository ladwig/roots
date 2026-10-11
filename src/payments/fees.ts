// roots' cut per order, in cents: PLATFORM_FEE_PERCENT (e.g. "1.5") of the total + PLATFORM_FEE_FIXED_CENTS.
// Never more than the order itself. Pure, so it's testable without env: pass the config explicitly.
// ponytail: one platform-wide rate; per-org/plan pricing goes into orgs.settings when plans exist.
export type FeeConfig = { percent: number; fixedCents: number }

export const feeConfig = (): FeeConfig => ({
  percent: Number(process.env.PLATFORM_FEE_PERCENT ?? 0) || 0,
  fixedCents: Math.round(Number(process.env.PLATFORM_FEE_FIXED_CENTS ?? 0) || 0),
})

export function applicationFee(amountCents: number, cfg: FeeConfig): number {
  if (amountCents <= 0) return 0
  const fee = Math.round((amountCents * cfg.percent) / 100) + cfg.fixedCents
  return Math.min(Math.max(fee, 0), amountCents)
}
