// Cash book entries: one validator for the App form, the API and node --test (pure, relative imports only).
export const SPHERES = ["ideal", "asset", "purpose", "commercial"] as const // ideeller Bereich, Vermögensverwaltung, Zweckbetrieb, wirtschaftl. Geschäftsbetrieb
export type Sphere = (typeof SPHERES)[number]
export const ACCOUNT_KINDS = ["cash", "bank"] as const

export type EntryInput = { direction: string; amount: string; booked_on: string; description: string; category?: string; sphere?: string; counterparty?: string }
export type EntryRow = { booked_on: string; amount_cents: number; description: string; category: string | null; sphere: Sphere | null; counterparty: string | null }

/** Euro text ("12,50", "1.234,5", "12.5") → cents, or null. */
export function cents(raw: string) {
  const v = raw.trim().replace(/\s|€/g, "")
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(v)) return null
  const n = Math.round(Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v) * 100)
  return n > 0 && n < 100_000_000_00 ? n : null
}

/** Form/API input → row (income positive, expense negative) or an error key. */
export function readEntry(i: EntryInput): { row: EntryRow } | { error: string } {
  if (i.direction !== "in" && i.direction !== "out") return { error: "errors.invalid_input" }
  const c = cents(i.amount)
  if (!c) return { error: "cashbook.amountInvalid" }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.booked_on)) return { error: "errors.invalid_date" }
  const description = i.description.trim().slice(0, 300)
  if (!description) return { error: "cashbook.descriptionRequired" }
  const sphere = SPHERES.find((s) => s === i.sphere) ?? null
  return {
    row: {
      booked_on: i.booked_on,
      amount_cents: i.direction === "in" ? c : -c,
      description,
      category: i.category?.trim().slice(0, 100) || null,
      sphere,
      counterparty: i.counterparty?.trim().slice(0, 200) || null,
    },
  }
}
