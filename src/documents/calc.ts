// Document totals (German invoices): line net = round(qty × unit price); tax per rate on the summed net of that rate.
export type Line = { quantity: number; unit_price: number; tax_rate: number }

export const lineNet = (l: Line) => Math.round(l.quantity * l.unit_price)

export function totals(lines: Line[], smallBusiness: boolean) {
  const byRate = new Map<number, number>()
  for (const l of lines) {
    const rate = smallBusiness ? 0 : Number(l.tax_rate)
    byRate.set(rate, (byRate.get(rate) ?? 0) + lineNet(l))
  }
  const taxes = [...byRate]
    .sort(([a], [b]) => b - a)
    .map(([rate, net]) => ({ rate, net, tax: Math.round((net * rate) / 100) }))
  const net = taxes.reduce((s, t) => s + t.net, 0)
  const tax = taxes.reduce((s, t) => s + t.tax, 0)
  return { net, tax, gross: net + tax, taxes: taxes.filter((t) => t.rate > 0) }
}

// Units the system offers (labels in i18n invoices.units.<key>); stored as the key.
export const UNITS = ["flat", "piece", "hour", "minute", "day", "week", "month", "year", "person", "night", "event", "set", "package", "km", "m", "sqm", "cbm", "kg", "t", "liter", "page", "word", "license"] as const
export const TAX_RATES = [19, 7, 0] as const
