"use server"

import { redirect } from "next/navigation"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { back } from "@/lib/url"
import { readAbsence, readEmployee, readPrivate } from "@/hr/fields"

const UUID = /^[0-9a-f-]{36}$/
const getter = (fd: FormData) => (k: string) => String(fd.get(k) ?? "")
const ret = (fd: FormData, fallback: string) => {
  const r = String(fd.get("return") ?? "")
  return r.startsWith("/hr") ? r : fallback
}

async function manager() {
  const ctx = await requirePerm("hr.manage")
  const t = await getT()
  if (!ctx.modules.has("hr")) back("/hr", { error: t("errors.not_allowed") })
  return { ctx, t }
}
const fail = (t: Awaited<ReturnType<typeof getT>>, r: { error: string; field?: string }) => (t.has(r.error) ? t.dynamic(r.error) : t("errors.invalid_input"))

/** Create (→ the new page) or update an employee. */
export async function saveEmployee(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const here = UUID.test(id) ? `/hr/${id}` : "/hr?new=employee"
  const r = readEmployee(getter(fd))
  if ("error" in r) back(here, { error: fail(t, r) })
  // Linked to a shift team member → same login (the person sees their own row).
  if (r.row.staff_id) r.row.user_id = (await ctx.supabase.from("staff").select("user_id").eq("id", r.row.staff_id).eq("org_id", ctx.org.id).maybeSingle()).data?.user_id ?? null
  if (UUID.test(id)) {
    const { error } = await ctx.supabase.from("employees").update(r.row).eq("id", id).eq("org_id", ctx.org.id)
    if (error) back(here, { error: error.code === "23505" ? t("hr.staffTaken") : dbError(t, error) })
    back(here, { ok: t("hr.saved") })
  }
  const { data, error } = await ctx.supabase
    .from("employees")
    .insert({ ...r.row, org_id: ctx.org.id })
    .select("id")
    .single()
  if (error) back(here, { error: error.code === "23505" ? t("hr.staffTaken") : dbError(t, error) })
  redirect(`/hr/${data.id}?ok=${encodeURIComponent(t("hr.created"))}`)
}

export async function savePrivate(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("employee_id") ?? "")
  const here = `/hr/${id}#private`
  if (!UUID.test(id)) back("/hr", { error: t("errors.invalid_input") })
  const r = readPrivate(getter(fd))
  if ("error" in r) back(here, { error: fail(t, r) })
  const { error } = await ctx.supabase.from("employee_private").upsert({ ...r.row, org_id: ctx.org.id, employee_id: id }, { onConflict: "employee_id" })
  if (error) back(here, { error: dbError(t, error) })
  back(here, { ok: t("hr.saved") })
}

export async function trashEmployee(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.employees", p_id: id })
  if (error) back(`/hr/${id}`, { error: dbError(t, error) })
  back("/hr", { ok: t("hr.trashed") })
}

export async function restoreEmployee(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.employees", p_id: id })
  if (error) back(`/hr/${id}`, { error: error.code === "23505" ? t("hr.staffTaken") : dbError(t, error) })
  back(`/hr/${id}`, { ok: t("hr.restored") })
}

export async function saveAbsence(fd: FormData) {
  const { ctx, t } = await manager()
  const here = ret(fd, "/hr/absences")
  const employee = String(fd.get("employee_id") ?? "")
  if (!UUID.test(employee)) back(here, { error: t("hr.pickEmployee") })
  const r = readAbsence(getter(fd))
  if ("error" in r) back(here, { error: fail(t, r) })
  const id = String(fd.get("id") ?? "")
  const { error } = UUID.test(id)
    ? await ctx.supabase.from("absences").update({ ...r.row, employee_id: employee }).eq("id", id).eq("org_id", ctx.org.id)
    : await ctx.supabase.from("absences").insert({ ...r.row, employee_id: employee, org_id: ctx.org.id })
  if (error) back(here, { error: dbError(t, error) })
  const clean = new URL(here, "http://x")
  ;["new", "edit"].forEach((k) => clean.searchParams.delete(k))
  back(clean.pathname + clean.search, { ok: t("hr.absenceSaved") })
}

export async function deleteAbsence(fd: FormData) {
  const { ctx, t } = await manager()
  const here = ret(fd, "/hr/absences")
  const { error } = await ctx.supabase.from("absences").delete().eq("id", String(fd.get("id") ?? "")).eq("org_id", ctx.org.id)
  if (error) back(here, { error: dbError(t, error) })
  const clean = new URL(here, "http://x")
  clean.searchParams.delete("edit")
  back(clean.pathname + clean.search, { ok: t("hr.absenceDeleted") })
}
