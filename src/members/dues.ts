// Billing periods and notice dates for memberships. Pure (dates as "YYYY-MM-DD"), shared by actions and tests.
export type Interval = "month" | "quarter" | "half_year" | "year" | "none"
export const INTERVALS: Interval[] = ["month", "quarter", "half_year", "year", "none"]
const MONTHS: Record<Exclude<Interval, "none">, number> = { month: 1, quarter: 3, half_year: 6, year: 12 }

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)
const parts = (s: string) => s.split("-").map(Number) as [number, number, number]

/** Calendar-aligned periods (Jan 1 / quarter / half year / month) whose start lies in [from, to]. */
export function periods(interval: Interval, from: string, to: string) {
  if (interval === "none") return []
  const step = MONTHS[interval]
  const [y, m] = parts(from)
  let month = Math.ceil((m - 1) / step) * step // first aligned month index at or after `from`
  if (iso(y, month, 1) < from) month += step
  const out: { start: string; end: string }[] = []
  for (let i = month; ; i += step) {
    const start = iso(y, i, 1)
    if (start > to) return out
    out.push({ start, end: iso(y, i + step, 0) })
  }
}

/** Does a membership (starts_on..ends_on) overlap the period? */
export const coversPeriod = (m: { starts_on: string; ends_on: string | null }, p: { start: string; end: string }) =>
  m.starts_on <= p.end && (!m.ends_on || m.ends_on >= p.start)

/** Earliest end when cancelling on `today`: notice months later, then to the end of that billing period. */
export function earliestEnd(today: string, noticeMonths: number, interval: Interval) {
  const [y, m, d] = parts(today)
  const after = iso(y, m - 1 + noticeMonths, d)
  if (interval === "none") return after
  const [ay, am] = parts(after)
  const step = MONTHS[interval]
  return iso(ay, Math.floor((am - 1) / step) * step + step, 0)
}

/** Fee for one period; with pro-rata, only the months the membership touches count (joining in November = 2/12). */
export function periodFee(feeCents: number, interval: Interval, p: { start: string; end: string }, m: { starts_on: string; ends_on: string | null }, prorate: boolean) {
  if (!prorate || interval === "none") return feeCents
  const months = periods("month", p.start, p.end)
  const covered = months.filter((x) => coversPeriod(m, x)).length
  return Math.round((feeCents * covered) / months.length)
}
