// Rentals ("Vermietung"): families, kinds, units, form/API parsing and the state of a rental. Pure (relative imports
// only), shared by the App forms, the API and node --test.
import { moneyCents } from "../lib/inputs.ts"

/** The family decides behaviour (rentable with rates vs. handed out with a deposit, calendar, wording). */
export const FAMILIES = ["place", "vehicle", "item", "access", "other"] as const
export type Family = (typeof FAMILIES)[number]

/** Kinds per family (labels: rentals.kinds.<kind>); any other text is a custom kind of family "other". */
export const KINDS: Record<Family, string[]> = {
  place: ["building", "floor", "room", "studio", "atelier", "rehearsal_room", "office", "desk", "flat", "hall", "storage", "outdoor", "parking", "locker"],
  vehicle: ["car", "van", "bike", "trailer", "boat"],
  item: ["device", "tech", "instrument", "tool", "furniture", "tent", "costume", "sports", "media"],
  access: ["key", "transponder", "card"],
  other: [],
}
export const familyOf = (kind: string): Family => FAMILIES.find((f) => KINDS[f].includes(kind)) ?? "other"

/** Defaults when an object of this family is created: rentable (rates) or handed out (deposit). */
export const FAMILY_DEFAULTS: Record<Family, { rentable: boolean; lendable: boolean }> = {
  place: { rentable: true, lendable: false },
  vehicle: { rentable: true, lendable: false },
  item: { rentable: true, lendable: true },
  access: { rentable: false, lendable: true },
  other: { rentable: true, lendable: false },
}

export const UNITS = ["hour", "day", "week", "month", "year", "once"] as const
export type Unit = (typeof UNITS)[number]
/** Long term = billed per month/year, open-ended or with a term; short term = a fixed range. */
export const longTerm = (unit: string | null | undefined) => unit === "month" || unit === "year"

/** What a rental of this object is called: Mietvertrag, Buchung, Ausleihe, Ausgabe (rentals.words.<word>). */
export function wordFor(family: Family, unit?: string | null): "contract" | "booking" | "loan" | "handout" {
  if (family === "access") return "handout"
  if (longTerm(unit)) return "contract"
  return family === "item" ? "loan" : "booking"
}

const UUID = /^[0-9a-f-]{36}$/
type Get = (key: string) => string
const str = (get: Get, key: string, max: number) => get(key).trim().slice(0, max)
const int = (raw: string, min: number, max: number) => {
  if (!raw.trim()) return null
  const n = Number(raw)
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined
}
const money = (raw: string) => (raw.trim() ? (moneyCents(raw) ?? undefined) : null)

export type ObjectRow = { name: string; kind: string; family: Family; parent_id: string | null; rentable: boolean; lendable: boolean; included: boolean; capacity: number; deposit_cents: number | null; location_id: string | null; description: string; status: "active" | "inactive" | "lost" }

/** Object form/API → row, or an error key. */
export function readObject(get: Get): { row: ObjectRow } | { error: string; field?: string } {
  const name = str(get, "name", 200)
  if (!name) return { error: "rentals.nameRequired", field: "name" }
  const kind = str(get, "kind", 40) || "other"
  const capacity = int(get("capacity"), 1, 10000)
  if (capacity === undefined) return { error: "errors.invalid_input", field: "capacity" }
  const deposit = money(get("deposit"))
  if (deposit === undefined) return { error: "inputs.invalid.money", field: "deposit" }
  const parent = get("parent_id")
  const location = get("location_id")
  const status = (["active", "inactive", "lost"] as const).find((s) => s === get("status")) ?? "active"
  return {
    row: {
      name,
      kind,
      family: familyOf(kind),
      parent_id: UUID.test(parent) ? parent : null,
      rentable: get("rentable") === "on" || get("rentable") === "true",
      lendable: get("lendable") === "on" || get("lendable") === "true",
      included: get("included") === "on" || get("included") === "true",
      capacity: capacity ?? 1,
      deposit_cents: deposit,
      location_id: UUID.test(location) ? location : null,
      description: str(get, "description", 20000),
      status,
    },
  }
}

export type RateRow = { name: string; unit: Unit; price_cents: number; min_units: number; term_months: number | null; renew_months: number | null; notice_months: number | null; deposit_cents: number | null; active: boolean }

