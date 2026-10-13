// Loads the KPIs of a period (one RPC; sections the caller may see). Shared by the page and the API.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

type N = number
export type EventRow = { id: string; title: string; starts_at: string; capacity: N | null; sold: N; revenue_cents: N; tickets_in: N; members_in: N; guests_in: N; members_by_type: Record<string, N> }
export type Report = {
  from: string
  to: string
  contacts?: { total: N; new: N }
  members?: {
    active: N; joined: N; left: N; paused: N; fee_free: N
    by_type: { type: string; active: N }[]
    months: { month: string; joined: N; left: N }[]
    dues_open_cents: N; dues_overdue_cents: N; dues_overdue_people: N; dues_paid_cents: N
  }
  events?: { count: N; sold: N; revenue_cents: N; tickets_in: N; members_in: N; guests_in: N; members_by_type: Record<string, N>; list: EventRow[]; tickets: boolean; guests: boolean }
  payments?: { orders: N; gross_cents: N; by_source: Record<string, N> }
  shifts?: { count: N; needed: N; assigned: N; worked_minutes: N }
  forms?: { submissions: N }
  invoices?: { issued: N; issued_cents: N; paid_cents: N; open_cents: N; overdue_cents: N }
  courses?: { courses: N; enrolled: N; waiting: N }
  email?: { sent: N; delivered: N; bounced: N; complained: N }
  cashbook?: { income_cents: N; expense_cents: N; entries: N; by_sphere: Record<string, { income_cents: N; expense_cents: N }>; accounts: { name: string; balance_cents: N }[] }
}

export async function loadReport(db: SupabaseClient<Database>, orgId: string, from: string, to: string) {
  const { data, error } = await db.rpc("report_kpis", { p_org: orgId, p_from: from, p_to: to })
  if (error) throw error
  return data as unknown as Report
}
