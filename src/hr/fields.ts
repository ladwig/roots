// HR input parsing, shared by the App forms and the API (pure; relative imports so node --test can load it).
// `get(key)` returns the raw string ("" = empty). Returns { row } or { error: message key, field }.
import type { TablesUpdate } from "../lib/supabase/types.ts"
import { parsePrice } from "../tickets/price.ts"
import { ibanValid } from "../lib/inputs.ts"

export const EMPLOYMENT_TYPES = ["full_time", "part_time", "minijob", "working_student", "trainee", "freelance", "volunteer", "other"] as const
export const PAY_TYPES = ["hourly", "monthly", "none"] as const
export const ABSENCE_KINDS = ["vacation", "sick", "unpaid", "other"] as const
export const TAX_CLASSES = ["1", "2", "3", "4", "5", "6"] as const

type Get = (key: string) => string
type Result<R> = { row: R } | { error: string; field?: string }
const DAY = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f-]{36}$/
const text = (get: Get, k: string, max: number) => get(k).trim().slice(0, max) || null

export function readEmployee(get: Get): Result<TablesUpdate<"employees"> & { name: string }> {
  const name = text(get, "name", 200)
  if (!name) return { error: "hr.nameMissing", field: "name" }
  const email = text(get, "email", 320)?.toLowerCase() ?? null
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "errors.invalid_email", field: "email" }
  const type = get("employment_type") || "part_time"
  if (!(EMPLOYMENT_TYPES as readonly string[]).includes(type)) return { error: "errors.invalid_input", field: "employment_type" }
  const pay = get("pay_type") || "hourly"
  if (!(PAY_TYPES as readonly string[]).includes(pay)) return { error: "errors.invalid_input", field: "pay_type" }
  const starts = get("starts_on") || null
  const ends = get("ends_on") || null
  if ((starts && !DAY.test(starts)) || (ends && !DAY.test(ends))) return { error: "errors.invalid_input", field: "starts_on" }
  if (starts && ends && ends < starts) return { error: "hr.endBeforeStart", field: "ends_on" }
  const money = (k: string) => (get(k).trim() ? parsePrice(get(k)) : null)
  const rate = money("hourly_rate")
  const salary = money("monthly_salary")
  if ((get("hourly_rate").trim() && rate == null) || (get("monthly_salary").trim() && salary == null)) return { error: "hr.amountInvalid", field: "hourly_rate" }
  const num = (k: string, max: number) => {
    const v = get(k).trim().replace(",", ".")
    if (!v) return null
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 && n <= max ? n : NaN
  }
  const weekly = num("weekly_hours", 80)
  const vacation = num("vacation_days", 365)
  if (Number.isNaN(weekly) || Number.isNaN(vacation)) return { error: "errors.invalid_input", field: "weekly_hours" }
  const ref = (k: string) => (UUID.test(get(k)) ? get(k) : null)
  return {
    row: {
      name,
      email,
      phone: text(get, "phone", 50),
      job_title: text(get, "job_title", 100),
      department: text(get, "department", 100),
      manager_id: ref("manager_id"),
      staff_id: ref("staff_id"),
      user_id: ref("user_id"),
      employment_type: type,
      starts_on: starts,
      ends_on: ends,
      pay_type: pay,
      hourly_rate_cents: rate,
      monthly_salary_cents: salary,
      weekly_hours: weekly,
      vacation_days: vacation,
      notes: text(get, "notes", 5000),
    },
  }
}

export function readPrivate(get: Get): Result<TablesUpdate<"employee_private">> {
  const birthday = get("birthday") || null
  if (birthday && !DAY.test(birthday)) return { error: "errors.invalid_input", field: "birthday" }
  const iban = get("iban").toUpperCase().replace(/\s/g, "") || null
  if (iban && !ibanValid(iban)) return { error: "errors.invalid_iban", field: "iban" }
  const taxId = get("tax_id").replace(/\s/g, "") || null
  if (taxId && !/^[0-9]{11}$/.test(taxId)) return { error: "hr.taxIdInvalid", field: "tax_id" }
  const taxClass = get("tax_class") || null
  if (taxClass && !(TAX_CLASSES as readonly string[]).includes(taxClass)) return { error: "errors.invalid_input", field: "tax_class" }
  const country = get("country").trim().toUpperCase() || null
  if (country && !/^[A-Z]{2}$/.test(country)) return { error: "errors.invalid_input", field: "country" }
  return {
    row: {
      birthday,
      street: text(get, "street", 200),
      postal_code: text(get, "postal_code", 20),
      city: text(get, "city", 100),
      country,
      nationality: text(get, "nationality", 60),
      iban,
      bic: get("bic").toUpperCase().replace(/\s/g, "").slice(0, 11) || null,
      tax_id: taxId,
      tax_class: taxClass,
      social_security_no: get("social_security_no").toUpperCase().replace(/\s/g, "").slice(0, 20) || null,
      health_insurance: text(get, "health_insurance", 100),
      emergency_contact: text(get, "emergency_contact", 300),
    },
  }
}

export function readAbsence(get: Get): Result<{ kind: string; starts_on: string; ends_on: string; half_day: boolean; note: string | null }> {
  const kind = get("kind")
  if (!(ABSENCE_KINDS as readonly string[]).includes(kind)) return { error: "errors.invalid_input", field: "kind" }
  const starts = get("starts_on")
  const ends = get("ends_on") || starts
  if (!DAY.test(starts) || !DAY.test(ends)) return { error: "errors.invalid_input", field: "starts_on" }
  if (ends < starts) return { error: "hr.endBeforeStart", field: "ends_on" }
  const half = get("half_day") === "1" || get("half_day") === "on" || get("half_day") === "true"
  if (half && ends !== starts) return { error: "hr.halfDayOneDay", field: "half_day" }
  return { row: { kind, starts_on: starts, ends_on: ends, half_day: half, note: text(get, "note", 500) } }
}
