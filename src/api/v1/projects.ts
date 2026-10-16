import { z } from "zod"
import { messages } from "@/i18n/config"
import { createT } from "@/i18n/translate"
import { loadFields, readCustomObject, type CustomEntity, type CustomValue } from "@/lib/custom-fields"
import { STATUS_COLORS } from "@/projects/fields"
import { addComment, addLink, COMMENT_ENTITIES, createProject, createTask, LINK_ENTITIES, linkedRecords, moveProject, moveTask, PROJECT_COLS, saveStatus, setAssignees, TASK_COLS, updateProject, updateTask, type ProjectFail } from "@/projects/server"
import { ApiError, dbError, endpoint, list, notFound, page, paged, uuid, type Endpoint } from "../core"
import { day, ts, type Db } from "./shared"

const TAG = "Projects"
const en = createT("en", messages.en)
function fail(f: ProjectFail): never {
  if (f.db) throw dbError(f.db)
  throw new ApiError(422, f.error.split(".").pop()!.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), en.dynamic(f.error))
}

const Scope = z.enum(["task", "project"]).describe("task = columns of the task board, project = states of projects (project board)")
const Status = z.object({ id: uuid, name: z.string(), color: z.enum(STATUS_COLORS), is_done: z.boolean().describe("Tasks / projects here count as completed"), position: z.number().int(), scope: Scope })
const STATUS_COLS = "id, name, color, is_done, position, scope"
const Custom = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).describe("Custom fields (GET /custom-fields?entity=tasks|projects): { key: value }")
// Custom field values through the same parser as the App's form.
async function custom(db: Db, orgId: string, entity: CustomEntity, values: Record<string, CustomValue | null> | undefined) {
  if (values === undefined) return undefined
  const c = readCustomObject(await loadFields(db, orgId, entity), values)
  if ("error" in c) throw new ApiError(422, c.error.split(".").pop()!, `${c.field}: ${en.dynamic(c.error)}`, { field: c.field })
  return c.custom
}
const ChecklistItem = z.object({ id: z.string(), text: z.string(), done: z.boolean() })
const Task = z.object({
  id: uuid,
  status_id: uuid,
  project_id: uuid.nullable(),
  title: z.string(),
  description: z.string(),
  position: z.number().describe("Order within the status column"),
  start_on: day.nullable(),
  due_on: day.nullable(),
  tags: z.array(z.string()),
  checklist: z.array(ChecklistItem).describe("Subtasks"),
  custom: z.record(z.string(), z.unknown()),
  assignees: z.array(uuid).describe("User ids (team members)"),
  completed_at: ts.nullable(),
  created_at: ts,
  updated_at: ts,
})
type Row = { task_assignees: { user_id: string }[]; checklist: unknown } & Record<string, unknown>
const shape = ({ task_assignees, ...r }: Row) => ({ ...r, checklist: Array.isArray(r.checklist) ? r.checklist : [], assignees: task_assignees.map((a) => a.user_id) }) as z.infer<typeof Task>

