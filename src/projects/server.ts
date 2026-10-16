// Projects, server side: projects, tasks (create, change, move on the board, assignees, checklist), the boards'
// columns (scope task / project), links from a project to other records, comments.
// Shared by the App's actions and the API; callers check projects.manage, RLS checks again.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { readChecklist, readProject, readTask, STATUS_COLORS } from "./fields"

type Db = SupabaseClient<Database>
export type ProjectFail = { error: string; db?: { code?: string; message: string } }
const dbFail = (e: { code?: string; message: string }): ProjectFail => ({ error: "db", db: e })
export const TASK_COLS = "id, status_id, project_id, title, description, position, start_on, due_on, tags, checklist, custom, completed_at, created_at, updated_at, task_assignees(user_id)"
export const PROJECT_COLS = "id, status_id, name, description, color, lead_id, start_on, end_on, position, custom, completed_at, created_at, updated_at"
type Custom = Database["public"]["Tables"]["tasks"]["Insert"]["custom"]
export type Scope = "task" | "project"

/** New task at the end of its column (default: the first column). */
export async function createTask(
  db: Db,
  orgId: string,
  input: { title: string; statusId?: string | null; projectId?: string | null; description?: string; start_on?: string | null; due_on?: string | null; tags?: string[]; assignees?: string[]; custom?: Record<string, unknown> },
): Promise<ProjectFail | { id: string }> {
  const r = readTask({ title: input.title, description: input.description, start_on: input.start_on ?? null, due_on: input.due_on ?? null, tags: input.tags ?? [] })
  if ("error" in r) return { error: r.error! }
  let statusId = input.statusId ?? null
  if (!statusId) statusId = await firstStatus(db, orgId, "task")
  if (!statusId) return { error: "projects.noStatuses" }
  const { data: last } = await db.from("tasks").select("position").eq("org_id", orgId).eq("status_id", statusId).is("deleted_at", null).order("position", { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await db
    .from("tasks")
    .insert({ org_id: orgId, status_id: statusId, project_id: input.projectId ?? null, ...r.row, title: r.row.title!, position: (last?.position ?? 0) + 1, custom: (input.custom ?? {}) as Custom })
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
  input: { title?: string; description?: string; start_on?: string | null; due_on?: string | null; tags?: string[]; statusId?: string; projectId?: string | null; checklist?: unknown; custom?: Record<string, unknown> },
): Promise<ProjectFail | { id: string }> {
  const r = readTask(input)
  if ("error" in r) return { error: r.error! }
  // One date alone keeps the other one valid (start after due → fail with a message, not a DB check error).
  if ((input.start_on !== undefined) !== (input.due_on !== undefined)) {
    const { data: cur } = await db.from("tasks").select("start_on, due_on").eq("id", id).eq("org_id", orgId).maybeSingle()
    const start = input.start_on !== undefined ? r.row.start_on : cur?.start_on
    const due = input.due_on !== undefined ? r.row.due_on : cur?.due_on
    if (start && due && due < start) return { error: "projects.dueBeforeStart" }
  }
  const row = {
    ...r.row,
    ...(input.statusId && { status_id: input.statusId }),
    ...(input.projectId !== undefined && { project_id: input.projectId }),
    ...(input.checklist !== undefined && { checklist: readChecklist(input.checklist) }),
    ...(input.custom !== undefined && { custom: input.custom as Custom }),
  }
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

const firstStatus = async (db: Db, orgId: string, scope: Scope) =>
  (await db.from("task_statuses").select("id").eq("org_id", orgId).eq("scope", scope).order("position").limit(1).maybeSingle()).data?.id ?? null

/** A board column (of tasks or projects): name, colour, "done" flag; new ones go to the end. */
export async function saveStatus(db: Db, orgId: string, id: string | null, s: { name: string; color: string; is_done: boolean }, scope: Scope = "task"): Promise<ProjectFail | { id: string }> {
  const name = s.name.trim().slice(0, 60)
  if (!name) return { error: "projects.nameRequired" }
  const color = (STATUS_COLORS as readonly string[]).includes(s.color) ? s.color : "gray"
  if (id) {
    const { error } = await db.from("task_statuses").update({ name, color, is_done: s.is_done }).eq("id", id).eq("org_id", orgId).eq("scope", scope)
    return error ? dbFail(error) : { id }
  }
  const { data: last } = await db.from("task_statuses").select("position").eq("org_id", orgId).eq("scope", scope).order("position", { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await db.from("task_statuses").insert({ org_id: orgId, scope, name, color, is_done: s.is_done, position: (last?.position ?? -1) + 1 }).select("id").single()
  return error || !data ? dbFail(error ?? { message: "insert failed" }) : { id: data.id }
}

// ---------- projects ----------

type ProjectInput = { name?: string; description?: string; color?: string; start_on?: string | null; end_on?: string | null; statusId?: string | null; leadId?: string | null; custom?: Record<string, unknown> }

/** New project at the end of its column (default: the first project column). */
export async function createProject(db: Db, orgId: string, input: ProjectInput & { name: string }): Promise<ProjectFail | { id: string }> {
  const r = readProject({ color: "blue", ...input })
  if ("error" in r) return { error: r.error! }
  const statusId = input.statusId || (await firstStatus(db, orgId, "project"))
  if (!statusId) return { error: "projects.noStatuses" }
  const { data: last } = await db.from("projects").select("position").eq("org_id", orgId).eq("status_id", statusId).is("deleted_at", null).order("position", { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await db
    .from("projects")
    .insert({ org_id: orgId, status_id: statusId, ...r.row, name: r.row.name!, lead_id: input.leadId ?? null, position: (last?.position ?? 0) + 1, custom: (input.custom ?? {}) as Custom })
    .select("id")
    .single()
  return error || !data ? dbFail(error ?? { message: "insert failed" }) : { id: data.id }
}

/** Change fields (only those given). */
export async function updateProject(db: Db, orgId: string, id: string, input: ProjectInput): Promise<ProjectFail | { id: string }> {
  const r = readProject(input)
  if ("error" in r) return { error: r.error! }
  if ((input.start_on !== undefined) !== (input.end_on !== undefined)) {
    const { data: cur } = await db.from("projects").select("start_on, end_on").eq("id", id).eq("org_id", orgId).maybeSingle()
    const start = input.start_on !== undefined ? r.row.start_on : cur?.start_on
    const end = input.end_on !== undefined ? r.row.end_on : cur?.end_on
    if (start && end && end < start) return { error: "projects.endBeforeStart" }
  }
  const row = {
    ...r.row,
    ...(input.statusId && { status_id: input.statusId }),
    ...(input.leadId !== undefined && { lead_id: input.leadId }),
    ...(input.custom !== undefined && { custom: input.custom as Custom }),
  }
  const { data, error } = await db.from("projects").update(row).eq("id", id).eq("org_id", orgId).is("deleted_at", null).select("id").maybeSingle()
  if (error) return dbFail(error)
  return data ? { id } : { error: "errors.not_allowed" }
}

/** Project board drag & drop, like moveTask. */
export async function moveProject(db: Db, orgId: string, id: string, statusId: string, order: string[]): Promise<ProjectFail | { id: string }> {
  const ids = [...new Set(order)].slice(0, 1000)
  if (!ids.includes(id)) ids.push(id)
  const { error } = await db.from("projects").update({ status_id: statusId, position: ids.indexOf(id) }).eq("id", id).eq("org_id", orgId)
  if (error) return dbFail(error)
  await Promise.all(ids.filter((x) => x !== id).map((x) => db.from("projects").update({ position: ids.indexOf(x) }).eq("id", x).eq("org_id", orgId).eq("status_id", statusId)))
  return { id }
}

// ---------- links: a project points to records elsewhere ----------

export const LINK_ENTITIES = ["wiki_pages", "events", "contacts", "courses", "rentals", "rental_objects", "documents", "forms"] as const
export type LinkEntity = (typeof LINK_ENTITIES)[number]
const person = (c: { first_name: string | null; last_name: string | null; company: string | null }) => [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || "–"

/** Title + App link of each linked record (records gone or not visible are left out). One query per kind, in parallel. */
export async function linkedRecords(db: Db, orgId: string, links: { id: string; entity: string; entity_id: string }[]) {
  const ids = (e: LinkEntity) => links.filter((l) => l.entity === e).map((l) => l.entity_id)
  const none = Promise.resolve({ data: [] as never[] })
  const q = <T,>(e: LinkEntity, run: (ids: string[]) => PromiseLike<{ data: T[] | null }>) => (ids(e).length ? run(ids(e)) : none)
  const [wiki, events, contacts, courses, rentals, objects, docs, forms] = await Promise.all([
    q("wiki_pages", (i) => db.from("wiki_pages").select("id, title").eq("org_id", orgId).in("id", i).is("deleted_at", null)),
    q("events", (i) => db.from("events").select("id, title").eq("org_id", orgId).in("id", i).is("deleted_at", null)),
    q("contacts", (i) => db.from("contacts").select("id, first_name, last_name, company").eq("org_id", orgId).in("id", i).is("deleted_at", null)),
    q("courses", (i) => db.from("courses").select("id, title").eq("org_id", orgId).in("id", i).is("deleted_at", null)),
    q("rentals", (i) => db.from("rentals").select("id, rental_objects(name)").eq("org_id", orgId).in("id", i).is("deleted_at", null)),
    q("rental_objects", (i) => db.from("rental_objects").select("id, name").eq("org_id", orgId).in("id", i).is("deleted_at", null)),
    q("documents", (i) => db.from("documents").select("id, kind, number, title").eq("org_id", orgId).in("id", i)),
    q("forms", (i) => db.from("forms").select("id, title").eq("org_id", orgId).in("id", i).is("deleted_at", null)),
  ])
  const found: Record<string, { title: string; href: string }> = {}
  for (const x of wiki.data ?? []) found[`wiki_pages:${x.id}`] = { title: x.title, href: `/wiki/${x.id}` }
  for (const x of events.data ?? []) found[`events:${x.id}`] = { title: x.title, href: `/events/${x.id}` }
  for (const x of contacts.data ?? []) found[`contacts:${x.id}`] = { title: person(x), href: `/contacts/${x.id}` }
  for (const x of courses.data ?? []) found[`courses:${x.id}`] = { title: x.title, href: `/courses/${x.id}` }
  for (const x of rentals.data ?? []) found[`rentals:${x.id}`] = { title: x.rental_objects?.name ?? "–", href: `/rentals/r/${x.id}` }
  for (const x of objects.data ?? []) found[`rental_objects:${x.id}`] = { title: x.name, href: `/rentals/${x.id}` }
  for (const x of docs.data ?? []) found[`documents:${x.id}`] = { title: [x.number, x.title].filter(Boolean).join(" · ") || x.kind, href: `/invoices/${x.id}` }
  for (const x of forms.data ?? []) found[`forms:${x.id}`] = { title: x.title, href: `/forms/${x.id}` }
  return links.flatMap((l) => (found[`${l.entity}:${l.entity_id}`] ? [{ ...l, ...found[`${l.entity}:${l.entity_id}`] }] : []))
}

export async function addLink(db: Db, orgId: string, projectId: string, entity: string, entityId: string): Promise<ProjectFail | { id: string }> {
  if (!(LINK_ENTITIES as readonly string[]).includes(entity)) return { error: "errors.invalid_input" }
  const { data, error } = await db.from("project_links").upsert({ org_id: orgId, project_id: projectId, entity, entity_id: entityId }, { onConflict: "project_id,entity,entity_id" }).select("id").single()
  return error || !data ? dbFail(error ?? { message: "insert failed" }) : { id: data.id }
}

// ---------- comments (projects, tasks) ----------

export const COMMENT_ENTITIES = ["projects", "tasks"] as const

export async function addComment(db: Db, orgId: string, entity: string, entityId: string, body: string): Promise<ProjectFail | { id: string }> {
  const text = body.replace(/\r\n/g, "\n").trim().slice(0, 10_000)
  if (!text) return { error: "projects.commentEmpty" }
  if (!(COMMENT_ENTITIES as readonly string[]).includes(entity)) return { error: "errors.invalid_input" }
  const { data, error } = await db.from("comments").insert({ org_id: orgId, entity, entity_id: entityId, body: text }).select("id").single()
  return error || !data ? dbFail(error ?? { message: "insert failed" }) : { id: data.id }
}
