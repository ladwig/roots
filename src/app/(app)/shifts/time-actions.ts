"use server"

import { notFound } from "next/navigation"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { getContext, requirePerm } from "@/lib/context"
import { fromLocalInput } from "@/lib/time"
import { back } from "@/lib/url"
import { entryProblem } from "@/shifts/time"

// Time tracking. Staff: own entries via RLS ("own time": until approved). shifts.manage: everyone's entries;
// shifts.approve: approve/reopen months (and correct entries).
const UUID = /^[0-9a-f-]{36}$/
const ret = (fd: FormData, fallback: string) => {
  const r = String(fd.get("return") ?? "")
  return r.startsWith("/shifts") ? r : fallback
}
const without = (path: string, ...keys: string[]) => {
  const u = new URL(path, "http://x")
  keys.forEach((k) => u.searchParams.delete(k))
  return u.pathname + u.search
}

async function selfOrManager() {
  const ctx = await getContext()
  if (!["shifts.self", "shifts.manage", "shifts.approve"].some((p) => ctx.can(p))) notFound()
  return ctx
}

async function me() {
  const ctx = await requirePerm("shifts.self")
  const t = await getT()
  const { data: staffId } = await ctx.supabase.rpc("my_staff_id", { p_org: ctx.org.id })
  if (!ctx.modules.has("shifts") || !staffId) back("/shifts/me", { error: t("shifts.notInTeam") })
  return { ctx, t, staffId: staffId as string }
}

/** Clock in/out without a shift. */
export async function clock(fd: FormData) {
  const { ctx, t, staffId } = await me()
  const { data: running } = await ctx.supabase.from("time_entries").select("id, started_at").eq("staff_id", staffId).is("ended_at", null).maybeSingle()
  const now = new Date()
  const { error } = running
    ? await ctx.supabase.from("time_entries").update({ ended_at: new Date(Math.max(now.getTime(), new Date(running.started_at).getTime() + 60_000)).toISOString() }).eq("id", running.id)
    : await ctx.supabase.from("time_entries").insert({ org_id: ctx.org.id, staff_id: staffId, started_at: now.toISOString(), note: String(fd.get("note") ?? "").trim().slice(0, 500) || null })
  if (error) back("/shifts/me", { error: dbError(t, error) })
  back("/shifts/me", { ok: t(running ? "time.clockedOut" : "time.clockedIn") })
}

/** Create/edit an entry. Managers may pick the person (`staff`); everyone else edits their own (RLS). */
export async function saveEntry(fd: FormData) {
  const ctx = await selfOrManager()
  const t = await getT()
  const here = ret(fd, "/shifts/me")
  const manager = ctx.can("shifts.manage") || ctx.can("shifts.approve")
  const { data: own } = await ctx.supabase.rpc("my_staff_id", { p_org: ctx.org.id })
  const staffArg = String(fd.get("staff") ?? "")
  const staffId = manager && UUID.test(staffArg) ? staffArg : (own as string | null)
  if (!ctx.modules.has("shifts") || !staffId) back(here, { error: t("errors.not_allowed") })
  const started = fromLocalInput(String(fd.get("started_at") ?? ""))
  const endedRaw = String(fd.get("ended_at") ?? "")
  const ended = endedRaw ? fromLocalInput(endedRaw) : null
  const brk = String(fd.get("break_minutes") ?? "").trim()
  const row = {
    started_at: started?.toISOString() ?? "",
    ended_at: ended?.toISOString() ?? null,
    break_minutes: brk === "" ? null : Math.max(0, Math.round(Number(brk)) || 0),
    note: String(fd.get("note") ?? "").trim().slice(0, 500) || null,
  }
  const problem = !started || (endedRaw && !ended) ? "errors.invalid_input" : entryProblem(row)
  if (problem) back(here, { error: t.dynamic(problem) })
  const id = String(fd.get("id") ?? "")
  const { error } = UUID.test(id)
    ? await ctx.supabase.from("time_entries").update(row).eq("id", id).eq("org_id", ctx.org.id)
    : await ctx.supabase.from("time_entries").insert({ ...row, org_id: ctx.org.id, staff_id: staffId })
  if (error) back(here, { error: error.code === "23505" ? t("errors.clock_running") : dbError(t, error) })
  back(without(here, "edit", "new"), { ok: t("time.saved") })
}

export async function deleteEntry(fd: FormData) {
  const ctx = await selfOrManager()
  const t = await getT()
  const here = ret(fd, "/shifts/me")
  const { error, count } = await ctx.supabase.from("time_entries").delete({ count: "exact" }).eq("id", String(fd.get("id") ?? "")).eq("org_id", ctx.org.id)
  if (error || !count) back(here, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  back(without(here, "edit"), { ok: t("time.deleted") })
}

/** Approve (or reopen) one person's finished entries of a month. Approved entries are locked for staff. */
export async function approveMonth(fd: FormData) {
  const ctx = await requirePerm("shifts.approve")
  const t = await getT()
  const staff = String(fd.get("staff") ?? "")
  const month = String(fd.get("month") ?? "")
  const here = ret(fd, "/shifts/hours")
  if (!UUID.test(staff) || !/^\d{4}-\d{2}$/.test(month)) back(here, { error: t("errors.invalid_input") })
  const [y, m] = month.split("-").map(Number)
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`
  const undo = fd.get("undo") === "1"
  let q = ctx.supabase
    .from("time_entries")
    .update({ approved_at: undo ? null : new Date().toISOString() })
    .eq("org_id", ctx.org.id)
    .eq("staff_id", staff)
    .gte("started_at", fromLocalInput(`${month}-01T00:00`)!.toISOString())
    .lt("started_at", fromLocalInput(`${next}-01T00:00`)!.toISOString())
    .not("ended_at", "is", null)
  q = undo ? q.not("approved_at", "is", null) : q.is("approved_at", null)
  const { error } = await q
  if (error) back(here, { error: dbError(t, error) })
  back(here, { ok: t(undo ? "time.reopened" : "time.approved") })
}
