// HR calculations (pure, tested in pay.test.mjs): absence days, holiday left, gross pay preview with warnings.
// roots prepares payroll, it doesn't do it: no taxes or contributions, the export goes to the tax advisor/payroll tool.
// ponytail: limits per year as constants; add the next year's values each January (warning falls back to the latest).
export const MINIJOB_LIMIT_CENTS: Record<number, number> = { 2025: 55_600, 2026: 60_300 }
export const MIN_WAGE_CENTS: Record<number, number> = { 2025: 1_282, 2026: 1_390 }
const forYear = (table: Record<number, number>, year: number) => table[year] ?? table[Math.max(...Object.keys(table).map(Number).filter((y) => y <= year))] ?? 0

export type Absence = { kind: string; starts_on: string; ends_on: string; half_day: boolean }
export type PayWarning = "minijob_over" | "below_min_wage" | "no_rate"

/** Working days (Mon–Fri) of an absence, optionally only those inside [from, to] (YYYY-MM-DD). Half day = 0.5. */
export function absenceDays(a: Absence, from?: string, to?: string) {
  const start = from && from > a.starts_on ? from : a.starts_on
  const end = to && to < a.ends_on ? to : a.ends_on
  let days = 0
  for (let d = new Date(`${start}T12:00:00Z`); d <= new Date(`${end}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay()
    if (wd !== 0 && wd !== 6) days++
  }
  return a.half_day ? Math.min(days, 0.5) : days
}

/** Holiday taken in a year (vacation only). */
export const vacationTaken = (absences: Absence[], year: number) =>
  absences.filter((a) => a.kind === "vacation").reduce((s, a) => s + absenceDays(a, `${year}-01-01`, `${year}-12-31`), 0)

export type PayInput = { employment_type: string; pay_type: string; hourly_rate_cents: number | null; monthly_salary_cents: number | null }

/** Gross pay preview for a month from approved minutes, with warnings (never blocking). */
export function grossPay(e: PayInput, approvedMinutes: number, year: number) {
  const warnings: PayWarning[] = []
  let gross: number | null = null
  if (e.pay_type === "hourly") {
    if (e.hourly_rate_cents == null) warnings.push("no_rate")
    else gross = Math.round((approvedMinutes / 60) * e.hourly_rate_cents)
  } else if (e.pay_type === "monthly") {
    if (e.monthly_salary_cents == null) warnings.push("no_rate")
    else gross = e.monthly_salary_cents
  }
  const paid = !["volunteer", "freelance", "trainee"].includes(e.employment_type)
  if (paid && e.pay_type === "hourly" && e.hourly_rate_cents != null && e.hourly_rate_cents < forYear(MIN_WAGE_CENTS, year)) warnings.push("below_min_wage")
  if (e.employment_type === "minijob" && gross != null && gross > forYear(MINIJOB_LIMIT_CENTS, year)) warnings.push("minijob_over")
  return { gross, warnings }
}
