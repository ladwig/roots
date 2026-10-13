"use server"

import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError, type T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { back } from "@/lib/url"
import { parseTags } from "@/app/(app)/contacts/fields"
import { createTask, moveTask, saveStatus, setAssignees, updateTask, type ProjectFail } from "@/projects/server"

const UUID = /^[0-9a-f-]{36}$/
const SETUP = "/projects/setup"
const id = (fd: FormData, key: string) => (UUID.test(String(fd.get(key) ?? "")) ? String(fd.get(key)) : null)
const message = (t: T, f: ProjectFail) => (f.db ? dbError(t, f.db) : t.dynamic(f.error))
// Where the form came from (board / list / page), only App paths under /projects.
const backTo = (fd: FormData, fallback: string) => {
  const b = String(fd.get("back") ?? "")
  return b.startsWith("/projects") ? b : fallback
}

async function manager() {
  const ctx = await requirePerm("projects.manage")
  const t = await getT()
  if (!ctx.modules.has("projects")) back("/projects", { error: t("errors.not_allowed") })
  return { ctx, t }
}

/** Quick add at the bottom of a board column (or the list). */
export async function createTaskAction(fd: FormData) {
  const { ctx, t } = await manager()
  const to = backTo(fd, "/projects")
  const r = await createTask(ctx.supabase, ctx.org.id, { title: String(fd.get("title") ?? ""), statusId: id(fd, "status_id"), tags: parseTags(String(fd.get("tags") ?? "")) })
  if ("error" in r) back(to, { error: message(t, r) })
  deliverSoon()
  // Open the new task's panel right away (assignees, due date, …).
  const url = new URL(to, "http://x")
  url.searchParams.set("task", r.id)
  back(url.pathname + url.search, {})
}

/** The task panel saves itself (AutosaveForm): fields, status, assignees. */
export async function autosaveTaskAction(fd: FormData): Promise<{ error?: string }> {
  const { ctx, t } = await manager()
  const task = id(fd, "id") ?? ""
  const r = await updateTask(ctx.supabase, ctx.org.id, task, {
    title: String(fd.get("title") ?? ""),
    description: String(fd.get("description") ?? ""),
    due_on: String(fd.get("due_on") ?? "") || null,
    tags: parseTags(String(fd.get("tags") ?? "")),
    statusId: id(fd, "status_id") ?? undefined,
  })
  if ("error" in r) return { error: message(t, r) }
  const a = await setAssignees(ctx.supabase, ctx.org.id, task, fd.getAll("assignees").map(String).filter((u) => UUID.test(u)))
  if ("error" in a) return { error: message(t, a) }
  deliverSoon()
  return {}
}

/** Board drag & drop (called from the board). */
export async function moveTaskAction(input: { id: string; statusId: string; order: string[] }): Promise<{ error?: string }> {
  const { ctx, t } = await manager()
  if (!UUID.test(input.id) || !UUID.test(input.statusId)) return { error: t("errors.invalid_input") }
  const r = await moveTask(ctx.supabase, ctx.org.id, input.id, input.statusId, input.order.filter((x) => UUID.test(x)))
  deliverSoon()
  return "error" in r ? { error: message(t, r) } : {}
}

/** Checklist (ticks and rows save at once). */
export async function saveChecklistAction(input: { id: string; checklist: unknown }): Promise<{ error?: string }> {
  const { ctx, t } = await manager()
  if (!UUID.test(input.id)) return { error: t("errors.invalid_input") }
  const r = await updateTask(ctx.supabase, ctx.org.id, input.id, { checklist: input.checklist })
  return "error" in r ? { error: message(t, r) } : {}
}

export async function trashTaskAction(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.tasks", p_id: id(fd, "id") ?? "" })
  const to = backTo(fd, "/projects").replace(/([?&])task=[^&]*&?/, "$1").replace(/[?&]$/, "")
  back(to, error ? { error: dbError(t, error) } : { ok: t("projects.trashed") })
}

// ---------- board columns (setup) ----------

export async function saveStatusAction(fd: FormData) {
  const { ctx, t } = await manager()
  const r = await saveStatus(ctx.supabase, ctx.org.id, id(fd, "id"), { name: String(fd.get("name") ?? ""), color: String(fd.get("color") ?? "gray"), is_done: fd.get("is_done") === "on" })
  back(SETUP, "error" in r ? { error: message(t, r) } : { ok: t("projects.statusSaved") })
}

export async function deleteStatusAction(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.from("task_statuses").delete().eq("id", id(fd, "id") ?? "").eq("org_id", ctx.org.id)
  back(SETUP, error ? { error: error.code === "23503" ? t("projects.statusInUse") : dbError(t, error) } : { ok: t("projects.statusDeleted") })
}

/** Move a column one step left/right (swap positions with its neighbour). */
export async function moveStatusAction(fd: FormData) {
  const { ctx, t } = await manager()
  const { data: list } = await ctx.supabase.from("task_statuses").select("id, position").eq("org_id", ctx.org.id).order("position")
  const all = list ?? []
  const i = all.findIndex((s) => s.id === id(fd, "id"))
  const j = fd.get("dir") === "up" ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= all.length) back(SETUP, {})
  const order = [...all]
  ;[order[i], order[j]] = [order[j], order[i]]
  const results = await Promise.all(order.map((s, k) => ctx.supabase.from("task_statuses").update({ position: k }).eq("id", s.id).eq("org_id", ctx.org.id)))
  const failed = results.find((r) => r.error)?.error
  back(SETUP, failed ? { error: dbError(t, failed) } : {})
}
