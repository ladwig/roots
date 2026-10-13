// HR, server side: the payroll preview per month (page, export and API share it). Takes the caller's client
// (session client in the App, the key-scoped client in the API); every query filters by org.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { minutes } from "@/shifts/time"
import { absenceDays, grossPay, type PayWarning } from "./pay"

type Db = SupabaseClient<Database>
export type PayrollRow = {
  employee_id: string
  name: string
  employment_type: string
  pay_type: string
  hourly_rate_cents: number | null
  monthly_salary_cents: number | null
  approved_minutes: number
  unapproved_entries: number
  vacation_days: number
  sick_days: number
  other_absence_days: number
  gross_cents: number | null
  warnings: PayWarning[]
}

/** Everyone employed in the month: approved hours (via the linked shift team member), absences, gross preview. */
export async function payrollMonth(db: Db, orgId: string, month: { month: string; from: string; to: string }) {
  const first = `${month.month}-01`
  const lastDay = new Date(Date.UTC(Number(month.month.slice(0, 4)), Number(month.month.slice(5, 7)), 0)).toISOString().slice(0, 10)
  const [{ data: employees }, { data: entries }, { data: absences }] = await Promise.all([
    db
      .from("employees")
      .select("id, name, staff_id, employment_type, pay_type, hourly_rate_cents, monthly_salary_cents, starts_on, ends_on")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .or(`starts_on.is.null,starts_on.lte.${lastDay}`)
      .or(`ends_on.is.null,ends_on.gte.${first}`)
      .order("name"),
    db.from("time_entries").select("id, staff_id, started_at, ended_at, break_minutes, approved_at").eq("org_id", orgId).not("ended_at", "is", null).gte("started_at", month.from).lt("started_at", month.to),
    db.from("absences").select("employee_id, kind, starts_on, ends_on, half_day").eq("org_id", orgId).lte("starts_on", lastDay).gte("ends_on", first),
  ])
  const year = Number(month.month.slice(0, 4))
  return (employees ?? []).map((e): PayrollRow => {
    const mine = (entries ?? []).filter((x) => e.staff_id && x.staff_id === e.staff_id)
    const approved = mine.filter((x) => x.approved_at).reduce((s, x) => s + minutes(x).net, 0)
    const abs = (absences ?? []).filter((a) => a.employee_id === e.id)
    const days = (kinds: string[]) => abs.filter((a) => kinds.includes(a.kind)).reduce((s, a) => s + absenceDays(a, first, lastDay), 0)
    const pay = grossPay(e, approved, year)
    return {
      employee_id: e.id,
      name: e.name,
      employment_type: e.employment_type,
      pay_type: e.pay_type,
      hourly_rate_cents: e.hourly_rate_cents,
      monthly_salary_cents: e.monthly_salary_cents,
      approved_minutes: approved,
      unapproved_entries: mine.filter((x) => !x.approved_at).length,
      vacation_days: days(["vacation"]),
      sick_days: days(["sick"]),
      other_absence_days: days(["unpaid", "other"]),
      gross_cents: pay.gross,
      warnings: pay.warnings,
    }
  })
}
