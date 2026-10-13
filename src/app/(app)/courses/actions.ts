"use server"

import { redirect } from "next/navigation"
import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { back } from "@/lib/url"
import { readCourse, readSeries, readSession } from "@/courses/fields"

const UUID = /^[0-9a-f-]{36}$/
const getter = (fd: FormData) => (k: string) => String(fd.get(k) ?? "")
const id = (fd: FormData, k = "id") => {
  const v = String(fd.get(k) ?? "")
  return UUID.test(v) ? v : null
}

async function manager() {
  const ctx = await requirePerm("courses.manage")
  const t = await getT()
  if (!ctx.modules.has("courses")) back("/courses", { error: t("errors.not_allowed") })
  return { ctx, t }
}
const msg = (t: Awaited<ReturnType<typeof getT>>, key: string) => (t.has(key) ? t.dynamic(key) : t("errors.invalid_input"))

/** Create (→ its page) or update a course. */
export async function saveCourse(fd: FormData) {
  const { ctx, t } = await manager()
  const courseId = id(fd)
  const here = courseId ? `/courses/${courseId}` : "/courses/new"
  const r = readCourse(getter(fd))
  if ("error" in r) back(here, { error: msg(t, r.error) })
  if (courseId) {
    const { error } = await ctx.supabase.from("courses").update(r.row).eq("id", courseId).eq("org_id", ctx.org.id)
    if (error) back(here, { error: dbError(t, error) })
    deliverSoon() // a bigger course moves people up from the waiting list
    back(here, { ok: t("courses.saved") })
  }
  const { data, error } = await ctx.supabase.from("courses").insert({ ...r.row, org_id: ctx.org.id }).select("id").single()
  if (error) back(here, { error: dbError(t, error) })
  redirect(`/courses/${data.id}?ok=${encodeURIComponent(t("courses.created"))}#dates`)
}

export async function trashCourse(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.courses", p_id: String(fd.get("id") ?? "") })
  if (error) back(`/courses/${fd.get("id")}`, { error: dbError(t, error) })
  back("/courses", { ok: t("courses.trashed") })
}

export async function restoreCourse(fd: FormData) {
  const { ctx, t } = await manager()
  const courseId = String(fd.get("id") ?? "")
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.courses", p_id: courseId })
  if (error) back(`/courses/${courseId}`, { error: dbError(t, error) })
  back(`/courses/${courseId}`, { ok: t("courses.restored") })
}

/** One date, or a weekly series of dates (existing dates at the same start are kept). */
export async function addSessions(fd: FormData) {
  const { ctx, t } = await manager()
  const courseId = id(fd, "course_id")
  const here = `/courses/${courseId}#dates`
  if (!courseId) back("/courses", { error: t("errors.invalid_input") })
  const rows =
    fd.get("mode") === "series"
      ? (() => {
          const r = readSeries(getter(fd), fd.getAll("weekdays").map(String))
          return "error" in r ? r : { row: r.row.dates }
        })()
      : (() => {
          const r = readSession(getter(fd))
          return "error" in r ? r : { row: [r.row] }
        })()
  if ("error" in rows) back(here, { error: msg(t, rows.error) })
  const { data, error } = await ctx.supabase
    .from("course_sessions")
    .upsert(rows.row.map((s) => ({ ...s, org_id: ctx.org.id, course_id: courseId })), { onConflict: "course_id,starts_at", ignoreDuplicates: true })
    .select("id")
  if (error) back(here, { error: dbError(t, error) })
  back(here, { ok: t("courses.datesAdded", { count: data.length }) })
}

export async function updateSession(fd: FormData) {
  const { ctx, t } = await manager()
  const sessionId = id(fd)
  const courseId = id(fd, "course_id")
  const here = `/courses/${courseId}/sessions/${sessionId}`
  const r = readSession(getter(fd))
  if ("error" in r) back(here, { error: msg(t, r.error) })
  const { error } = await ctx.supabase.from("course_sessions").update(r.row).eq("id", sessionId!).eq("org_id", ctx.org.id)
  if (error) back(here, { error: error.code === "23505" ? t("courses.dateTaken") : dbError(t, error) })
  back(here, { ok: t("courses.saved") })
}

export async function deleteSession(fd: FormData) {
  const { ctx, t } = await manager()
  const courseId = id(fd, "course_id")
  const { error } = await ctx.supabase.from("course_sessions").delete().eq("id", String(fd.get("id") ?? "")).eq("org_id", ctx.org.id)
  if (error) back(`/courses/${courseId}#dates`, { error: dbError(t, error) })
  back(`/courses/${courseId}#dates`, { ok: t("courses.dateDeleted") })
}

/** Add a contact; the DB puts them on the waiting list when the course is full. */
export async function addParticipant(fd: FormData) {
  const { ctx, t } = await manager()
  const courseId = id(fd, "course_id")
  const contactId = id(fd, "contact_id")
  const here = `/courses/${courseId}#participants`
  if (!courseId || !contactId) back(here, { error: t("courses.pickContact") })
  // Re-adding someone who cancelled = enrol again (a new place in the waiting order).
  await ctx.supabase.from("course_participants").delete().eq("course_id", courseId).eq("contact_id", contactId).eq("status", "cancelled").eq("org_id", ctx.org.id)
  const { data, error } = await ctx.supabase
    .from("course_participants")
    .insert({ org_id: ctx.org.id, course_id: courseId, contact_id: contactId, note: String(fd.get("note") ?? "").trim().slice(0, 500) || null })
    .select("status")
    .single()
  if (error) back(here, { error: error.code === "23505" ? t("courses.alreadyIn") : dbError(t, error) })
  deliverSoon()
  back(here, { ok: t(data.status === "waiting" ? "courses.addedWaiting" : "courses.added") })
}

/** enrolled/waiting → cancelled (frees the place for the waiting list), or back in. */
export async function setParticipantStatus(fd: FormData) {
  const { ctx, t } = await manager()
  const courseId = id(fd, "course_id")
  const here = `/courses/${courseId}#participants`
  const status = String(fd.get("status") ?? "")
  if (!["enrolled", "cancelled"].includes(status)) back(here, { error: t("errors.invalid_input") })
  const { data, error } = await ctx.supabase.from("course_participants").update({ status }).eq("id", String(fd.get("id") ?? "")).eq("org_id", ctx.org.id).select("status").single()
  if (error) back(here, { error: dbError(t, error) })
  deliverSoon()
  back(here, { ok: t(status === "cancelled" ? "courses.cancelledParticipant" : data.status === "waiting" ? "courses.addedWaiting" : "courses.added") })
}

/** Attendance of one date: the checked participants were there, the others weren't. */
export async function saveAttendance(fd: FormData) {
  const { ctx, t } = await manager()
  const sessionId = id(fd, "session_id")
  const courseId = id(fd, "course_id")
  const here = `/courses/${courseId}/sessions/${sessionId}`
  if (!sessionId || !courseId) back("/courses", { error: t("errors.invalid_input") })
  const present = new Set(fd.getAll("present").map(String))
  const all = fd.getAll("participant").map(String).filter((p) => UUID.test(p))
  const { error } = await ctx.supabase
    .from("course_attendance")
    .upsert(all.map((p) => ({ org_id: ctx.org.id, session_id: sessionId, participant_id: p, present: present.has(p) })), { onConflict: "session_id,participant_id" })
  if (error) back(here, { error: dbError(t, error) })
  back(here, { ok: t("courses.attendanceSaved") })
}
