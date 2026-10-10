"use server"

import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { fromLocalInput } from "@/lib/time"
import { back } from "@/lib/url"
import { generateSeries } from "@/shifts/server"

const UUID = /^[0-9a-f-]{36}$/
const str = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max) || null
const id = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "")
  return UUID.test(v) ? v : null
}
const ret = (fd: FormData, fallback: string) => {
  const r = String(fd.get("return") ?? "")
  return r.startsWith("/shifts") ? r : fallback
}

async function manager() {
  const ctx = await requirePerm("shifts.manage")
  const t = await getT()
  if (!ctx.modules.has("shifts")) back("/shifts", { error: t("errors.not_allowed") })
  return { ctx, t }
}

// --- Shifts -------------------------------------------------------------------------------------
export async function saveShift(fd: FormData) {
  const { ctx, t } = await manager()
  const shiftId = id(fd, "id")
  const back_ = ret(fd, "/shifts")
  const retry = `${back_}${back_.includes("?") ? "&" : "?"}${shiftId ? `shift=${shiftId}` : "new=shift"}`
  const starts = fromLocalInput(String(fd.get("starts_at") ?? ""))
  const ends = fromLocalInput(String(fd.get("ends_at") ?? ""))
  const needed = Number(fd.get("needed") ?? 1)
  if (!starts || !ends) back(retry, { error: t("errors.invalid_time") })
  if (ends <= starts) back(retry, { error: t("errors.end_before_start") })
  if (!(Number.isInteger(needed) && needed >= 1 && needed <= 100)) back(retry, { error: t("errors.invalid_input") })
  const row = {
    title: str(fd, "title", 100),
    position_id: id(fd, "position"),
    location_id: id(fd, "location"),
    event_id: id(fd, "event"),
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    needed,
    open: fd.get("open") === "1",
    notes: str(fd, "notes", 2000),
  }
  if (!row.title && !row.position_id) back(retry, { error: t("shifts.needTitle") })
  const { error } = shiftId
    ? await ctx.supabase.from("shifts").update(row).eq("id", shiftId).eq("org_id", ctx.org.id)
    : await ctx.supabase.from("shifts").insert({ ...row, org_id: ctx.org.id })
  if (error) back(retry, { error: dbError(t, error) })
  back(back_, { ok: t("shifts.saved") })
}

export async function deleteShift(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.from("shifts").delete().eq("id", String(fd.get("id"))).eq("org_id", ctx.org.id)
  if (error) back(ret(fd, "/shifts"), { error: dbError(t, error) })
  back(ret(fd, "/shifts"), { ok: t("shifts.deleted") })
}

// Assign a person, approve an application, remove, or set check-in/out by hand.
export async function assign(fd: FormData) {
  const { ctx, t } = await manager()
  const shift = id(fd, "id")
  const staff = id(fd, "staff")
  const back_ = `${ret(fd, "/shifts")}${ret(fd, "/shifts").includes("?") ? "&" : "?"}shift=${shift}`
  if (!shift || !staff) back(back_, { error: t("errors.invalid_input") })
  const what = String(fd.get("what") ?? "assign")
  const q = ctx.supabase.from("shift_assignments")
  const { error } =
    what === "remove"
      ? await q.delete().eq("shift_id", shift).eq("staff_id", staff).eq("org_id", ctx.org.id)
      : what === "check_in"
        ? await q.update({ checked_in_at: new Date().toISOString() }).eq("shift_id", shift).eq("staff_id", staff).eq("org_id", ctx.org.id)
        : what === "check_out"
          ? await q.update({ checked_out_at: new Date().toISOString() }).eq("shift_id", shift).eq("staff_id", staff).eq("org_id", ctx.org.id)
          : await q.upsert({ org_id: ctx.org.id, shift_id: shift, staff_id: staff, status: "assigned" }, { onConflict: "shift_id,staff_id" })
  if (error) back(back_, { error: dbError(t, error) })
  deliverSoon()
  back(back_, { ok: t.dynamic(`shifts.done.${what}`) })
}