export function readRate(get: Get): { row: RateRow } | { error: string; field?: string } {
  const name = str(get, "name", 100)
  if (!name) return { error: "rentals.nameRequired", field: "name" }
  const unit = UNITS.find((u) => u === get("unit"))
  if (!unit) return { error: "errors.invalid_input", field: "unit" }
  const price = money(get("price")) ?? 0
  const deposit = money(get("deposit"))
  const min = int(get("min_units"), 1, 1000)
  const term = int(get("term_months"), 1, 600)
  const renew = int(get("renew_months"), 1, 600)
  const notice = int(get("notice_months"), 0, 60)
  if (price === undefined || deposit === undefined) return { error: "inputs.invalid.money", field: "price" }
  if ([min, term, renew, notice].includes(undefined)) return { error: "errors.invalid_input" }
  return {
    row: {
      name,
      unit,
      price_cents: price,
      min_units: min ?? 1,
      term_months: longTerm(unit) ? (term ?? null) : null,
      renew_months: longTerm(unit) ? (renew ?? null) : null,
      notice_months: longTerm(unit) ? (notice ?? null) : null,
      deposit_cents: deposit ?? null,
      active: get("active") !== "off",
    },
  }
}

export type RentalRow = { starts_at: string; ends_at: string | null; status: "request" | "confirmed" | "cancelled"; price_cents: number | null; unit: Unit | null; renew_months: number | null; notice_months: number | null; deposit_cents: number | null; note: string }

/** Rental form/API → row (times as ISO strings, already converted from Berlin local by the caller), or an error key. */
export function readRental(get: Get): { row: RentalRow } | { error: string; field?: string } {
  const starts = get("starts_at")
  const ends = get("ends_at")
  if (!starts || Number.isNaN(Date.parse(starts))) return { error: "errors.invalid_date", field: "starts_at" }
  if (ends && (Number.isNaN(Date.parse(ends)) || Date.parse(ends) <= Date.parse(starts))) return { error: "rentals.endBeforeStart", field: "ends_at" }
  const unit = UNITS.find((u) => u === get("unit")) ?? null
  const price = money(get("price"))
  const deposit = money(get("deposit"))
  const renew = int(get("renew_months"), 1, 600)
  const notice = int(get("notice_months"), 0, 60)
  if (price === undefined || deposit === undefined) return { error: "inputs.invalid.money", field: "price" }
  if (renew === undefined || notice === undefined) return { error: "errors.invalid_input" }
  if (renew && !ends) return { error: "rentals.renewNeedsEnd", field: "ends_at" }
  const status = (["request", "confirmed", "cancelled"] as const).find((s) => s === get("status")) ?? "confirmed"
  return { row: { starts_at: new Date(starts).toISOString(), ends_at: ends ? new Date(ends).toISOString() : null, status, price_cents: price, unit, renew_months: renew ?? null, notice_months: notice ?? null, deposit_cents: deposit ?? null, note: str(get, "note", 20000) } }
}

/** Where a rental stands at `now`: upcoming, running (and whether it ends soon), ended, request, cancelled. */
export function rentalState(r: { status: string; starts_at: string; ends_at: string | null }, now = new Date()): "request" | "cancelled" | "upcoming" | "running" | "ended" {
  if (r.status === "request" || r.status === "cancelled") return r.status
  if (Date.parse(r.starts_at) > now.getTime()) return "upcoming"
  if (r.ends_at && Date.parse(r.ends_at) <= now.getTime()) return "ended"
  return "running"
}

/**
 * Earliest end when giving notice today (open-ended or renewing contracts): notice months from today, to the end of
 * that month; a fixed term that ends later wins. YYYY-MM-DD.
 */
export function noticeEnd(r: { ends_at: string | null; notice_months: number | null }, today: string) {
  const [y, m] = today.split("-").map(Number)
  const months = y * 12 + (m - 1) + (r.notice_months ?? 0)
  const last = new Date(Date.UTC(Math.floor(months / 12), (months % 12) + 1, 0)).toISOString().slice(0, 10)
  const end = r.ends_at?.slice(0, 10)
  return end && end > last ? end : last
}
