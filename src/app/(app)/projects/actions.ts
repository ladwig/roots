"use server"

import { pickedIds, trashMany } from "@/lib/bulk"
import { revalidatePath } from "next/cache"
import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError, type T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { back } from "@/lib/url"
import { parseTags } from "@/app/(app)/contacts/fields"
import { loadFields, readCustom } from "@/lib/custom-fields"
import { addComment, addLink, createProject, createTask, moveProject, moveTask, saveStatus, setAssignees, updateProject, updateTask, type ProjectFail, type Scope } from "@/projects/server"

const UUID = /^[0-9a-f-]{36}$/
const SETUP = "/projects/settings"
const scopeOf = (fd: FormData): Scope => (fd.get("scope") === "project" ? "project" : "task")
const id = (fd: FormData, key: string) => (UUID.test(String(fd.get(key) ?? "")) ? String(fd.get(key)) : null)
const message = (t: T, f: ProjectFail) => (f.db ? dbError(t, f.db) : t.dynamic(f.error))
// Where the form came from (board / list / home), only App paths (no "//host").
const backTo = (fd: FormData, fallback: string) => {
  const b = String(fd.get("back") ?? "")
  return b.startsWith("/") && !b.startsWith("//") ? b : fallback
}

// Every change drops the client's cached /projects pages (staleTimes), so closing the panel shows the new state.
async function manager() {
  revalidatePath("/projects", "layout")
  revalidatePath("/")
  const ctx = await requirePerm("projects.manage")
  const t = await getT()
  if (!ctx.modules.has("projects")) back("/projects", { error: t("errors.not_allowed") })
  return { ctx, t }
}