// --- Team ---------------------------------------------------------------------------------------
export async function saveStaff(fd: FormData) {
  const { ctx, t } = await manager()
  const staffId = id(fd, "id")
  const retry = `/shifts/team?${staffId ? `edit=${staffId}` : "new=staff"}`
  const user = id(fd, "user")
  const targetRaw = String(fd.get("target_hours") ?? "").trim().replace(",", ".")
  const target = targetRaw ? Number(targetRaw) : null
  if ((!staffId && !user) || (target !== null && !(target >= 0 && target < 1000))) back(retry, { error: t("errors.invalid_input") })
  // Team = organisation members: name and email come from the member's profile.
  const row = {
    role_label: str(fd, "role_label", 100),
    target_hours: target,
    position_ids: fd.getAll("positions").map(String).filter((v) => UUID.test(v)),
    active: fd.getAll("active").includes("1"),
  }
  if (staffId) {
    const { error } = await ctx.supabase.from("staff").update(row).eq("id", staffId).eq("org_id", ctx.org.id)
    if (error) back(retry, { error: dbError(t, error) })
  } else {
    const { data: member } = await ctx.supabase.from("org_members").select("user_id").eq("org_id", ctx.org.id).eq("user_id", user!).maybeSingle()
    const { data: profile } = await ctx.supabase.from("profiles").select("full_name, email").eq("id", user!).maybeSingle()
    if (!member) back(retry, { error: t("errors.not_allowed") })
    const { error } = await ctx.supabase.from("staff").insert({ ...row, org_id: ctx.org.id, user_id: user!, name: profile?.full_name || profile?.email || "–", email: profile?.email ?? null })
    if (error) back(retry, { error: error.code === "23505" ? t("shifts.memberTaken") : dbError(t, error) })
  }
  back("/shifts/team", { ok: t("shifts.saved") })
}

// --- Setup: positions + recurring series --------------------------------------------------------
export async function savePosition(fd: FormData) {
  const { ctx, t } = await manager()
  const posId = id(fd, "id")
  const name = str(fd, "name", 100)
  const needed = Number(fd.get("needed") ?? 1)
  if (!name || !(Number.isInteger(needed) && needed >= 1 && needed <= 100)) back("/shifts/setup", { error: t("errors.invalid_input") })
  const row = { name, needed, location_id: id(fd, "location") }
  const { error } = posId
    ? await ctx.supabase.from("positions").update(row).eq("id", posId).eq("org_id", ctx.org.id)
    : await ctx.supabase.from("positions").insert({ ...row, org_id: ctx.org.id })
  if (error) back("/shifts/setup", { error: dbError(t, error) })
  back("/shifts/setup", { ok: t("shifts.saved") })
}

export async function deletePosition(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.from("positions").delete().eq("id", String(fd.get("id"))).eq("org_id", ctx.org.id)
  if (error) back("/shifts/setup", { error: dbError(t, error) })
  back("/shifts/setup", { ok: t("shifts.deleted") })
}