async function load(db: Db, orgId: string, id: string) {
  const { data } = await db.from("tasks").select(TASK_COLS).eq("id", id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
  if (!data) throw notFound()
  return shape(data)
}

const TaskInput = z.object({
  title: z.string().max(300),
  status_id: uuid.describe("Default: the first column"),
  project_id: uuid.nullable().describe("The project (GET /projects); null = none"),
  description: z.string().max(100_000),
  start_on: day.nullable(),
  due_on: day.nullable(),
  custom: Custom,
  tags: z.array(z.string().max(40)).max(20),
  checklist: z.array(z.object({ id: z.string().optional(), text: z.string().max(300), done: z.boolean().default(false) })).max(200),
  assignees: z.array(uuid).max(20).describe("Exactly these team members (user ids)"),
})

const Project = z.object({
  id: uuid,
  status_id: uuid.describe("Project state (GET /task-statuses?scope=project)"),
  name: z.string(),
  description: z.string().describe("Rich text (HTML)"),
  color: z.enum(STATUS_COLORS),
  lead_id: uuid.nullable().describe("User id of the person in charge (GET /team)"),
  start_on: day.nullable(),
  end_on: day.nullable(),
  position: z.number(),
  custom: z.record(z.string(), z.unknown()),
  completed_at: ts.nullable(),
  progress: z.object({ done: z.number().int(), total: z.number().int() }).describe("Tasks of the project"),
  created_at: ts,
  updated_at: ts,
})
const ProjectDetail = Project.extend({
  links: z.array(z.object({ id: uuid.describe("Link id (DELETE /project-links/{id})"), entity: z.enum(LINK_ENTITIES), entity_id: uuid, title: z.string(), href: z.string().describe("Path in the App") })),
})
const ProjectInput = z.object({
  name: z.string().max(200),
  description: z.string().max(200_000).describe("HTML (rich text) or plain text"),
  color: z.enum(STATUS_COLORS),
  status_id: uuid,
  lead_id: uuid.nullable(),
  start_on: day.nullable(),
  end_on: day.nullable(),
  custom: Custom,
})
const Comment = z.object({ id: uuid, entity: z.enum(COMMENT_ENTITIES), entity_id: uuid, body: z.string(), created_by: uuid.nullable(), created_at: ts })
const projectFields = (b: Partial<z.infer<typeof ProjectInput>>) => ({
  name: b.name,
  description: b.description,
  color: b.color,
  start_on: b.start_on,
  end_on: b.end_on,
  statusId: b.status_id,
  leadId: b.lead_id,
})
type ProjectRow = { id: string } & Record<string, unknown>
const withProgress = <P extends ProjectRow>(p: P, tasks: { project_id: string | null; completed_at: string | null }[]) => {
  const mine = tasks.filter((x) => x.project_id === p.id)
  return { ...p, progress: { done: mine.filter((x) => x.completed_at).length, total: mine.length } } as unknown as z.infer<typeof Project>
}
async function loadProject(db: Db, orgId: string, id: string) {
  const [{ data }, { data: links }, { data: tasks }] = await Promise.all([
    db.from("projects").select(PROJECT_COLS).eq("id", id).eq("org_id", orgId).is("deleted_at", null).maybeSingle(),
    db.from("project_links").select("id, entity, entity_id").eq("project_id", id).eq("org_id", orgId).order("created_at"),
    db.from("tasks").select("project_id, completed_at").eq("project_id", id).eq("org_id", orgId).is("deleted_at", null).limit(10000),
  ])
  if (!data) throw notFound()
  return { ...withProgress(data, tasks ?? []), links: await linkedRecords(db, orgId, links ?? []) } as z.infer<typeof ProjectDetail>
}

export const endpoints: Endpoint[] = [
  endpoint({
    method: "GET",
    path: "/task-statuses",
    permission: "projects.view",
    tag: TAG,
    summary: "List the columns of the task board (or the project states)",
    query: z.object({ scope: Scope.default("task") }),
    response: z.object({ data: z.array(Status) }),
    async handler({ db, orgId, query }) {
      const { data } = await db.from("task_statuses").select(STATUS_COLS).eq("org_id", orgId).eq("scope", query.scope).order("position")
      return { data: (data ?? []) as z.infer<typeof Status>[] }
    },
  }),
  endpoint({
    method: "POST",
    path: "/task-statuses",
    permission: "projects.manage",
    tag: TAG,
    summary: "Create a column (at the end)",
    body: z.object({ name: z.string().max(60), color: z.enum(STATUS_COLORS).default("gray"), is_done: z.boolean().default(false), scope: Scope.default("task") }).strict(),
    response: Status,
    status: 201,
    async handler({ db, orgId, body }) {
      const { scope, ...s } = body
      const r = await saveStatus(db, orgId, null, s, scope)
      if ("error" in r) fail(r)
      return (await db.from("task_statuses").select(STATUS_COLS).eq("id", r.id).single()).data as z.infer<typeof Status>
    },
  }),
  endpoint({
    method: "GET",
    path: "/tasks",
    permission: "projects.view",
    tag: TAG,
    summary: "List tasks",
    description: "Board order (column position, then position in the column).",
    query: page.extend({ status_id: uuid.optional(), project_id: z.union([uuid, z.literal("none")]).optional().describe("A project id, or none = tasks without project"), tag: z.string().optional(), assignee: uuid.optional(), q: z.string().max(100).optional() }),
    response: list(Task),
    async handler({ db, orgId, query }) {
      const cols = (query.assignee ? TASK_COLS.replace("task_assignees(user_id)", "task_assignees!inner(user_id)") : TASK_COLS) as typeof TASK_COLS
      let q = db.from("tasks").select(cols).eq("org_id", orgId).is("deleted_at", null).order("position").range(query.offset, query.offset + query.limit)
      if (query.assignee) q = q.eq("task_assignees.user_id", query.assignee)
      if (query.status_id) q = q.eq("status_id", query.status_id)
      if (query.project_id === "none") q = q.is("project_id", null)
      else if (query.project_id) q = q.eq("project_id", query.project_id)
      if (query.tag) q = q.contains("tags", [query.tag])
      const term = query.q?.replace(/[%,()*\\]/g, " ").trim()
      if (term) q = q.or(`title.ilike.%${term}%,description.ilike.%${term}%`)
      const { data } = await q
      return paged((data ?? []).map(shape), query)
    },
  }),
  endpoint({
    method: "GET",
    path: "/tasks/{id}",
    permission: "projects.view",
    tag: TAG,
    summary: "Get a task",
    response: Task,
    handler: ({ db, orgId, params }) => load(db, orgId, params.id),
  }),
  endpoint({
    method: "POST",
    path: "/tasks",
    permission: "projects.manage",
    tag: TAG,
    summary: "Create a task (at the end of its column)",
    description: "Emits `task.assigned` per assignee.",
    body: TaskInput.partial().required({ title: true }).strict(),
    response: Task,
    status: 201,
    async handler({ db, orgId, body }) {
      const r = await createTask(db, orgId, {
        title: body.title,
        statusId: body.status_id,
        projectId: body.project_id,
        description: body.description,
        start_on: body.start_on,
        due_on: body.due_on,
        tags: body.tags,
        assignees: body.assignees,
        custom: await custom(db, orgId, "tasks", body.custom),
      })
      if ("error" in r) fail(r)
      if (body.checklist) await updateTask(db, orgId, r.id, { checklist: body.checklist })
      return load(db, orgId, r.id)
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/tasks/{id}",
    permission: "projects.manage",
    tag: TAG,
    summary: "Change a task",
    description: "Only the fields given. A status with `is_done` sets `completed_at` and emits `task.completed`.",
    body: TaskInput.partial().strict(),
    response: Task,
    async handler({ db, orgId, params, body }) {
      await load(db, orgId, params.id)
      const { assignees, status_id, project_id, custom: values, ...rest } = body
      const r = await updateTask(db, orgId, params.id, { ...rest, statusId: status_id, projectId: project_id, custom: await custom(db, orgId, "tasks", values) })
      if ("error" in r) fail(r)
      if (assignees) {
        const a = await setAssignees(db, orgId, params.id, assignees)
        if ("error" in a) fail(a)
      }
      return load(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/tasks/{id}/move",
    permission: "projects.manage",
    tag: TAG,
    summary: "Move a task on the board",
    description: "Into `status_id`; `order` = that column's task ids top to bottom (the column is renumbered).",
    body: z.object({ status_id: uuid, order: z.array(uuid).max(1000).default([]) }).strict(),
    response: Task,
    async handler({ db, orgId, params, body }) {
      await load(db, orgId, params.id)
      const r = await moveTask(db, orgId, params.id, body.status_id, body.order)
      if ("error" in r) fail(r)
      return load(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/tasks/{id}",
    permission: "projects.manage",
    tag: TAG,
    summary: "Move a task to the trash",
    description: "Restorable for 30 days in the App.",
    response: z.object({ id: uuid }),
    async handler({ db, orgId, params }) {
      await load(db, orgId, params.id)
      const { error } = await db.rpc("soft_delete", { p_table: "public.tasks", p_id: params.id })
      if (error) throw dbError(error)
      return { id: params.id }
    },
  }),

  // ---------- projects ----------
  endpoint({
    method: "GET",
    path: "/projects",
    permission: "projects.view",
    tag: TAG,
    summary: "List projects",
    description: "Board order. `progress` = done / all tasks of the project.",
    query: page.extend({ status_id: uuid.optional(), lead_id: uuid.optional(), q: z.string().max(100).optional() }),
    response: list(Project),
    async handler({ db, orgId, query }) {
      let q = db.from("projects").select(PROJECT_COLS).eq("org_id", orgId).is("deleted_at", null).order("position").range(query.offset, query.offset + query.limit)
      if (query.status_id) q = q.eq("status_id", query.status_id)
      if (query.lead_id) q = q.eq("lead_id", query.lead_id)
      const term = query.q?.replace(/[%,()*\\]/g, " ").trim()
      if (term) q = q.ilike("name", `%${term}%`)
      const { data } = await q
      const ids = (data ?? []).map((p) => p.id)
      const { data: tasks } = ids.length ? await db.from("tasks").select("project_id, completed_at").eq("org_id", orgId).in("project_id", ids).is("deleted_at", null).limit(10000) : { data: [] }
      return paged((data ?? []).map((p) => withProgress(p, tasks ?? [])), query)
    },
  }),
  endpoint({
    method: "GET",
    path: "/projects/{id}",
    permission: "projects.view",
    tag: TAG,
    summary: "Get a project",
    description: "With its links (title + App path of each linked record). Its tasks: GET /tasks?project_id=….",
    response: ProjectDetail,
    handler: ({ db, orgId, params }) => loadProject(db, orgId, params.id),
  }),
  endpoint({
    method: "POST",
    path: "/projects",
    permission: "projects.manage",
    tag: TAG,
    summary: "Create a project",
    description: "Into `status_id` (a project state, GET /task-statuses?scope=project; default: the first). Description is HTML (rich text). Then add tasks with POST /tasks { project_id }.",
    body: ProjectInput.partial().required({ name: true }).strict(),
    response: ProjectDetail,
    status: 201,
    async handler({ db, orgId, body }) {
      const r = await createProject(db, orgId, { ...projectFields(body), name: body.name, custom: await custom(db, orgId, "projects", body.custom) })
      if ("error" in r) fail(r)
      return loadProject(db, orgId, r.id)
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/projects/{id}",
    permission: "projects.manage",
    tag: TAG,
    summary: "Change a project",
    description: "Only the fields given. A state with `is_done` sets `completed_at`.",
    body: ProjectInput.partial().strict(),
    response: ProjectDetail,
    async handler({ db, orgId, params, body }) {
      await loadProject(db, orgId, params.id)
      const r = await updateProject(db, orgId, params.id, { ...projectFields(body), custom: await custom(db, orgId, "projects", body.custom) })
      if ("error" in r) fail(r)
      return loadProject(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/projects/{id}/move",
    permission: "projects.manage",
    tag: TAG,
    summary: "Move a project on the project board",
    description: "Into `status_id`; `order` = that column's project ids top to bottom.",
    body: z.object({ status_id: uuid, order: z.array(uuid).max(1000).default([]) }).strict(),
    response: ProjectDetail,
    async handler({ db, orgId, params, body }) {
      await loadProject(db, orgId, params.id)
      const r = await moveProject(db, orgId, params.id, body.status_id, body.order)
      if ("error" in r) fail(r)
      return loadProject(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/projects/{id}",
    permission: "projects.manage",
    tag: TAG,
    summary: "Move a project to the trash",
    description: "Restorable for 30 days (POST /projects/{id}/restore). Its tasks stay.",
    response: z.object({ id: uuid }),
    async handler({ db, orgId, params }) {
      await loadProject(db, orgId, params.id)
      const { error } = await db.rpc("soft_delete", { p_table: "public.projects", p_id: params.id })
      if (error) throw dbError(error)
      return { id: params.id }
    },
  }),
  endpoint({
    method: "POST",
    path: "/projects/{id}/restore",
    permission: "projects.manage",
    tag: TAG,
    summary: "Restore a project from the trash",
    response: ProjectDetail,
    async handler({ db, orgId, params }) {
      const { data } = await db.from("projects").select("id").eq("id", params.id).eq("org_id", orgId).not("deleted_at", "is", null).maybeSingle()
      if (!data) throw notFound()
      const { error } = await db.rpc("restore_deleted", { p_table: "public.projects", p_id: params.id })
      if (error) throw dbError(error)
      return loadProject(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/projects/{id}/links",
    permission: "projects.manage",
    tag: TAG,
    summary: "Link a record to a project",
    description: "Wiki page, event, contact, course, rental, rental object, invoice/quote (documents) or form of this organisation. Linking twice is fine.",
    body: z.object({ entity: z.enum(LINK_ENTITIES), entity_id: uuid }).strict(),
    response: ProjectDetail,
    status: 201,
    async handler({ db, orgId, params, body }) {
      await loadProject(db, orgId, params.id)
      const r = await addLink(db, orgId, params.id, body.entity, body.entity_id)
      if ("error" in r) fail(r.db?.message === "not_allowed" ? { error: "errors.not_allowed" } : r)
      return loadProject(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/project-links/{id}",
    permission: "projects.manage",
    tag: TAG,
    summary: "Remove a link from a project",
    description: "Only the link; the record stays.",
    response: z.object({ id: uuid }),
    async handler({ db, orgId, params }) {
      const { error, count } = await db.from("project_links").delete({ count: "exact" }).eq("id", params.id).eq("org_id", orgId)
      if (error) throw dbError(error)
      if (!count) throw notFound()
      return { id: params.id }
    },
  }),

  // ---------- comments (projects, tasks) ----------
  endpoint({
    method: "GET",
    path: "/comments",
    permission: "projects.view",
    tag: TAG,
    summary: "List the comments on a project or task",
    description: "Newest first. `created_by` = user id (GET /team).",
    query: z.object({ entity: z.enum(COMMENT_ENTITIES), entity_id: uuid }),
    response: z.object({ data: z.array(Comment) }),
    async handler({ db, orgId, query }) {
      const { data } = await db.from("comments").select("id, entity, entity_id, body, created_by, created_at").eq("org_id", orgId).eq("entity", query.entity).eq("entity_id", query.entity_id).order("created_at", { ascending: false }).limit(200)
      return { data: (data ?? []) as z.infer<typeof Comment>[] }
    },
  }),
  endpoint({
    method: "POST",
    path: "/comments",
    permission: "projects.view",
    tag: TAG,
    summary: "Comment on a project or task",
    description: "Plain text, shown in the record's activity in the App, attributed to the key's creator / the connected person.",
    body: z.object({ entity: z.enum(COMMENT_ENTITIES), entity_id: uuid, body: z.string().min(1).max(10_000) }).strict(),
    response: Comment,
    status: 201,
    async handler({ db, orgId, body }) {
      const r = await addComment(db, orgId, body.entity, body.entity_id, body.body)
      if ("error" in r) fail(r.db?.message === "not_allowed" ? { error: "errors.not_allowed" } : r)
      return (await db.from("comments").select("id, entity, entity_id, body, created_by, created_at").eq("id", r.id).single()).data as z.infer<typeof Comment>
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/comments/{id}",
    permission: "projects.manage",
    tag: TAG,
    summary: "Delete a comment",
    response: z.object({ id: uuid }),
    async handler({ db, orgId, params }) {
      const { error, count } = await db.from("comments").delete({ count: "exact" }).eq("id", params.id).eq("org_id", orgId)
      if (error) throw dbError(error)
      if (!count) throw notFound()
      return { id: params.id }
    },
  }),
]
