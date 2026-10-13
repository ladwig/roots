// Report periods: presets or a custom range, as Berlin days (YYYY-MM-DD, `to` inclusive). Pure, shared by the page,
// the API and node --test.
export const PRESETS = ["30d", "month", "last_month", "quarter", "year", "last_year"] as const
export type Preset = (typeof PRESETS)[number]

const DAY = /^\d{4}-\d{2}-\d{2}$/
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)

/** Preset (default "month") or custom from/to (max. 10 years, swapped if reversed). */
export function period(today: string, preset?: string | null, from?: string | null, to?: string | null): { preset: Preset | "custom"; from: string; to: string } {
  if (from && to && DAY.test(from) && DAY.test(to)) {
    const [a, b] = from <= to ? [from, to] : [to, from]
    if (Number(b.slice(0, 4)) - Number(a.slice(0, 4)) <= 10) return { preset: "custom", from: a, to: b }
  }
  const p = (PRESETS as readonly string[]).includes(preset ?? "") ? (preset as Preset) : "month"
  const [y, m, d] = today.split("-").map(Number)
  const q = Math.floor((m - 1) / 3) * 3
  const range: Record<Preset, [string, string]> = {
    "30d": [iso(y, m - 1, d - 29), today],
    month: [iso(y, m - 1, 1), iso(y, m, 0)],
    last_month: [iso(y, m - 2, 1), iso(y, m - 1, 0)],
    quarter: [iso(y, q, 1), iso(y, q + 3, 0)],
    year: [`${y}-01-01`, `${y}-12-31`],
    last_year: [`${y - 1}-01-01`, `${y - 1}-12-31`],
  }
  return { preset: p, from: range[p][0], to: range[p][1] }
}