export async function saveSeries(fd: FormData) {
  const { ctx, t } = await manager()
  const seriesId = id(fd, "id")
  const retry = `/shifts/setup?${seriesId ? `series=${seriesId}` : "new=series"}`
  const weekdays = fd.getAll("weekdays").map(Number).filter((d) => d >= 1 && d <= 7)
  const every = Number(fd.get("every_weeks") ?? 1)
  const start = String(fd.get("start_date") ?? "")
  const end = String(fd.get("end_date") ?? "") || null
  const time = (k: string) => {
    const v = String(fd.get(k) ?? "")
    return /^\d{2}:\d{2}$/.test(v) ? v : null
  }
  const needed = Number(fd.get("needed") ?? 1)
  const [st, et] = [time("start_time"), time("end_time")]
  if (!weekdays.length || !(every >= 1 && every <= 8) || !/^\d{4}-\d{2}-\d{2}$/.test(start) || (end && end < start) || !st || !et || st === et || !(needed >= 1 && needed <= 100))
    back(retry, { error: t("errors.invalid_input") })
  const row = {
    name: str(fd, "name", 100),
    position_id: id(fd, "position"),
    location_id: id(fd, "location"),
    weekdays,
    every_weeks: every,
    start_date: start,
    end_date: end,
    start_time: st!,
    end_time: et!,
    needed,
    default_staff: fd.getAll("default_staff").map(String).filter((v) => UUID.test(v)),
  }
  if (!row.name && !row.position_id) back(retry, { error: t("shifts.needTitle") })
  let sid = seriesId
  if (seriesId) {
    // Changing the rhythm: future generated shifts without anyone checked in are rebuilt.
    const { error } = await ctx.supabase.from("shift_series").update({ ...row, generated_until: null }).eq("id", seriesId).eq("org_id", ctx.org.id)
    if (error) back(retry, { error: dbError(t, error) })
    await ctx.supabase.from("shifts").delete().eq("series_id", seriesId).gt("starts_at", new Date().toISOString())
  } else {
    const { data, error } = await ctx.supabase.from("shift_series").insert({ ...row, org_id: ctx.org.id }).select("id").single()
    if (error) back(retry, { error: dbError(t, error) })
    sid = data.id
  }
  const n = await generateSeries(sid!)
  back("/shifts/setup", { ok: t("shifts.generated", { count: n }) })
}

export async function deleteSeries(fd: FormData) {
  const { ctx, t } = await manager()
  const seriesId = String(fd.get("id"))
  await ctx.supabase.from("shifts").delete().eq("series_id", seriesId).gt("starts_at", new Date().toISOString())
  const { error } = await ctx.supabase.from("shift_series").delete().eq("id", seriesId).eq("org_id", ctx.org.id)
  if (error) back("/shifts/setup", { error: dbError(t, error) })
  back("/shifts/setup", { ok: t("shifts.deleted") })
}

// --- Self-service (logged-in staff) -------------------------------------------------------------
export async function selfAction(fd: FormData) {
  const ctx = await requirePerm("shifts.self")
  const t = await getT()
  const action = String(fd.get("action"))
  const { error } = await ctx.supabase.rpc("shift_self", { p_action: action, p_shift: String(fd.get("shift")) })
  if (error) back("/shifts/me", { error: dbError(t, error) })
  deliverSoon()
  back("/shifts/me", { ok: t.dynamic(`shifts.self.${action}`) })
}

// --- Locations (core settings) ------------------------------------------------------------------
export async function saveLocation(fd: FormData) {
  const ctx = await requirePerm("org.settings.manage")
  const t = await getT()
  const locId = id(fd, "id")
  const name = str(fd, "name", 100)
  if (!name) back("/settings/locations", { error: t("errors.invalid_input") })
  const row = { name, address: str(fd, "address", 500), notes: str(fd, "notes", 2000) }
  const { error } = locId
    ? await ctx.supabase.from("locations").update(row).eq("id", locId).eq("org_id", ctx.org.id)
    : await ctx.supabase.from("locations").insert({ ...row, org_id: ctx.org.id })
  if (error) back("/settings/locations", { error: dbError(t, error) })
  back("/settings/locations", { ok: t("shifts.saved") })
}

export async function deleteLocation(fd: FormData) {
  const ctx = await requirePerm("org.settings.manage")
  const t = await getT()
  const { error } = await ctx.supabase.from("locations").delete().eq("id", String(fd.get("id"))).eq("org_id", ctx.org.id)
  if (error) back("/settings/locations", { error: dbError(t, error) })
  back("/settings/locations", { ok: t("shifts.deleted") })
}

// Calendar drag & drop: move a shift (same duration or resized). Returns an error text instead of redirecting.
export async function moveShift(shiftId: string, start: string, end: string): Promise<{ error?: string }> {
  const ctx = await requirePerm("shifts.manage")
  const t = await getT()
  const s = new Date(start), e = new Date(end)
  if (!UUID.test(shiftId) || isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) return { error: t("errors.invalid_time") }
  const { error } = await ctx.supabase.from("shifts").update({ starts_at: s.toISOString(), ends_at: e.toISOString() }).eq("id", shiftId).eq("org_id", ctx.org.id)
  return error ? { error: dbError(t, error) } : {}
}
