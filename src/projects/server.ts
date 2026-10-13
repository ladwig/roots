// Projects, server side: tasks (create, change, move on the board, assignees, checklist) and the board's statuses.
// Shared by the App's actions and the API; callers check projects.manage, RLS checks again.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { readChecklist, readTask, STATUS_COLORS } from "./fields"

type Db = SupabaseClient<Database>
export type ProjectFail = { error: string; db?: { code?: string; message: string } }
const dbFail = (e: { code?: string; message: string }): ProjectFail => ({ error: "db", db: e })
export const TASK_COLS = "id, status_id, title, description, position, due_on, tags, checklist, completed_at, created_at, updated_at, task_assignees(user_id)"

/** New task at the end of its column (default: the first column). */
export async function createTask(db: Db, orgId: string, input: { title: string; statusId?: string | null; description?: string; due_on?: string | null; tags?: string[]; assignees?: string[] }): Promise<ProjectFail | { id: string }> {
  const r = readTask({ title: input.title, description: input.description, due_on: input.due_on ?? null, tags: input.tags ?? [] })
  if ("error" in r) return { error: r.error! }
  let statusId = input.statusId ?? null
  if (!statusId) statusId = (await db.from("task_statuses").select("id").eq("org_id", orgId).order("position").limit(1).maybeSingle()).data?.id ?? null
  if (!statusId) return { error: "projects.noStatuses" }
  const { data: last } = await db.from("tasks").select("position").eq("org_id", orgId).eq("status_id", statusId).is("deleted_at", null).order("position", { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await db
    .from("tasks")
    .insert({ org_id: orgId, status_id: statusId, ...r.row, title: r.row.title!, position: (last?.position ?? 0) + 1 })
    .select("id")
    .single()
  if (error || !data) return dbFail(error ?? { message: "insert failed" })
  if (input.assignees?.length) {
    const a = await setAssignees(db, orgId, data.id, input.assignees)
    if ("error" in a) return a
  }
  return { id: data.id }
}

/** Change fields (only those given). */
export async function updateTask(
  db: Db,
  orgId: string,
  id: string,
  input: { title?: string; description?: string; due_on?: string | null; tags?: string[]; statusId?: string; checklist?: unknown },
): Promise<ProjectFail | { id: string }> {
  const r = readTask(input)
  if ("error" in r) return { error: r.error! }
  const row = { ...r.row, ...(input.statusId && { status_id: input.statusId }), ...(input.checklist !== undefined && { checklist: readChecklist(input.checklist) }) }
  const { data, error } = await db.from("tasks").update(row).eq("id", id).eq("org_id", orgId).is("deleted_at", null).select("id").maybeSingle()
  if (error) return dbFail(error)
  return data ? { id } : { error: "errors.not_allowed" }
}

/** Board drag & drop: the task goes into `statusId`; `order` = the column's task ids top to bottom (renumbered). */
export async function moveTask(db: Db, orgId: string, id: string, statusId: string, order: string[]): Promise<ProjectFail | { id: string }> {
  const ids = [...new Set(order)].slice(0, 1000)
  if (!ids.includes(id)) ids.push(id)
  const { error } = await db.from("tasks").update({ status_id: statusId, position: ids.indexOf(id) }).eq("id", id).eq("org_id", orgId)
  if (error) return dbFail(error)
  await Promise.all(ids.filter((x) => x !== id).map((x, i) => db.from("tasks").update({ position: ids.indexOf(x) }).eq("id", x).eq("org_id", orgId).eq("status_id", statusId).then(() => i)))
  return { id }
}

/** Assignees = exactly these team members (others removed). */
export async function setAssignees(db: Db, orgId: string, taskId: string, userIds: string[]): Promise<ProjectFail | { id: string }> {
  const want = [...new Set(userIds)].slice(0, 20)
  const { data: cur } = await db.from("task_assignees").select("user_id").eq("task_id", taskId).eq("org_id", orgId)
  const have = (cur ?? []).map((a) => a.user_id)
  const drop = have.filter((u) => !want.includes(u))
  const add = want.filter((u) => !have.includes(u))
  if (drop.length) {
    const { error } = await db.from("task_assignees").delete().eq("task_id", taskId).eq("org_id", orgId).in("user_id", drop)
    if (error) return dbFail(error)
  }
  if (add.length) {
    const { error } = await db.from("task_assignees").insert(add.map((user_id) => ({ org_id: orgId, task_id: taskId, user_id })))
    if (error) return dbFail(error)
  }
  return { id: taskId }
}

/** A board column: name, colour, "done" flag; new ones go to the end. */
export async function saveStatus(db: Db, orgId: string, id: string | null, s: { name: string; color: string; is_done: boolean }): Promise<ProjectFail | { id: string }> {
  const name = s.name.trim().slice(0, 60)
  if (!name) return { error: "projects.nameRequired" }
  const color = (STATUS_COLORS as readonly string[]).includes(s.color) ? s.color : "gray"
  if (id) {
    const { error } = await db.from("task_statuses").update({ name, color, is_done: s.is_done }).eq("id", id).eq("org_id", orgId)
    return error ? dbFail(error) : { id }
  }
  const { data: last } = await db.from("task_statuses").select("position").eq("org_id", orgId).order("position", { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await db.from("task_statuses").insert({ org_id: orgId, name, color, is_done: s.is_done, position: (last?.position ?? -1) + 1 }).select("id").single()
  return error || !data ? dbFail(error ?? { message: "insert failed" }) : { id: data.id }
}