/** Quick add at the bottom of a board column (or the list). */
export async function createTaskAction(fd: FormData) {
  const { ctx, t } = await manager()
  const to = backTo(fd, "/projects")
  const r = await createTask(ctx.supabase, ctx.org.id, { title: String(fd.get("title") ?? ""), statusId: id(fd, "status_id"), projectId: id(fd, "project_id"), tags: parseTags(String(fd.get("tags") ?? "")) })
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
  const c = readCustom(await loadFields(ctx.supabase, ctx.org.id, "tasks"), (k) => String(fd.get(`custom.${k}`) ?? ""))
  if ("error" in c) return { error: `${c.field}: ${t.dynamic(c.error)}` }
  const r = await updateTask(ctx.supabase, ctx.org.id, task, {
    title: String(fd.get("title") ?? ""),
    description: String(fd.get("description") ?? ""),
    start_on: String(fd.get("start_on") ?? "") || null,
    due_on: String(fd.get("due_on") ?? "") || null,
    tags: parseTags(String(fd.get("tags") ?? "")),
    statusId: id(fd, "status_id") ?? undefined,
    projectId: id(fd, "project_id"),
    custom: c.custom,
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
  const r = await saveStatus(ctx.supabase, ctx.org.id, id(fd, "id"), { name: String(fd.get("name") ?? ""), color: String(fd.get("color") ?? "gray"), is_done: fd.get("is_done") === "on" }, scopeOf(fd))
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
  const { data: list } = await ctx.supabase.from("task_statuses").select("id, position").eq("org_id", ctx.org.id).eq("scope", scopeOf(fd)).order("position")
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

/** Bulk bar on the task list: move the ticked tasks to another column, or to the trash. */
export async function bulkTasks(fd: FormData) {
  const { ctx, t } = await manager()
  const ids = pickedIds(fd)
  const to = backTo(fd, "/projects?view=list")
  if (!ids.length) back(to, {})
  if (fd.get("intent") === "trash") {
    const error = await trashMany(ctx, "public.tasks", ids)
    back(to, error ? { error: dbError(t, error) } : { ok: t("common.bulkTrashed", { count: ids.length }) })
  }
  const statusId = id(fd, "status_id")
  if (!statusId) back(to, { error: t("errors.invalid_input") })
  const results = await Promise.all(ids.map((x) => updateTask(ctx.supabase, ctx.org.id, x, { statusId })))
  const failed = results.find((r) => "error" in r)
  deliverSoon()
  back(to, failed && "error" in failed ? { error: message(t, failed) } : { ok: t("common.bulkDone", { count: ids.length }) })
}

/** Calendar drag & drop: the task's new due date (the day it was dropped on, Berlin time). */
export async function moveTaskDue(id: string, start: string): Promise<{ error?: string }> {
  const { ctx, t } = await manager()
  const day = new Date(start).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  if (!UUID.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: t("errors.invalid_input") }
  const r = await updateTask(ctx.supabase, ctx.org.id, id, { due_on: day })
  return "error" in r ? { error: message(t, r) } : {}
}

// ---------- projects ----------

const readProjectForm = async (ctx: Awaited<ReturnType<typeof manager>>["ctx"], fd: FormData) => {
  const c = readCustom(await loadFields(ctx.supabase, ctx.org.id, "projects"), (k) => String(fd.get(`custom.${k}`) ?? ""))
  return {
    c,
    input: {
      name: String(fd.get("name") ?? ""),
      description: String(fd.get("description") ?? ""),
      color: String(fd.get("color") ?? "blue"),
      start_on: String(fd.get("start_on") ?? "") || null,
      end_on: String(fd.get("end_on") ?? "") || null,
      statusId: id(fd, "status_id"),
      leadId: id(fd, "lead_id"),
    },
  }
}

/** /projects/new and the quick add on the project board → the new project's page. */
export async function createProjectAction(fd: FormData) {
  const { ctx, t } = await manager()
  const from = backTo(fd, "/projects/new")
  const { c, input } = await readProjectForm(ctx, fd)
  if ("error" in c) back(from, { error: `${c.field}: ${t.dynamic(c.error)}` })
  const r = await createProject(ctx.supabase, ctx.org.id, { ...input, custom: c.custom })
  if ("error" in r) back(from, { error: message(t, r) })
  back(`/projects/${r.id}`, { ok: t("projects.projectCreated") })
}

export async function updateProjectAction(fd: FormData) {
  const { ctx, t } = await manager()
  const project = id(fd, "id") ?? ""
  const { c, input } = await readProjectForm(ctx, fd)
  if ("error" in c) back(`/projects/${project}`, { error: `${c.field}: ${t.dynamic(c.error)}` })
  const r = await updateProject(ctx.supabase, ctx.org.id, project, { ...input, statusId: input.statusId ?? undefined, custom: c.custom })
  back(`/projects/${project}`, "error" in r ? { error: message(t, r) } : { ok: t("projects.saved") })
}

export async function moveProjectAction(input: { id: string; statusId: string; order: string[] }): Promise<{ error?: string }> {
  const { ctx, t } = await manager()
  if (!UUID.test(input.id) || !UUID.test(input.statusId)) return { error: t("errors.invalid_input") }
  const r = await moveProject(ctx.supabase, ctx.org.id, input.id, input.statusId, input.order.filter((x) => UUID.test(x)))
  return "error" in r ? { error: message(t, r) } : {}
}

export async function trashProjectAction(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.projects", p_id: id(fd, "id") ?? "" })
  back("/projects", error ? { error: dbError(t, error) } : { ok: t("projects.projectTrashed") })
}

export async function restoreProjectAction(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.projects", p_id: id(fd, "id") ?? "" })
  back("/projects?view=trash", error ? { error: dbError(t, error) } : { ok: t("projects.restored") })
}

// ---------- links ----------

export async function addLinkAction(input: { projectId: string; entity: string; entityId: string }): Promise<{ error?: string }> {
  const { ctx, t } = await manager()
  if (!UUID.test(input.projectId) || !UUID.test(input.entityId)) return { error: t("errors.invalid_input") }
  const r = await addLink(ctx.supabase, ctx.org.id, input.projectId, input.entity, input.entityId)
  return "error" in r ? { error: message(t, r) } : {}
}

export async function removeLinkAction(fd: FormData) {
  const { ctx, t } = await manager()
  const project = id(fd, "project_id") ?? ""
  const { error } = await ctx.supabase.from("project_links").delete().eq("id", id(fd, "id") ?? "").eq("org_id", ctx.org.id)
  back(`/projects/${project}#links`, error ? { error: dbError(t, error) } : {})
}

// ---------- comments (everyone who sees projects may comment) ----------

async function viewer() {
  revalidatePath("/projects", "layout")
  const ctx = await requirePerm("projects.view")
  const t = await getT()
  return { ctx, t }
}

export async function addCommentAction(fd: FormData) {
  const { ctx, t } = await viewer()
  const to = backTo(fd, "/projects")
  const r = await addComment(ctx.supabase, ctx.org.id, String(fd.get("entity") ?? ""), id(fd, "entity_id") ?? "", String(fd.get("body") ?? ""))
  back(to, "error" in r ? { error: message(t, r) } : {})
}

export async function deleteCommentAction(fd: FormData) {
  const { ctx, t } = await viewer()
  const to = backTo(fd, "/projects")
  const { error, count } = await ctx.supabase.from("comments").delete({ count: "exact" }).eq("id", id(fd, "id") ?? "").eq("org_id", ctx.org.id)
  back(to, error || !count ? { error: error ? dbError(t, error) : t("errors.not_allowed") } : {})
}
