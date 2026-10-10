// Shift planning, server side: generating recurring shifts and the self-service view (own shifts, open shifts, hours).
// Service role: callers resolve the staff row first (the signed-in member's own row).
import { createAdminClient } from "@/lib/supabase/admin"
import { occurrences, workedMinutes } from "./series"

const db = () => createAdminClient()
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
const plusDays = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10)
export const GENERATE_WEEKS = 8

/** Create the series' shifts up to N weeks ahead (idempotent: unique per series + start), with its fixed people. */
export async function generateSeries(seriesId: string, weeks = GENERATE_WEEKS) {
  const { data: s } = await db().from("shift_series").select("*").eq("id", seriesId).single()
  if (!s) return 0
  const until = plusDays(today(), weeks * 7)
  const from = s.generated_until && s.generated_until >= today() ? plusDays(s.generated_until, 1) : today()
  const occ = occurrences(s, from, until)
  if (occ.length) {
    const { data: created, error } = await db()
      .from("shifts")
      .upsert(
        occ.map((o) => ({ org_id: s.org_id, series_id: s.id, location_id: s.location_id, position_id: s.position_id, title: s.name, starts_at: o.starts_at, ends_at: o.ends_at, needed: s.needed })),
        { onConflict: "series_id,starts_at", ignoreDuplicates: true },
      )
      .select("id")
    if (error) throw error
    const rows = (created ?? []).flatMap((sh) => s.default_staff.map((staff_id) => ({ org_id: s.org_id, shift_id: sh.id, staff_id, status: "assigned" })))
    if (rows.length) await db().from("shift_assignments").upsert(rows, { onConflict: "shift_id,staff_id", ignoreDuplicates: true })
  }
  await db().from("shift_series").update({ generated_until: until }).eq("id", s.id)
  return occ.length
}

/** Keep every series N weeks ahead (cron). */
export async function generateAllSeries() {
  const { data } = await db().from("shift_series").select("id").or(`end_date.is.null,end_date.gte.${today()}`).or(`generated_until.is.null,generated_until.lt.${plusDays(today(), GENERATE_WEEKS * 7 - 7)}`)
  for (const s of data ?? []) await generateSeries(s.id)
}

export type SelfShift = {
  id: string
  title: string | null
  starts_at: string
  ends_at: string
  position: string | null
  location: string | null
  event: string | null
  status?: string
  checked_in_at?: string | null
  checked_out_at?: string | null
  free?: number
}

/** Everything a staff member sees about themselves: own shifts, open shifts to apply for, hours this month. */
export async function selfView(staffId: string) {
  const { data: me } = await db().from("staff").select("id, org_id, name, target_hours, position_ids").eq("id", staffId).single()
  if (!me) return null
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const soon = new Date(now.getTime() + 45 * 86_400_000).toISOString()
  const cols = "id, title, starts_at, ends_at, needed, open, position_id, positions(name), locations(name), events(title)"
  const [{ data: mine }, { data: open }] = await Promise.all([
    db().from("shift_assignments").select(`status, checked_in_at, checked_out_at, shifts!inner(${cols})`).eq("staff_id", staffId).gte("shifts.ends_at", monthStart).order("created_at"),
    db().from("shifts").select(`${cols}, shift_assignments(staff_id, status)`).eq("org_id", me.org_id).eq("open", true).gte("starts_at", now.toISOString()).lte("starts_at", soon).order("starts_at").limit(100),
  ])
  const shape = (s: { id: string; title: string | null; starts_at: string; ends_at: string; positions: { name: string } | null; locations: { name: string } | null; events: { title: string } | null }): SelfShift => ({
    id: s.id,
    title: s.title,
    starts_at: s.starts_at,
    ends_at: s.ends_at,
    position: s.positions?.name ?? null,
    location: s.locations?.name ?? null,
    event: s.events?.title ?? null,
  })
  const own = (mine ?? []).map((a) => ({ ...shape(a.shifts), status: a.status, checked_in_at: a.checked_in_at, checked_out_at: a.checked_out_at })).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const mineIds = new Set(own.map((s) => s.id))
  const qualified = (pos: string | null) => !me.position_ids.length || !pos || me.position_ids.includes(pos)
  const openShifts = (open ?? [])
    .filter((s) => !mineIds.has(s.id) && qualified(s.position_id))
    .map((s) => ({ ...shape(s), free: s.needed - s.shift_assignments.filter((a) => a.status === "assigned").length }))
    .filter((s) => s.free > 0)
  const minutes = own.filter((s) => s.status === "assigned").reduce((sum, s) => sum + workedMinutes({ checked_in_at: s.checked_in_at ?? null, checked_out_at: s.checked_out_at ?? null }, s.ends_at), 0)
  return { me, own: own.filter((s) => s.ends_at >= now.toISOString() || (s.checked_in_at && !s.checked_out_at)), openShifts, hours: minutes / 60 }
}
